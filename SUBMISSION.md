# CRM 2.0 — Work Submission

_Scaffolded at the start of the engagement; filled in as each phase lands. Hours and rate are placeholders for the freelancer to set — this document is the basis for client billing, not a final invoice._

## 1. Executive summary

All six planned phases are complete, with one deliberate exception flagged
below rather than shipped unverified.

**Phase 0-1 (audit + repair):** the two Channel Partner bugs and the
booking-cancellation issue all traced back to the app querying tables that
don't exist in the live database, or UI copy that had drifted out of sync
with a real DB trigger. Fixed, plus a dead-code cleanup and an orphaned
table removed.

**Phase 2-3 (lead integrity + WhatsApp):** duplicate-lead blocking, a
45-day first-come-first-served Channel Partner claim window, and a
standalone WhatsApp gateway that was verified live against WhatsApp's real
servers (not just written and assumed to work).

**Phase 4 (new features):** Marketing bulk messaging, the CP Outreach
form, telecaller call tracking, Tasks with live notifications, Attendance +
Leave management, and an admin Reports dashboard — all built against the
live schema and verified with rolled-back SQL dry runs before being
trusted, several of which caught real bugs (a booking-status trigger
mismatch, a bare-identifier rename hazard) before they shipped.

**Phase 5 (permissions) — partially done, and here's the one thing to
review before calling this finished:** the permission *data* is populated
and application-layer route/nav gating works, but the database itself
still lets any logged-in user read and write every table regardless of
role. Finishing that (wiring `role_permissions` into real RLS policies
across all 35 tables) requires logging in as each role and clicking through
the live app to verify — not something safe to do blind against a
production database in a single pass. AUDIT.md has the recommended
approach for that follow-up. Everything else in this document reflects
verified, working state.

## 2. Codebase & database audit findings

See [AUDIT.md](./AUDIT.md) for the full report. Summary: the app's Channel Partner "no obligation" error and the blank tower lookup were both caused by the app querying tables that do not exist in the live database (`commission_obligations`, `towers`), while the correctly-named tables (`cp_commissions`, `project_towers`) hold real, working data. Several `.sql` migration files in the repo describe a schema that was never applied and should not be trusted. 37 previously-silent Supabase error swallows across 8 pages have been made visible. A permission system (roles, permissions) is fully designed in the database but never activated — every user role currently has access to every page.

## 3. Bugs fixed

| # | Issue | Root cause | Fix | Files | Status | Hours | Cost |
|---|---|---|---|---|---|---|---|
| 1 | "No obligation" error on Channel Partners list | Queried non-existent `commission_obligations` table | Repointed to real `cp_commissions` table | `ChannelPartners.tsx` | Done | — | — |
| 2 | Blank tower names on CP detail page | Queried non-existent `towers` table | Repointed to real `project_towers` table | `ChannelPartnerDetails.tsx` | Done | — | — |
| 3 | 37 silently swallowed Supabase errors across 8 pages | Errors logged to console only, rendered as empty state | Central `reportQueryError` + visible dev overlay | 8 page files, new `queryLogger.ts`, `QueryFailureOverlay.tsx` | Done | — | — |
| 4 | Dead code cleanup: vestigial commission fields on CP list page | Leftover state/fields from dead migrations, never wired to any input or the submit payload — not a live bug, just clutter | Removed dead state, population blocks, interface fields, and the unused-var suppression hack | `ChannelPartners.tsx` | Done | — | — |
| 5 | Booking cancellation UI misled users about inventory release; no token refund/loss log | UI text out of sync with a real DB trigger; feature not built | Rebuilt cancellation flow: accurate copy, reason capture, refund amount, referral fee void, loss log. Caught and fixed a second bug in the fix itself via a rolled-back SQL dry run: using status=`refunded` bypassed the release trigger, which only fires on exactly `cancelled` | `Bookings.tsx` | Done | — | — |
| 6 | Orphaned `commission_payouts` table (RLS enabled, no policies) | Leftover/duplicate table, 0 rows, unused by any query | Confirmed empty and unreferenced, then dropped | DB migration `drop_orphaned_commission_payouts_table` | Done | — | — |

## 4. Features delivered

