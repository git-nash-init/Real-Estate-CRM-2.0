import fs from 'fs';
import path from 'path';
import os from 'os';
import { useMultiFileAuthState } from '@whiskeysockets/baileys';

/**
 * Persists Baileys' multi-file auth state (creds.json + per-key signal
 * files) into a single Supabase row instead of leaving it only on local
 * disk. Free-tier hosts (Fly.io/Render) can wipe or restart the container
 * between deploys — without this, every restart would force re-scanning
 * the QR code. On boot we rehydrate a local temp folder from Supabase, let
 * Baileys' own useMultiFileAuthState manage it as normal, then re-upload
 * the whole folder to Supabase on every creds.update (which fires for any
 * file change, not just creds.json).
 *
 * This deliberately doesn't reimplement Baileys' on-disk format — it just
 * mirrors whatever files useMultiFileAuthState already writes, so it stays
 * compatible across Baileys versions without extra maintenance.
 */
export async function useSupabaseAuthState(supabase, sessionId = 'default') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baileys-auth-'));

  const { data, error } = await supabase
    .from('whatsapp_auth_state')
    .select('files')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) {
    console.error('[auth-state] failed to load session from Supabase:', error.message);
  }

  const files = data?.files || {};
  for (const [name, base64Content] of Object.entries(files)) {
    fs.writeFileSync(path.join(tmpDir, name), Buffer.from(base64Content, 'base64'));
  }

  const { state, saveCreds: baileysSaveCreds } = await useMultiFileAuthState(tmpDir);

  const persistToSupabase = async () => {
    const filenames = fs.readdirSync(tmpDir);
    const serialized = {};
    for (const name of filenames) {
      serialized[name] = fs.readFileSync(path.join(tmpDir, name)).toString('base64');
    }
    const { error: upsertErr } = await supabase
      .from('whatsapp_auth_state')
      .upsert({ session_id: sessionId, files: serialized, updated_at: new Date().toISOString() });
    if (upsertErr) {
      console.error('[auth-state] failed to persist session to Supabase:', upsertErr.message);
    }
  };

  const saveCreds = async () => {
    await baileysSaveCreds();
    await persistToSupabase();
  };

  return { state, saveCreds };
}
