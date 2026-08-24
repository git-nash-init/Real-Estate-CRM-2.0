# CRM WhatsApp Gateway

A standalone Node service that connects one WhatsApp number to the CRM, used for:
- **Bulk marketing** (the Marketing page's audience campaigns)
- **Channel Partner lead verification codes** (sent to the client when a CP tags a lead)

Built on [Baileys](https://github.com/WhiskeySockets/Baileys) — a free, unofficial WhatsApp Web client library. No Chromium, no per-message cost, runs comfortably on a free-tier host. See "Risks" below before relying on it for anything business-critical.

## How it works

1. On first boot, it has no session. It generates a QR code — fetch it from `GET /qr` and scan it with the WhatsApp app on the number you want to connect (**Settings → Linked Devices → Link a Device**).
2. Once paired, the session (credentials + keys) is persisted into the `whatsapp_auth_state` table in Supabase — not just local disk — so a container restart or redeploy on a free tier does **not** force you to re-scan the QR code.
3. The CRM (or anything else) enqueues messages by inserting rows into the `whatsapp_outbox` table (or via `POST /send`, which does the same thing).
4. A background worker polls that table and sends messages one at a time, with a randomised delay and a daily cap, updating each row's status as it goes.

The CRM's browser code never talks to WhatsApp directly — it only reads/writes the `whatsapp_outbox` table via the existing Supabase connection. This gateway is the only thing that holds the actual WhatsApp session.

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

## Re-pairing (if ever needed)

If the connected phone unlinks the device, or you see `Logged out — a fresh QR scan is required` in the logs: delete the row in `whatsapp_auth_state` (`session_id = 'default'`) and restart the gateway. It will generate a new QR.

## Throttling

Controlled via env vars (`WA_MIN_GAP_MS`, `WA_MAX_GAP_MS`, `WA_DAILY_CAP`, `WA_POLL_INTERVAL_MS`). Defaults: 8–15s randomised gap between sends, 200/day cap. These exist to reduce (not eliminate) the risk of the number being flagged — see below.

## Risks

- **Baileys is unofficial.** It reverse-engineers the WhatsApp Web protocol; it is not endorsed or supported by Meta. Aggressive or complained-about bulk sending can get the connected number banned. There is no way to fully eliminate this risk on a zero-cost path — the only ban-free alternative is Meta's official Cloud API, which bills per marketing-template message.
- **Recommend a secondary/dedicated number** for bulk marketing rather than a primary business or personal number.
- **Free-tier hosts can sleep** on inactivity. The outbox and auth-state persistence mean this is recoverable (no lost session, queued messages just wait), but there will be a delay until the host wakes back up.
