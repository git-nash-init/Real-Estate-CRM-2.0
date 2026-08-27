# CRM 2.0 — Work Submission

_Scaffolded at the start of the engagement; filled in as each phase lands. Hours and rate are placeholders for the freelancer to set — this document is the basis for client billing, not a final invoice._

## 1. Executive summary

All six planned phases are complete, with one deliberate exception flagged
below rather than shipped unverified. A follow-up round (**Phase 6**) then
fixed the blockers the client hit during their own hands-on testing and
added three new capabilities: a working global search with per-user data
scoping, real per-employee onboarding credentials (replacing a hardcoded
shared password), and anti-fraud hardening on telecaller call logging.

**Phase 6 (post-launch fixes + onboarding + search + anti-fraud):** fixed
an auth deadlock that made every page load hang on "Verifying secure
session…" forever; an invisible Confirm button (undefined Tailwind color);
10 rupee-amount inputs showing a `$` icon instead of `₹`; Attendance
showing only the leave feature when no employee record exists; leave
approval now restricted to `super_admin` at both the UI and database
level. Replaced the shared hardcoded onboarding password with a real
per-employee random password shown once to the admin, forced first-login
password change, and a working forgot-password email flow (the route
didn't exist before). Built a working global search that scopes results
per user (a sourcing manager cannot see another's leads/channel
partners). Hardened telecaller call logging so duration is timed by the
app instead of hand-typed, GPS is captured at call time, and Reports now
has a fraud-signals panel. Full detail in section 4a and AUDIT.md.

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

**Phase 7 (post-call requests — account portal lockdown + personal expenses):** two items requested directly by the client on a call. First, account/credential management (creating logins, sharing them, activate/deactivate) is now strictly `super_admin`-only — this turned out to require more than hiding a nav link, since Phase 6 had deliberately widened database policies to let `project_admin` complete onboarding; those grants are now revoked, and a leftover blanket-permissive policy on `employees` (found in the process) was removed too. Second, a private personal expense ledger (receipt amount vs. actual amount) was built for the super admin only — enforced so tightly that even a second `super_admin` account could not see another's entries. Both verified live: submitted a real expense through the UI, confirmed via SQL that RLS bound it to the correct user, and confirmed via a live logged-in `project_admin` session that account-creation and expense inserts are now rejected by the database itself (`42501`), not just hidden by the UI.

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

## 4a. Phase 6 — post-launch fixes, onboarding, search, anti-fraud

| # | Item | Root cause / scope | Fix | Files | Status |
|---|---|---|---|---|---|
| 1 | App hangs forever on "Verifying secure session…" | `onAuthStateChange` callback awaited a Supabase query inside itself while holding the browser's auth lock — the query needed the same lock to complete, so it deadlocked, every page load (`INITIAL_SESSION` fires every time) | Made the callback synchronous; moved profile/role fetch to a separate effect keyed on the session | `useAuth.tsx` | Done |
| 2 | Confirm button invisible until hovered | `bg-indigo-650` — not a real Tailwind shade in this v4/no-config setup, so no CSS was emitted at all | Added a `@theme` block defining all 75 non-standard shades found in the codebase, not just the one that broke | `index.css` | Done |
| 3 | `$` instead of `₹` on money inputs | Not a text issue — the lucide `DollarSign` icon was used as a prefix adornment on 10 rupee-amount inputs | Swapped to `IndianRupee` icon (16 usages across 4 files) | `Bookings.tsx`, `ChannelPartnerDetails.tsx`, `Payments.tsx`, `Inventory.tsx` | Done |
| 4 | Attendance only shows Leave feature | With `employees` at 0 rows, check-in/out silently rendered nothing while Leave sat outside that condition; the explanation banner was at the bottom of a 200-row page | Clear banner moved to the top of the page; added the missing null-guard on leave submission | `Attendance.tsx` | Done |
| 5 | Leave approval restricted to Super Admin | Client requirement — previously any logged-in user could approve any leave request, including their own | UI hides the approval table for non-super-admins; DB `UPDATE` policy on `leave_requests` requires `is_super_admin()` and blocks self-approval, verified via 3 rolled-back RLS dry runs | `Attendance.tsx`, DB policy | Done |
| 6 | Real per-employee onboarding credentials | Every new hire got the same hardcoded `TempPassword123!`, visible in source, never shown to the admin | Cryptographically random per-employee password, shown once in a copy-once reveal modal; forced first-login password change (`must_change_password` + new `/set-password` route); found and fixed 2 previously-unnoticed RLS bugs blocking `project_admin` from completing onboarding, and 1 app bug where a DB trigger race silently skipped setting the force-change flag | `Employees.tsx`, `ProtectedRoute.tsx`, 2 DB policies | Done, verified via rolled-back SQL simulation of the full flow (signup itself is rate-limited on the free tier, same as noted in section 4/13 below) |
| 7 | Working forgot-password flow | `ForgotPassword.tsx` linked to `/reset-password`, which didn't exist — the email went nowhere | New `ResetPassword.tsx` + route, completes the existing email-link flow | `ResetPassword.tsx`, `App.tsx` | Done |
| 8 | Global search with per-user data scoping | Header search bar was decorative (no handler at all) | Debounced (300ms) search over leads/bookings/channel partners/projects/inventory plus matching feature pages, scoped per role so e.g. sourcing manager X cannot see sourcing manager Y's records. Documented as application-layer scoping only (not full RLS) — same honest caveat as the Phase 5 permissions item above | New `GlobalSearch.tsx`, `dataScope.ts` | Done — verified live |
| 9 | Telecaller call-log anti-fraud | No corroboration that a logged call ever happened; duration was hand-typed; any user could log a call under a colleague's `employee_id` (blanket RLS policy) | App-timed Start Call/End Call (duration can't be typed), best-effort GPS capture at call start, call now stamps `leads.last_contact_at`, RLS binds `employee_id` to the caller's own record (verified via rolled-back simulation), new Reports panel flags burst logging, calls outside attendance hours, and "connected" calls whose lead never progressed | `Leads.tsx`, `Reports.tsx`, DB migration + policies | Done — stated honestly in WALKTHROUGH.md: this stops casual/bulk fabrication and logging-as-someone-else, but a patient telecaller who lets the timer run for a call that didn't happen is only caught by a real telephony provider, which isn't zero-cost |

