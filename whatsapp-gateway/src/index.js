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

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  logger.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. See .env.example.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

let sock = null;
let currentQr = null;
let connectionState = 'connecting'; // connecting | open | close

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
      logger.info('New QR code generated — scan via GET /qr');
    }

    if (connection === 'open') {
      connectionState = 'open';
      currentQr = null;
      logger.info('WhatsApp connection open');
    } else if (connection === 'close') {
      connectionState = 'close';
      const statusCode = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode
        : undefined;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      logger.warn({ statusCode }, 'Connection closed');
      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 3000);
      } else {
        logger.error('Logged out — a fresh QR scan is required. Restart the gateway.');
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
    await sock.sendMessage(toJid(claimed.to_phone), { text: claimed.message });
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

// ---- HTTP API ---------------------------------------------------------

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
  res.json({ connectionState, hasQr: !!currentQr });
});

app.get('/qr', requireApiKey, async (_req, res) => {
  if (!currentQr) {
    return res.status(404).json({ error: 'No QR pending — already connected, or not yet generated.' });
  }
  const dataUrl = await QRCode.toDataURL(currentQr);
  res.json({ qr: dataUrl });
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