| # | Feature | Scope | Files | Status | Hours | Cost |
|---|---|---|---|---|---|---|
| 1 | "Commission" renamed to "Referral Fee" (CP-facing copy) | UI copy only (labels, tabs, buttons, messages) — table/column/identifier names deliberately unchanged | `ChannelPartnerDetails.tsx`, `ChannelPartners.tsx`, `Payments.tsx`, `Bookings.tsx` | Done | — | — |
| 2 | Deactivate a Channel Partner | Toggle already existed and worked; found and fixed one real gap: Bookings.tsx loaded ALL partners as referrer options (no status filter), unlike Leads.tsx / SiteVisits.tsx which already filtered correctly | `Bookings.tsx` | Done | — | — |
| 3 | Lead integrity: dedup, 45-day claim window, first-come-first-served, verification codes | Trigger-based dedup (existing test-data duplicates made a hard UNIQUE index unsafe to add), cp_leads claim lifecycle, daily pg_cron expiry job. Verification code generated/stored now; WhatsApp delivery lands with the gateway (Phase 3/4) | `Leads.tsx`, 2 migrations | Done (codes not yet sent) | — | — |
| 4 | WhatsApp gateway (Baileys) | Standalone service, QR pairing (verified live against real WhatsApp servers), Supabase-persisted session, throttled outbox worker, HTTP API | New `whatsapp-gateway/` folder, 2 migrations | Done — needs client to provide Supabase service_role key + pick a host at deploy time | — | — |
| 5 | Marketing — WhatsApp bulk messaging | Audience builder (project/status/CP-referred filters), {{name}} merge field, live match count, delivery dashboard reading real outbox status | New `Marketing.tsx`, `App.tsx` route wired | Done | — | — |
| 6 | CP Outreach form | Ported field-for-field from the reference CRM, adapted to this project's live channel_partners schema (company_name/name vs the reference's channel_partner_firm_name); role-driven SM selector; GPS capture | New `CPOutreach.tsx` + `cp_outreach` table, sidebar nav item, route | Done | — | — |
| 7 | Telecaller call tracking | Call logging wired into Leads.tsx (Log Call action: outcome, duration, notes); admin analytics land with Reports (Phase 4.7) | New `call_logs` table, `Leads.tsx` | Done (Leads.tsx); Follow-ups integration deferred as fast-follow | — | — |
| 8 | Tasks (create, assign, notify, status tracking) | Uses existing `tasks` + `notifications` tables; real-time popup notification via Supabase Realtime (discovered and fixed: neither table was in the realtime publication); wired the previously-decorative sidebar bell; My Tasks panel on Dashboard | New `Tasks.tsx`, `useNotifications.tsx`, `AppLayout.tsx`, `Dashboard.tsx` updated | Done | — | — |
| 9 | Attendance + Leave management | GPS check-in/out against the existing rich schema, leave approval workflow, team view, CSV export. Note: employees table has 0 rows currently — client needs to populate employee records for check-in to work | New `Attendance.tsx` + `leave_requests` table | Done | — | — |
| 10 | Reports (admin-only) | Lead funnel, bookings/revenue by sales owner, CP-referred vs direct split, telecaller call performance — all via `recharts`. Gated to admin roles (UI-level; full RLS enforcement in Phase 5) | New `Reports.tsx`, `recharts` dependency | Done | — | — |
| 11 | Role-based access control | `role_permissions` populated (14 roles x 91 permissions, conservative default); Reports gated at the route + nav level; hardcoded super-admin UUID fallback removed (verified dead first); security advisor findings 15→6. Full per-table RLS rewrite deliberately deferred — see AUDIT.md Phase 5 for why and the recommended verified-branch approach | `role_permissions` seed migration, `App.tsx`, `AppLayout.tsx`, `useAuth.tsx`, 2 security migrations | Partially done — app-layer gating + advisor fixes done; DB-layer RLS rewrite deferred, needs a follow-up engagement with live login verification | — | — |
| 12 | In-app WhatsApp connection status, QR pairing, and logout | New Settings → WhatsApp Connection page (admin-only): live status, QR code as an auto-refreshing image, connected phone number, Log Out button. Gateway heartbeats status into a Supabase table every ~3s and polls for a logout command — no direct browser-to-gateway HTTP calls, so the gateway's API key never reaches the browser and no CORS setup is needed | New `Settings.tsx`, `whatsapp_session` table, gateway `src/index.js` updated (heartbeat + command polling + logout handling), `whatsapp-gateway/README.md` updated | Done | — | — |
| 13 | Test accounts for every role | Requested by the client to self-test each feature. 2 of 14 created (`super_admin`, `project_admin` — both give full access to every page) before hitting Supabase's free-tier email-sending rate limit on the signup flow. See section 9 (Handover) for credentials and how to get the remaining 12 | — | Partial — 2/14, blocked by a platform rate limit, not a code or permission issue | — | — |

