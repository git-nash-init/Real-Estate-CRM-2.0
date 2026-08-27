import 'dotenv/config';
import express from 'express';
import QRCode from 'qrcode';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import makeWASocket, { DisconnectReason, Browsers } from '@whiskeysockets/baileys';
import { createClient } from '@supabase/supabase-js';
import { useSupabaseAuthState } from './supabaseAuthState.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY; // shared secret for the HTTP API
const PORT = process.env.PORT || 3100;

// Throttling: randomised gap between sends, and a hard daily cap. Baileys is
// an unofficial client — sending too fast or too many messages risks the
// connected number being banned. These are conservative defaults; tune via
// env vars once real send volume is known.
const MIN_GAP_MS = Number(process.env.WA_MIN_GAP_MS || 8000);
const MAX_GAP_MS = Number(process.env.WA_MAX_GAP_MS || 15000);
const DAILY_CAP = Number(process.env.WA_DAILY_CAP || 200);
const POLL_INTERVAL_MS = Number(process.env.WA_POLL_INTERVAL_MS || 5000);
const HEARTBEAT_INTERVAL_MS = Number(process.env.WA_HEARTBEAT_INTERVAL_MS || 3000);
const SESSION_ROW_ID = 'default';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  logger.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. See .env.example.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

let sock = null;
let currentQr = null;
let connectionState = 'connecting'; // connecting | open | close
let loggedOut = false;
let connectedPhone = null;
let manualLogoutRequested = false;

// ---- Live status: the CRM reads this table instead of calling the
// gateway's HTTP API directly, so the browser never needs the gateway's
// API key or a CORS-open endpoint. ---------------------------------------

async function pushStatusHeartbeat() {
  const status = loggedOut
    ? 'logged_out'
    : connectionState === 'open'
      ? 'open'
      : currentQr
        ? 'qr_pending'
        : 'connecting';

  const qrDataUrl = currentQr ? await QRCode.toDataURL(currentQr) : null;

  const { error } = await supabase
    .from('whatsapp_session')
    .upsert({
      id: SESSION_ROW_ID,
      status,
      qr_data_url: qrDataUrl,
      connected_phone: connectedPhone,
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  if (error) logger.error({ error }, 'Failed to push status heartbeat');
}

async function checkForCommands() {
  const { data, error } = await supabase
    .from('whatsapp_session')
    .select('pending_command')
    .eq('id', SESSION_ROW_ID)
    .maybeSingle();
  if (error) {
    logger.error({ error }, 'Failed to check for pending commands');
    return;
  }
  if (data?.pending_command === 'logout') {
    logger.warn('Logout requested from the CRM — logging out and clearing the session.');
    manualLogoutRequested = true;
    // Clear the command immediately so it doesn't re-trigger.
    await supabase.from('whatsapp_session').update({ pending_command: null }).eq('id', SESSION_ROW_ID);
    try {
      await sock?.logout();
    } catch (err) {
      logger.warn({ err: err.message }, 'sock.logout() threw (often expected if already disconnected)');
    }
  }
}

async function heartbeatLoop() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await pushStatusHeartbeat();
    await checkForCommands();
    await new Promise((r) => setTimeout(r, HEARTBEAT_INTERVAL_MS));
  }
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useSupabaseAuthState(supabase);

  sock = makeWASocket({
    auth: state,
    browser: Browsers.ubuntu('CRM WhatsApp Gateway'),
    logger,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQr = qr;
      logger.info('New QR code generated — visible live on the CRM Settings > WhatsApp page.');
    }

    if (connection === 'open') {
      connectionState = 'open';
      currentQr = null;
      loggedOut = false;
      connectedPhone = sock?.user?.id?.split(':')[0] || sock?.user?.id || null;
      logger.info({ connectedPhone }, 'WhatsApp connection open');
    } else if (connection === 'close') {
      connectionState = 'close';
      const statusCode = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode
        : undefined;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut || manualLogoutRequested;
      logger.warn({ statusCode, isLoggedOut }, 'Connection closed');

      if (isLoggedOut) {
        loggedOut = true;
        connectedPhone = null;
        manualLogoutRequested = false;
        // Clear the persisted session so the next boot starts a genuinely
        // fresh pairing (a stale session would otherwise be reloaded and
        // immediately rejected by WhatsApp).
        await supabase.from('whatsapp_auth_state').delete().eq('session_id', 'default');
        logger.warn('Session cleared — reconnecting to generate a fresh QR code.');
        setTimeout(connectToWhatsApp, 2000);
      } else {
        // Any other disconnect (including the QR-scan-timeout 408 Baileys
        // raises after a few unscanned refreshes) — just reconnect, which
        // generates a new QR automatically. The CRM's live view means a
        // human is far more likely to actually see and scan it in time now.
        setTimeout(connectToWhatsApp, 3000);
      }
    }
  });
}

function randomDelay() {
  return MIN_GAP_MS + Math.floor(Math.random() * (MAX_GAP_MS - MIN_GAP_MS));
}

function toJid(phone) {
  const digits = phone.replace(/[^0-9]/g, '');
  return `${digits}@s.whatsapp.net`;
}

const ATTACHMENT_BUCKET = 'whatsapp-attachments';

