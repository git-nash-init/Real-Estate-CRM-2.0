# CRM 2.0 — Work Submission

_Scaffolded at the start of the engagement; filled in as each phase lands. Hours and rate are placeholders for the freelancer to set — this document is the basis for client billing, not a final invoice._

## 1. Executive summary

_Pending — filled in once all phases are complete or at handover, whichever comes first._

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
| 8 | Tasks (create, assign, notify, status tracking) | Uses existing `tasks` + `notifications` tables | New `Tasks.tsx` | Pending | — | — |
| 9 | Attendance + Leave management | GPS check-in/out (existing schema), leave approval workflow | New `Attendance.tsx` + `leave_requests` table | Pending | — | — |
| 10 | Reports (admin-only) | Sales/performance dashboards via `recharts` | New `Reports.tsx` | Pending | — | — |
| 11 | Role-based access control | Populate `role_permissions`, enforce via RLS + route guards | RLS migration, `ProtectedRoute.tsx`, `AppLayout.tsx` | Pending | — | — |

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
- Any additional risks discovered during later phases will be added here.

## 9. Handover & runbook

_Pending — filled in at project handover: deployment steps, environment variables, WhatsApp gateway QR re-pairing procedure, and how to regenerate `src/types/database.ts` when the schema changes._

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