## 4b. Phase 7 — post-call requests: account portal lockdown + personal expenses

| # | Item | Root cause / scope | Fix | Files | Status |
|---|---|---|---|---|---|
| 1 | Account/credential management restricted to Super Admin only | Client's explicit call request. `Employees.tsx` already did exactly what was asked (create logins, generate one-time credentials, activate/deactivate) but was reachable by `project_admin` too — and that wasn't just a UI gap, since Phase 6 had deliberately widened `user_roles`/`user_profiles` RLS to let `project_admin` complete onboarding | Route + nav restricted to `super_admin`; DB policies on `user_roles` (ALL) and `user_profiles` (insert/update) narrowed to drop `project_admin`; also removed a leftover blanket `USING(true)` policy on `employees` found in the process (previously any logged-in user could write to it directly via the API, bypassing the real per-action policies) | `App.tsx`, `AppLayout.tsx`, DB migration `restrict_account_management_to_super_admin` | Done — verified live: a logged-in `project_admin` session now gets a `42501` RLS rejection inserting into `user_roles` or `user_profiles` |
| 2 | Personal Expenses (Super Admin only, private) | Client's explicit call request: "It will be at my personal level... nobody else should have access to it" — a place to log the gap between a bill's receipt amount and what was actually paid | New `personal_expenses` table with a `user_id = auth.uid() AND is_super_admin()` policy on every action — stricter than every other table in the app, since it locks out even other `super_admin` accounts, not just other roles. New page with list, totals (receipt/actual/difference), add/edit/delete, search | New `Expenses.tsx`, DB migration `add_personal_expenses_table`, `App.tsx`, `AppLayout.tsx` route/nav (both `super_admin`-only) | Done — verified live: logged an entry as `test.super_admin`, confirmed via SQL it was correctly stamped to that user's `user_id`, then confirmed a `project_admin` session gets a `42501` rejection attempting to insert |

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
| `add_leave_requests_super_admin_approval` | `leave_requests` UPDATE policy restricted to `is_super_admin()`, self-approval blocked. | Applied |
| `allow_project_admin_manage_user_roles` | Widened `user_roles` RLS (was `super_admin`-only) so `project_admin` can complete employee onboarding, which the app now gates them into. | Applied |
| `allow_project_admin_manage_user_profiles` | Same widening for `user_profiles` insert/update — found via live testing right after the `user_roles` fix, same root cause. | Applied |
| `call_logs_antifraud_hardening` | Added GPS + future-telephony columns; replaced `call_logs`' blanket `USING(true)` policy with one binding `employee_id` to the caller's own employee record (insert/select), admin-only for update/delete. | Applied |
| `add_personal_expenses_table` | New `personal_expenses` table (receipt amount vs. actual amount), RLS restricted to `user_id = auth.uid() AND is_super_admin()` on every action — a super admin can only ever see their own rows, not another super admin's. | Applied |
| `restrict_account_management_to_super_admin` | Narrowed `user_roles` (ALL) and `user_profiles` (insert/update) policies to drop `project_admin`, restoring the intended super_admin-only account-creation boundary Phase 6 had temporarily widened for onboarding. Also dropped a leftover blanket `USING(true)` policy on `employees` that coexisted alongside its correct per-action policies. | Applied |

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
- **Global search's data scoping is application-layer only** (Phase 6, item 8 above) — same class of limitation as the Phase 5 RLS item: it controls what the search UI queries, not what a valid, logged-in user's own Supabase session could query directly, since most tables still carry the permissive `USING(true)` policy. Stated plainly in WALKTHROUGH.md.
- **Telecaller anti-fraud is a deterrent, not a guarantee.** App-timed calls and GPS stop casual and bulk fabrication and logging-as-someone-else, and surface suspicious patterns in Reports — but a telecaller who lets the Start/End Call timer run without actually calling anyone won't be caught by this alone. Only a real telephony/dialer provider closes that gap, and that isn't zero-cost. New nullable columns (`provider_call_id`, `answered_at`, `recording_url`) are already in place for that future integration.
- **The `employees` table's RLS has a leftover blanket-permissive policy** (`policy_employees_all`, `USING(true)`) alongside its newer, narrower per-action policies — found during Phase 6 onboarding work but deliberately not touched, since it wasn't in that task's critical path and RLS changes on a live table warrant their own verified pass. Flagged here for the next RLS cleanup, same category as the Phase 5 item above.

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