## 5. Database changes

| Migration | Purpose | Status |
|---|---|---|
| `add_loss_logs_table` | New additive table (`loss_logs`) recording refunded/forfeited amounts on booking cancellation. No existing tables altered. | Applied |
| `drop_orphaned_commission_payouts_table` | Removed the empty, unreferenced, policy-less `commission_payouts` table (duplicate of `cp_commission_payouts`). | Applied |
| `add_lead_phone_dedup_and_cp_claim_fields` | Trigger-based lead phone dedup (no existing data touched); added claim_expires_at/verification_code/verified_at to cp_leads. | Applied |
| `add_cp_lead_claim_expiry_job` | pg_cron daily job expiring lapsed CP lead claims and clearing attribution. | Applied |
| `add_whatsapp_gateway_tables` | New `whatsapp_outbox` (send queue) and `whatsapp_auth_state` (session persistence) tables. | Applied |
| `add_cp_outreach_table` | New `cp_outreach` table for field-visit logging. | Applied |
| `add_call_logs_table` | New `call_logs` table for telecaller call tracking. | Applied |
| `enable_realtime_for_notifications_and_tasks` | Added `notifications` and `tasks` to the `supabase_realtime` publication (were missing entirely). | Applied |
| `add_leave_requests_table` | New `leave_requests` table for the leave approval workflow. | Applied |
| `seed_role_permissions` | Populated `role_permissions` (was 0 rows) with a conservative default mapping. Data only — no RLS policy references it yet. | Applied |
| `fix_security_advisor_findings` | Pinned `search_path` on 8 functions; revoked `anon`/`PUBLIC` execute on 6 `SECURITY DEFINER` RLS-helper functions. | Applied |
| `revoke_handle_new_user_authenticated_execute` | Closed the remaining `authenticated` execute grant on the `handle_new_user` trigger function (confirmed trigger-only, no legitimate direct-call use). | Applied |
| `add_whatsapp_session_status_table` | New `whatsapp_session` table so the CRM can show live gateway status/QR and issue a logout command through Supabase (no direct browser-to-gateway calls). | Applied |

## 6. Infrastructure

| Component | Host | Running cost |
|---|---|---|
| WhatsApp gateway (Baileys) | Free-tier cloud host (Fly.io / Render), Dockerised — code and Dockerfile ready in `whatsapp-gateway/`; not yet deployed to a live host (needs client's hosting account + Supabase service_role key) | ₹0 |
| Application | Existing hosting (unchanged) | ₹0 additional |
| Database | Existing Supabase project (unchanged) | ₹0 additional |

## 7. Third-party services

| Service | Purpose | Tier | Limits to be aware of |
|---|---|---|---|
| `@whiskeysockets/baileys` | WhatsApp messaging | Free, unofficial | Not officially supported by Meta; see risk note below |
| Supabase | Database, auth, RLS, `pg_cron` | Free tier (existing) | Free-tier project pausing/limits apply as already accepted by the client |
| Fly.io / Render (TBD) | WhatsApp gateway hosting | Free tier | May sleep on inactivity; reconnect logic included |

## 8. Known risks & limitations

- **WhatsApp bans:** Baileys is an unofficial client. Aggressive bulk sending risks the connected WhatsApp number being banned by Meta. Mitigated with throttling (8-15s randomised gaps), a daily send cap, and opt-out handling — but the risk cannot be fully eliminated on a zero-cost path. Recommend a secondary/dedicated number for bulk marketing.
- **Free-tier hosting sleep:** the WhatsApp gateway may sleep on an inactive free tier; session is persisted to Supabase so a restart does not require re-scanning the QR code, but there may be a short reconnect delay.
- **Every table is still readable/writable by every logged-in user regardless of role.** `role_permissions` is populated but not yet wired into RLS policies — see item 11 above and AUDIT.md's Phase 5 section. This was a deliberate scope decision (the alternative was applying 30+ untested policy changes to a live production database with no way to verify each of the 14 roles' access afterward) and should be treated as the top-priority item for the next phase of work, alongside enabling leaked-password protection in the Supabase Auth dashboard (also not yet done — requires manual action in the dashboard, not reachable via SQL/API).
- **`employees` table has 0 rows.** Attendance check-in/out and any feature that resolves the logged-in user to an employee record won't work until the client populates real employee records.

## 9. Handover & runbook

**Deploying the main app:** unchanged from before this engagement — same
build (`npm run build`) and hosting as already in place.

