// Processes ONE queued row from public.whatsapp_outbox per invocation,
// sending it through Meta's WhatsApp Business Cloud API. Invoked by a
// Supabase Cron job (see migration `schedule_whatsapp_outbox_cron`) every
// few seconds -- deliberately one row at a time, not the whole backlog, so
// a bulk marketing campaign queuing hundreds of rows at once doesn't fire
// hundreds of concurrent Graph API calls in the same instant.
//
// Credentials (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID) live in
// public.app_secrets (RLS-locked to service_role) rather than Edge
// Function secrets, since those can only be set via the Supabase CLI or
// Dashboard, neither of which was available when this was built.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ATTACHMENT_BUCKET = 'whatsapp-attachments';

function toWaNumber(phone: string): string {
  let digits = String(phone).replace(/[^0-9]/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  return digits;
}

async function buildMessageBodies(
  supabase: ReturnType<typeof createClient>,
  row: any,
  toNumber: string,
): Promise<Record<string, unknown>[]> {
  if (!row.media_path) {
    return [{ messaging_product: 'whatsapp', to: toNumber, type: 'text', text: { body: row.message } }];
  }

  const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(row.media_path, 600);
  if (error || !data?.signedUrl) {
    throw new Error(`Could not resolve attachment "${row.media_path}": ${error?.message || 'no signed URL returned'}`);
  }

  const url = data.signedUrl;
  const caption = row.message || undefined;
  const filename = row.media_filename || 'attachment';

  switch (row.media_type) {
    case 'image':
      return [{ messaging_product: 'whatsapp', to: toNumber, type: 'image', image: { link: url, caption } }];
    case 'video':
      return [{ messaging_product: 'whatsapp', to: toNumber, type: 'video', video: { link: url, caption } }];
    case 'audio': {
      const bodies: Record<string, unknown>[] = [{ messaging_product: 'whatsapp', to: toNumber, type: 'audio', audio: { link: url } }];
      if (caption) bodies.unshift({ messaging_product: 'whatsapp', to: toNumber, type: 'text', text: { body: caption } });
      return bodies;
    }
    default:
      return [{ messaging_product: 'whatsapp', to: toNumber, type: 'document', document: { link: url, filename, caption } }];
  }
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Load config from app_secrets (service role bypasses RLS).
  const { data: secretRows, error: secretsErr } = await supabase
    .from('app_secrets')
    .select('key, value')
    .in('key', ['whatsapp_token', 'whatsapp_phone_number_id', 'whatsapp_api_version', 'whatsapp_webhook_secret', 'whatsapp_daily_cap']);
  if (secretsErr) {
    return new Response(JSON.stringify({ error: 'config_fetch_failed', detail: secretsErr.message }), { status: 500 });
  }
  const cfg = Object.fromEntries((secretRows || []).map((r: any) => [r.key, r.value]));

  // Shared-secret guard -- the cron job's pg_net call carries this header.
  // Even though the request also carries a valid project JWT (verify_jwt
  // is on), that alone only proves "holds the public anon key", which is
  // not a real secret -- this header is the actual access control.
  const provided = req.headers.get('x-webhook-secret');
  if (!provided || provided !== cfg.whatsapp_webhook_secret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const WHATSAPP_TOKEN = cfg.whatsapp_token;
  const WHATSAPP_PHONE_NUMBER_ID = cfg.whatsapp_phone_number_id;
  const WHATSAPP_API_VERSION = cfg.whatsapp_api_version || 'v21.0';
  const DAILY_CAP = Number(cfg.whatsapp_daily_cap || 1000);
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    return new Response(JSON.stringify({ error: 'whatsapp_not_configured' }), { status: 500 });
  }

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count: sentToday } = await supabase
    .from('whatsapp_outbox')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent')
    .gte('sent_at', startOfDay.toISOString());
  if ((sentToday || 0) >= DAILY_CAP) {
    return new Response(JSON.stringify({ skipped: 'daily_cap_reached', sentToday }), { status: 200 });
  }

  const { data: rows, error: pollErr } = await supabase
    .from('whatsapp_outbox')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1);
  if (pollErr) {
    return new Response(JSON.stringify({ error: 'poll_failed', detail: pollErr.message }), { status: 500 });
  }
  const row = rows?.[0];
  if (!row) {
    return new Response(JSON.stringify({ skipped: 'empty_queue' }), { status: 200 });
  }

  const { data: claimed, error: claimErr } = await supabase
    .from('whatsapp_outbox')
    .update({ status: 'sending', attempts: (row.attempts || 0) + 1 })
    .eq('id', row.id)
    .eq('status', 'queued')
    .select()
    .maybeSingle();
  if (claimErr || !claimed) {
    return new Response(JSON.stringify({ skipped: 'already_claimed' }), { status: 200 });
  }

  const graphUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    const toNumber = toWaNumber(claimed.to_phone);
    const bodies = await buildMessageBodies(supabase, claimed, toNumber);
    for (const body of bodies) {
      const res = await fetch(graphUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json?.error?.message || `HTTP ${res.status}`;
        throw new Error(msg);
      }
    }
    await supabase
      .from('whatsapp_outbox')
      .update({ status: 'sent', sent_at: new Date().toISOString(), error: null })
      .eq('id', claimed.id);
    return new Response(JSON.stringify({ sent: claimed.id }), { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from('whatsapp_outbox').update({ status: 'failed', error: message }).eq('id', claimed.id);
    return new Response(JSON.stringify({ failed: claimed.id, error: message }), { status: 200 });
  }
});
