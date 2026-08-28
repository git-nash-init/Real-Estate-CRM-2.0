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

const MIN_GAP_MS = Number(process.env.WA_MIN_GAP_MS || 8000);
const MAX_GAP_MS = Number(process.env.WA_MAX_GAP_MS || 15000);
const DAILY_CAP = Number(process.env.WA_DAILY_CAP || 200);
const POLL_INTERVAL_MS = Number(process.env.WA_POLL_INTERVAL_MS || 5000);
const HEARTBEAT_INTERVAL_MS = Number(process.env.WA_HEARTBEAT_INTERVAL_MS || 3000);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  logger.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. See .env.example.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Multi-session map
// Key: userId (string)
// Value: { sock, currentQr, connectionState, loggedOut, connectedPhone, manualLogoutRequested }
const sessions = new Map();

async function pushStatusHeartbeat() {
  const upserts = [];
  for (const [userId, session] of sessions.entries()) {
    const status = session.connectionState === 'open'
      ? 'open'
      : session.currentQr
        ? 'qr_pending'
        : session.loggedOut
          ? 'logged_out'
          : 'connecting';

    const qrDataUrl = session.currentQr ? await QRCode.toDataURL(session.currentQr) : null;

    upserts.push({
      id: userId,
      status,
      qr_data_url: qrDataUrl,
      connected_phone: session.connectedPhone,
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  if (upserts.length > 0) {
    const { error } = await supabase.from('whatsapp_session').upsert(upserts);
    if (error) logger.error({ error }, 'Failed to push status heartbeat');
  }
}

async function checkForCommandsAndNewSessions() {
  // 1. Fetch all sessions from DB to see if any new ones need connecting
  const { data: dbSessions, error } = await supabase
    .from('whatsapp_session')
    .select('id, pending_command, status');

  if (error) {
    logger.error({ error }, 'Failed to check for pending commands and new sessions');
    return;
  }

  for (const dbSession of dbSessions) {
    const userId = dbSession.id;
    const s = sessions.get(userId);

    // Handle logout command
    if (dbSession.pending_command === 'logout') {
      logger.warn({ userId }, 'Logout requested from the CRM — logging out and clearing the session.');
      if (s) {
        s.manualLogoutRequested = true;
      }
      await supabase.from('whatsapp_session').update({ pending_command: null }).eq('id', userId);
      try {
        await s?.sock?.logout();
      } catch (err) {
        logger.warn({ userId, err: err.message }, 'sock.logout() threw (often expected if already disconnected)');
      }
    }

    // Connect if status is connecting and we don't have it in memory
    if ((dbSession.status === 'connecting' || dbSession.status === 'open') && !sessions.has(userId)) {
      logger.info({ userId }, 'Starting new session from DB trigger');
      connectToWhatsApp(userId);
    }
  }
}

async function heartbeatLoop() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await pushStatusHeartbeat();
    await checkForCommandsAndNewSessions();
    await new Promise((r) => setTimeout(r, HEARTBEAT_INTERVAL_MS));
  }
}

async function connectToWhatsApp(userId) {
  // Initialize session state
  const session = {
    sock: null,
    currentQr: null,
    connectionState: 'connecting',
    loggedOut: false,
    connectedPhone: null,
    manualLogoutRequested: false,
  };
  sessions.set(userId, session);

  const { state, saveCreds } = await useSupabaseAuthState(supabase, userId);

  session.sock = makeWASocket({
    auth: state,
    browser: Browsers.ubuntu('CRM WhatsApp Gateway'),
    logger: pino({ level: 'silent' }), // Reduce noise per session
  });

  session.sock.ev.on('creds.update', saveCreds);

  session.sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      session.currentQr = qr;
      session.loggedOut = false;
      logger.info({ userId }, 'New QR code generated');
    }

    if (connection === 'open') {
      session.connectionState = 'open';
      session.currentQr = null;
      session.loggedOut = false;
      session.connectedPhone = session.sock?.user?.id?.split(':')[0] || session.sock?.user?.id || null;
      logger.info({ userId, connectedPhone: session.connectedPhone }, 'WhatsApp connection open');
    } else if (connection === 'close') {
      session.connectionState = 'close';
      const statusCode = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode
        : undefined;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut || session.manualLogoutRequested;
      logger.warn({ userId, statusCode, isLoggedOut }, 'Connection closed');

      if (isLoggedOut) {
        session.loggedOut = true;
        session.connectedPhone = null;
        session.manualLogoutRequested = false;
        await supabase.from('whatsapp_auth_state').delete().eq('session_id', userId);
        logger.warn({ userId }, 'Session cleared — reconnecting to generate a fresh QR code.');
        setTimeout(() => connectToWhatsApp(userId), 2000);
      } else {
        setTimeout(() => connectToWhatsApp(userId), 3000);
      }
    }
  });
}

function randomDelay() {
  return MIN_GAP_MS + Math.floor(Math.random() * (MAX_GAP_MS - MIN_GAP_MS));
}

function toJid(phone) {
  let digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  return `${digits}@s.whatsapp.net`;
}

const ATTACHMENT_BUCKET = 'whatsapp-attachments';

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
  const senderUserId = row.created_by;

  if (!senderUserId) {
    logger.error({ id: row.id }, 'Message has no created_by user_id, marking as failed');
    await supabase.from('whatsapp_outbox').update({ status: 'failed', error: 'No sender (created_by) assigned' }).eq('id', row.id);
    return;
  }

  const session = sessions.get(senderUserId);
  if (!session || session.connectionState !== 'open' || !session.sock) {
    logger.warn({ id: row.id, senderUserId }, 'Sender session is not open, skipping message for now');
    return;
  }

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
      await session.sock.sendMessage(jid, payload);
    }
    await supabase
      .from('whatsapp_outbox')
      .update({ status: 'sent', sent_at: new Date().toISOString(), error: null })
      .eq('id', claimed.id);
    logger.info({ id: claimed.id, to: claimed.to_phone, sender: senderUserId }, 'Message sent');
  } catch (err) {
    const isRateLimited = err?.output?.statusCode === 429;
    logger.error({ id: claimed.id, err: err.message, isRateLimited }, 'Send failed');
    await supabase
      .from('whatsapp_outbox')
      .update({ status: 'failed', error: err.message })
      .eq('id', claimed.id);
    if (isRateLimited) {
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

// HTTP API (optional)
const app = express();
app.use(express.json());

app.get('/', (_req, res) => res.status(200).send('WhatsApp Gateway is active'));
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok', uptime: process.uptime(), sessions: sessions.size }));

app.listen(PORT, () => {
  logger.info(`WhatsApp gateway HTTP API listening on :${PORT}`);
});

// Boot all existing sessions that are connected or connecting
async function bootInitialSessions() {
  const { data, error } = await supabase
    .from('whatsapp_session')
    .select('id, status');
  if (data) {
    for (const row of data) {
      if (row.status === 'open' || row.status === 'connecting' || row.status === 'qr_pending') {
        connectToWhatsApp(row.id);
      }
    }
  }
}

bootInitialSessions();
outboxWorkerLoop();
heartbeatLoop();
