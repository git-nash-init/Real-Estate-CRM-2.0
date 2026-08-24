# CRM WhatsApp Gateway

A standalone Node service that connects one WhatsApp number to the CRM, used for:
- **Bulk marketing** (the Marketing page's audience campaigns)
- **Channel Partner lead verification codes** (sent to the client when a CP tags a lead)

Built on [Baileys](https://github.com/WhiskeySockets/Baileys) — a free, unofficial WhatsApp Web client library. No Chromium, no per-message cost, runs comfortably on a free-tier host. See "Risks" below before relying on it for anything business-critical.

## How it works

1. On first boot, it has no session. It generates a QR code and writes it into the `whatsapp_session` table every ~3 seconds (a heartbeat) — **open the CRM at Settings → WhatsApp Connection to see it live and scan it** (admin roles only). `GET /qr` on the gateway's own HTTP API also works, if you'd rather fetch it directly.
2. Once paired, the session (credentials + keys) is persisted into the `whatsapp_auth_state` table in Supabase — not just local disk — so a container restart or redeploy on a free tier does **not** force you to re-scan the QR code.
3. The CRM (or anything else) enqueues messages by inserting rows into the `whatsapp_outbox` table (or via `POST /send`, which does the same thing).
4. A background worker polls that table and sends messages one at a time, with a randomised delay and a daily cap, updating each row's status as it goes.

The CRM's browser code never talks to the gateway's HTTP API directly for status/QR/logout — it only reads/writes plain Supabase tables (`whatsapp_session`, `whatsapp_outbox`) via the existing, already-authenticated Supabase connection. That's deliberate: it means the gateway's `GATEWAY_API_KEY` never has to reach the browser, and there's no CORS setup needed. This gateway process is the only thing that holds the actual WhatsApp session.

### Live status + logout, from inside the CRM

Settings → WhatsApp Connection (visible to `super_admin` / `project_admin` only) shows:
- **Connected** (with the linked phone number), **Awaiting QR Scan** (with the QR code rendered as an image, refreshing live), **Connecting…**, **Logged Out**, or **Gateway Offline** (if no heartbeat has arrived in the last 20 seconds — i.e. the gateway process isn't running).
- A **Log Out WhatsApp** button when connected. This writes a `pending_command = 'logout'` row that the gateway picks up on its next heartbeat cycle, calls `sock.logout()`, clears the persisted session, and starts fresh pairing — a new QR shows up in the same panel automatically, no restart needed.

## Setup

```bash
cd whatsapp-gateway
npm install
cp .env.example .env
```

Fill in `.env`:
- `SUPABASE_URL` — same project as the CRM.
- `SUPABASE_SERVICE_ROLE_KEY` — **service role**, not the anon/publishable key (Project Settings → API in the Supabase dashboard). This must never reach the browser/frontend — it lives only in this service's environment.
- `GATEWAY_API_KEY` — any random string; required in the `x-api-key` header to call `/status`, `/qr`, `/send`.

```bash
npm start
```

Then call `GET /qr` (with the `x-api-key` header) and scan the returned QR code with WhatsApp.

## Deploying (free tier)

Any host that can run a long-lived Node process works — Fly.io and Render both have free tiers. The included `Dockerfile` is portable to either.

**Fly.io:**
```bash
fly launch --no-deploy   # creates fly.toml, pick a free-tier region
fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... GATEWAY_API_KEY=...
fly deploy
```

**Render:** create a new "Web Service" from this repo/folder, set the same three environment variables in the dashboard, and let Render build from the `Dockerfile`.

After the first deploy, fetch `/qr` from the live URL and pair once. Future redeploys reuse the session from Supabase — no re-pairing needed unless the number is logged out of Linked Devices from the phone side.

## Re-pairing

**Preferred:** use the **Log Out WhatsApp** button in the CRM (Settings → WhatsApp Connection) — it handles clearing the session and generating a fresh QR automatically, no restart needed.

**Manual fallback** (e.g. if the phone unlinked the device from its own side, or the gateway process crashed mid-logout): delete the row in `whatsapp_auth_state` (`session_id = 'default'`) and restart the gateway. It will generate a new QR, visible in the same CRM panel.

## Throttling

Controlled via env vars (`WA_MIN_GAP_MS`, `WA_MAX_GAP_MS`, `WA_DAILY_CAP`, `WA_POLL_INTERVAL_MS`). Defaults: 8–15s randomised gap between sends, 200/day cap. These exist to reduce (not eliminate) the risk of the number being flagged — see below.

## Troubleshooting

**"Error: QR refs attempts ended" / connection closes with statusCode 408 in the logs.** This means Baileys generated several QR codes (refreshing roughly every 20s) and none were scanned in time before it gave up. The gateway automatically reconnects and generates a fresh QR when this happens — you don't need to restart it — but if you were fetching `/qr` as raw JSON text via curl/Postman rather than actually looking at a rendered image on your phone, you likely never had a real chance to scan it. Use the CRM's Settings → WhatsApp Connection panel instead: it shows the QR as a live, auto-refreshing image, so you see and scan the *current* code rather than a stale one from a JSON response.

**Status stuck on "Gateway Offline" in the CRM even though `npm start` is running.** The panel treats the connection as offline if no heartbeat has landed in the `whatsapp_session` table in the last 20 seconds. If you're running an older copy of `src/index.js` (from before the heartbeat/status-table feature was added), pull the latest code and restart — older versions don't write to `whatsapp_session` at all.

## Risks

- **Baileys is unofficial.** It reverse-engineers the WhatsApp Web protocol; it is not endorsed or supported by Meta. Aggressive or complained-about bulk sending can get the connected number banned. There is no way to fully eliminate this risk on a zero-cost path — the only ban-free alternative is Meta's official Cloud API, which bills per marketing-template message.
- **Recommend a secondary/dedicated number** for bulk marketing rather than a primary business or personal number.
- **Free-tier hosts can sleep** on inactivity. The outbox and auth-state persistence mean this is recoverable (no lost session, queued messages just wait), but there will be a delay until the host wakes back up.