// Builds the Baileys message payload(s) for an outbox row. Returns an
// ARRAY because one logical message can need two WhatsApp sends (see the
// audio case below). Text-only rows behave exactly as before; rows with a
// media_path get the file attached with the message as its caption.
//
// The attachments bucket is private, so the file is fetched through a
// short-lived signed URL rather than a public link — otherwise every file
// ever sent to a lead would be readable by anyone who guessed the URL.
// Baileys accepts { url } and streams it itself, so the gateway never has
// to buffer the whole file in memory.
//
// If the attachment can't be resolved we deliberately throw rather than
// silently downgrading to a text-only send: a message whose whole point
// was the attached brochure/price list is worse than a visible failure,
// because the row would be marked 'sent' and nobody would know the file
// never arrived.
async function buildMessagePayloads(row) {
  if (!row.media_path) {
    return [{ text: row.message }];
  }

  const { data, error } = await supabase
    .storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(row.media_path, 600);

  if (error || !data?.signedUrl) {
    throw new Error(`Could not resolve attachment "${row.media_path}": ${error?.message || 'no signed URL returned'}`);
  }

  const url = data.signedUrl;
  const caption = row.message || undefined;
  const filename = row.media_filename || 'attachment';

  switch (row.media_type) {
    case 'image':
      return [{ image: { url }, caption }];
    case 'video':
      return [{ video: { url }, caption }];
    case 'audio': {
      // WhatsApp audio messages cannot carry a caption. Send the text as
      // its own message rather than dropping it — otherwise the recipient
      // gets a bare voice note with no context, and the sender has no way
      // to know their text was discarded.
      const payloads = [{ audio: { url }, mimetype: 'audio/mp4' }];
      if (caption) payloads.unshift({ text: caption });
      return payloads;
    }
    default:
      return [{ document: { url }, fileName: filename, caption }];
  }
}

async function sentToday() {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from('whatsapp_outbox')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent')
    .gte('sent_at', startOfDay.toISOString());
  if (error) {
    logger.error({ error }, 'Failed to count sends today');
    return 0;
  }
  return count || 0;
}

async function processOutboxOnce() {
  if (connectionState !== 'open' || !sock) return;

  const sentSoFarToday = await sentToday();
  if (sentSoFarToday >= DAILY_CAP) {
    logger.warn({ sentSoFarToday, DAILY_CAP }, 'Daily send cap reached — pausing until tomorrow');
    return;
  }

  const { data: rows, error } = await supabase
    .from('whatsapp_outbox')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    logger.error({ error }, 'Failed to poll outbox');
    return;
  }
  if (!rows || rows.length === 0) return;

  const row = rows[0];

  // Claim the row (best-effort — this gateway is expected to run as a
  // single instance, so a race here is unlikely, but the conditional
  // update guards against a double-send if two instances are ever run).
  const { data: claimed, error: claimErr } = await supabase
    .from('whatsapp_outbox')
    .update({ status: 'sending', attempts: row.attempts + 1 })
    .eq('id', row.id)
    .eq('status', 'queued')
    .select()
    .maybeSingle();

  if (claimErr || !claimed) return;

  try {
    const jid = toJid(claimed.to_phone);
    for (const payload of await buildMessagePayloads(claimed)) {
      await sock.sendMessage(jid, payload);
    }
    await supabase
      .from('whatsapp_outbox')
      .update({ status: 'sent', sent_at: new Date().toISOString(), error: null })
      .eq('id', claimed.id);
    logger.info({ id: claimed.id, to: claimed.to_phone }, 'Message sent');
  } catch (err) {
    const isRateLimited = err?.output?.statusCode === 429;
    logger.error({ id: claimed.id, err: err.message, isRateLimited }, 'Send failed');
    await supabase
      .from('whatsapp_outbox')
      .update({ status: 'failed', error: err.message })
      .eq('id', claimed.id);
    if (isRateLimited) {
      // Back off harder than the normal gap on a 429.
      await new Promise((r) => setTimeout(r, 60000));
    }
  }
}

async function outboxWorkerLoop() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await processOutboxOnce();
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS + randomDelay()));
  }
}

// ---- HTTP API (optional — the CRM uses Supabase directly, not this) ----

const app = express();
app.use(express.json());

function requireApiKey(req, res, next) {
  if (!GATEWAY_API_KEY) return next(); // no key configured — open (dev only)
  const key = req.header('x-api-key');
  if (key !== GATEWAY_API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing x-api-key header' });
  }
  next();
}

app.get('/status', requireApiKey, (_req, res) => {
  res.json({ connectionState, hasQr: !!currentQr, connectedPhone, loggedOut });
});

app.get('/qr', requireApiKey, async (_req, res) => {
  if (!currentQr) {
    return res.status(404).json({ error: 'No QR pending — already connected, or not yet generated.' });
  }
  const dataUrl = await QRCode.toDataURL(currentQr);
  res.json({ qr: dataUrl });
});

app.post('/logout', requireApiKey, async (_req, res) => {
  manualLogoutRequested = true;
  try {
    await sock?.logout();
  } catch (err) {
    logger.warn({ err: err.message }, 'sock.logout() threw');
  }
  res.json({ ok: true });
});

// Convenience endpoint — mirrors what writing directly to whatsapp_outbox
// via Supabase does. Most of the CRM should just insert into the outbox
// table directly (it already has a Supabase connection); this exists for
// external callers that don't.
app.post('/send', requireApiKey, async (req, res) => {
  const { to, message } = req.body || {};
  if (!to || !message) {
    return res.status(400).json({ error: 'Both "to" and "message" are required.' });
  }
  const { data, error } = await supabase
    .from('whatsapp_outbox')
    .insert([{ to_phone: to, message, status: 'queued' }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(202).json({ queued: data });
});

app.listen(PORT, () => {
  logger.info(`WhatsApp gateway HTTP API listening on :${PORT}`);
});

connectToWhatsApp();
outboxWorkerLoop();
heartbeatLoop();