**Adding a new employee (Phase 6 onboarding flow):** Employees page
(admin roles only) → Add Employee → fill in details including a **real
email** the person actually checks (a synthetic `@estatecrm.internal`
address works for login but can never receive a password-reset email) →
Save. A one-time credential reveal modal shows the generated password —
copy it and hand it to the employee through a private channel (chat,
call, in person); it is never shown again and never stored in plaintext.
They log in once, are forced to set their own password immediately, and
from then on can use **Forgot Password** on the login page like anyone
else if they lose it.

**Full plain-language walkthrough of every feature:** see
[WALKTHROUGH.md](./WALKTHROUGH.md) — written for a non-technical read,
covers every feature old and new with what it does, who uses it, and
what its limits are, plus a suggested demo flow for the client's own
client meetings. Also published as a private, shareable web page (usable
on a phone during a client meeting):
https://claude.ai/code/artifact/cc285ca2-143c-4927-a8a4-86bbc4679b1f

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
| 6 | Post-launch fixes (auth deadlock, invisible button, rupee icons, attendance visibility, leave approval), real onboarding credentials, global search with data scoping, telecaller anti-fraud, full walkthrough documentation | — | — | — |
| 7 | Post-call requests: account portal lockdown to Super Admin only (route + RLS), Personal Expenses feature (Super Admin only, private per-user) | — | — | — |
| **Total** | | | | |
