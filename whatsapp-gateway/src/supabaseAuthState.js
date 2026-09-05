import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { useMultiFileAuthState } from '@whiskeysockets/baileys';

/**
 * Persists Baileys' multi-file auth state (creds.json + per-key signal
 * files) into Supabase instead of leaving it only on local disk. Free-tier
 * hosts (Fly.io/Render) can wipe or restart the container between deploys
 * — without this, every restart would force re-scanning the QR code. On
 * boot we rehydrate a local temp folder from Supabase, let Baileys' own
 * useMultiFileAuthState manage it as normal, then mirror any changed files
 * back to Supabase on every creds.update.
 *
 * v2: the original version re-uploaded the ENTIRE auth folder as one
 * base64 JSON blob on every creds.update. That fires constantly (every
 * message, every key rotation), and the folder grows over a session's
 * lifetime — confirmed live at 827 files / 423 kB for one account. Firing
 * dozens of those uploads a minute silently overwhelmed persistence (only
 * console.error'd, never surfaced), so sessions were never actually saved
 * and every restart meant re-pairing from scratch.
 *
 * This version stores one row per file (public.whatsapp_auth_files),
 * writes only files whose content actually changed, debounces bursts of
 * creds.update into a single flush, and reports success/failure onto
 * whatsapp_session (auth_persisted_at / auth_persist_error) so a failure
 * is visible in the CRM instead of only in server logs.
 *
 * Deliberately doesn't reimplement Baileys' on-disk format — it just
 * mirrors whatever files useMultiFileAuthState already writes, so it stays
 * compatible across Baileys versions without extra maintenance.
 */
export async function useSupabaseAuthState(supabase, sessionId = 'default') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baileys-auth-'));

  // Migrate the old single-blob format if this session only ever exists
  // there (whatsapp_auth_state) and hasn't been split into per-file rows
  // yet -- keeps existing paired sessions from being forced to re-scan.
  const { data: fileRows, error: fileRowsErr } = await supabase
    .from('whatsapp_auth_files')
    .select('filename, content')
    .eq('session_id', sessionId);
  if (fileRowsErr) {
    console.error('[auth-state] failed to load per-file session from Supabase:', fileRowsErr.message);
  }

  if (fileRows && fileRows.length > 0) {
    for (const { filename, content } of fileRows) {
      fs.writeFileSync(path.join(tmpDir, filename), Buffer.from(content, 'base64'));
    }
  } else {
    const { data: legacy, error: legacyErr } = await supabase
      .from('whatsapp_auth_state')
      .select('files')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (legacyErr) {
      console.error('[auth-state] failed to load legacy session from Supabase:', legacyErr.message);
    }
    const legacyFiles = legacy?.files || {};
    for (const [name, base64Content] of Object.entries(legacyFiles)) {
      fs.writeFileSync(path.join(tmpDir, name), Buffer.from(base64Content, 'base64'));
    }
  }

  const { state, saveCreds: baileysSaveCreds } = await useMultiFileAuthState(tmpDir);

  // filename -> sha256 of last-persisted content, so unchanged files are
  // never re-uploaded.
  const lastHash = new Map();
  let flushTimer = null;
  let flushInFlight = false;
  let flushAgainAfter = false;

  const reportStatus = async (persistedAt, error) => {
    const { error: updateErr } = await supabase
      .from('whatsapp_session')
      .update({ auth_persisted_at: persistedAt, auth_persist_error: error })
      .eq('id', sessionId);
    if (updateErr) {
      // Best-effort -- the row may not exist yet (first boot before any
      // heartbeat has written it). Not worth failing persistence over.
      console.error('[auth-state] failed to report persistence status:', updateErr.message);
    }
  };

  const doFlush = async () => {
    const filenames = fs.readdirSync(tmpDir);
    const onDisk = new Set(filenames);
    const changed = [];

    for (const name of filenames) {
      const content = fs.readFileSync(path.join(tmpDir, name)).toString('base64');
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      if (lastHash.get(name) !== hash) {
        changed.push({ session_id: sessionId, filename: name, content, updated_at: new Date().toISOString() });
        lastHash.set(name, hash);
      }
    }

    const removed = Array.from(lastHash.keys()).filter((name) => !onDisk.has(name));

    try {
      if (changed.length > 0) {
        const { error: upsertErr } = await supabase.from('whatsapp_auth_files').upsert(changed);
        if (upsertErr) throw upsertErr;
      }
      for (const name of removed) {
        await supabase.from('whatsapp_auth_files').delete().eq('session_id', sessionId).eq('filename', name);
        lastHash.delete(name);
      }
      await reportStatus(new Date().toISOString(), null);
    } catch (err) {
      console.error('[auth-state] failed to persist session to Supabase:', err.message);
      await reportStatus(null, err.message);
    }
  };

  // Debounce: a burst of creds.update (e.g. during an active send) should
  // coalesce into one flush a couple of seconds later, not one upload per
  // event -- that overlapping-upload storm is exactly what broke this
  // before.
  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      if (flushInFlight) {
        flushAgainAfter = true;
        return;
      }
      flushInFlight = true;
      try {
        await doFlush();
      } finally {
        flushInFlight = false;
        if (flushAgainAfter) {
          flushAgainAfter = false;
          scheduleFlush();
        }
      }
    }, 2000);
  };

  const saveCreds = async () => {
    await baileysSaveCreds();
    scheduleFlush();
  };

  return { state, saveCreds };
}