**Deploying the WhatsApp gateway** (new, not yet live):
1. `cd whatsapp-gateway && npm install`
2. Get the Supabase **service_role** key (Project Settings → API in the
   Supabase dashboard) — never the anon/publishable key. Set it as
   `SUPABASE_SERVICE_ROLE_KEY` alongside `SUPABASE_URL` and a random
   `GATEWAY_API_KEY`.
3. Deploy via the included `Dockerfile` to Fly.io or Render (free tier) —
   exact commands in `whatsapp-gateway/README.md`.
4. Open the CRM at **Settings → WhatsApp Connection** (as an admin role)
   and scan the QR code shown there with the WhatsApp number to connect
   (Settings → Linked Devices → Link a Device, on the phone). It updates
   live — no need to refresh the page or dig through logs/curl output.
5. Re-pairing, if ever needed: use the **Log Out WhatsApp** button in that
   same panel — it clears the session and generates a fresh QR
   automatically, no restart required.

**Environment variables needed, beyond what already exists:**
`SUPABASE_SERVICE_ROLE_KEY` and `GATEWAY_API_KEY` for the gateway only —
the main app's `.env.local` is unchanged.

**Regenerating `src/types/database.ts`** when the schema changes: via the
Supabase MCP `generate_typescript_types` tool, or `npx supabase gen types
typescript` against the project if working outside this MCP-connected
environment.

**Populating `employees`** is required before Attendance check-in/out will
work for any user — see the risk noted above.

**Before the next phase of work (RLS):** enable leaked-password protection
in the Supabase Auth dashboard (Authentication → Policies) — the one
remaining security-advisor item that needs manual action, not code.

### Test accounts (for self-testing every feature/role)

Password for all: `CrmTest@2026` — change or delete these accounts before
going live; they're for testing only.

| Role | Email | Status |
|---|---|---|
| `super_admin` | `test.super_admin@gmail.com` | Ready — full access to every page |
| `project_admin` | `test.project_admin@gmail.com` | Ready — full access to every page |
| `site_head` | `test.site_head@gmail.com` | Not yet created |
| `sourcing_manager_tl` | `test.sourcing_manager_tl@gmail.com` | Not yet created |
| `sourcing_manager` | `test.sourcing_manager@gmail.com` | Not yet created |
| `telecaller` | `test.telecaller@gmail.com` | Not yet created |
| `presales_tl` | `test.presales_tl@gmail.com` | Not yet created |
| `presales` | `test.presales@gmail.com` | Not yet created |
| `closing_manager_tl` | `test.closing_manager_tl@gmail.com` | Not yet created |
| `closing_manager` | `test.closing_manager@gmail.com` | Not yet created |
| `marketing_head` | `test.marketing_head@gmail.com` | Not yet created |
| `marketing` | `test.marketing@gmail.com` | Not yet created |
| `receptionist` | `test.receptionist@gmail.com` | Not yet created |
| `channel_partner` | `test.channel_partner@gmail.com` | Not yet created |

The remaining 12 hit Supabase's free-tier email-sending rate limit on the
public signup endpoint (not a permission or code issue). Two ways to
finish this:
1. **Wait it out** — ask again later in this conversation/a new session and
   the remaining accounts can be created the same way once the limit
   resets (typically within an hour on Supabase's default tier).
2. **Faster — create them yourself:** Supabase Dashboard → Authentication →
   Users → Add User, enter the email/password above, check **"Auto Confirm
   User"** (this path isn't rate-limited since it's an authenticated admin
   action, not the public signup flow). Send me the resulting user IDs (or
   just say "created the rest") and I'll link each to the correct role in
   `user_roles` + `user_profiles`.

Note: none of these test users have an `employees` record, so
Attendance check-in/out, the CP Outreach Sourcing Manager selector, and
Log Call attribution won't resolve to a real employee for them — same
caveat as the `employees` table being empty generally (see risks above).

## 10. Cost summary

| Phase | Description | Hours | Rate | Amount |
|---|---|---|---|---|
| 0 | Audit & instrumentation | — | — | — |
| 1 | Repair (Channel Partner + booking fixes) | — | — | — |
| 2 | Lead integrity rules | — | — | — |
| 3 | WhatsApp gateway | — | — | — |
| 4 | New features (Marketing, CP Outreach, Telecaller tracking, Tasks, Attendance, Reports) | — | — | — |
| 5 | Role-based access | — | — | — |
| **Total** | | | | |
