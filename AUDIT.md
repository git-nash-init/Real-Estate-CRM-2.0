# CRM 2.0 — Live Database & Codebase Audit

Generated as Phase 0 of the repair engagement. Every finding below was verified
directly against the live Supabase project (`umuctbiofbyjwnqavxus`) via the
Supabase MCP tools (`list_tables`, `execute_sql`, `get_advisors`,
`generate_typescript_types`) — not inferred from the repo's `.sql` files,
which are frequently wrong (see "Dead migrations" below).

## Method

1. Enumerated all 35 live tables with row counts and RLS status.
2. Diffed every table the app's `.from('...')` calls reference against that list.
3. Pulled real column lists, enum definitions, RLS policies, and triggers via SQL.
4. Ran Supabase's security advisor.
5. Generated real TypeScript types from the live schema (`src/types/database.ts`)
   and type-checked the app against them to find silent interface/schema drift.
6. Instrumented every Supabase call site with `reportQueryError` (see
   `src/services/queryLogger.ts`) so failures now surface visibly in dev
   instead of vanishing into `console.warn`.

## Fixed in this pass

| Issue | Root cause | Fix | File(s) |
|---|---|---|---|
| "No obligation" error on Channel Partners list | Queried `commission_obligations`, which does not exist in the live DB | Repointed to `cp_commissions` (6 real rows), aliased `cp_id -> channel_partner_id` | `src/pages/ChannelPartners.tsx` |
| Tower names blank on Channel Partner detail page | Queried `towers`, which does not exist; real table is `project_towers` | Repointed to `project_towers` | `src/pages/ChannelPartnerDetails.tsx` |
| All 37 silent `console.warn` failure swallows across 8 pages | Every Supabase error was logged to the console only, then treated as "no data" | Routed through `reportQueryError` -> visible dev-mode banner (`QueryFailureOverlay`) | `Bookings.tsx`, `ChannelPartnerDetails.tsx`, `ChannelPartners.tsx`, `Dashboard.tsx`, `Employees.tsx`, `Followups.tsx`, `Leads.tsx`, `SiteVisits.tsx` |
| Units lookup on CP detail page failed with no warning at all (worse than the others — no error branch existed) | Missing `if (error)` branch | Added | `ChannelPartnerDetails.tsx` |

## Verified live schema — the important corrections to prior assumptions

- **The database is real and populated** — not empty, not skeletal. 35 tables;
  live row counts include `project_inventory` 205, `leads` 10, `bookings` 10,
  `channel_partners` 6, `cp_commissions` 6, `cp_commission_payouts` 5,
  `commission_structures` 4, `roles` 14, `permissions` 91.
- **The referral-fee ledger itself works.** `cp_commissions`,
  `cp_commission_payouts`, and `commission_structures` all exist with real
  data across statuses `pending / approved / partially_paid / paid`. Only the
  two table-name mismatches above were breaking things.
- **An orphaned table**, `commission_payouts` (singular fee, no `cp_` prefix),
  existed with RLS enabled and **zero policies** — confirmed by Supabase's own
  `rls_enabled_no_policy` advisor. It silently returned 0 rows to everyone and
  duplicated `cp_commission_payouts`. Nothing in the app queried it. **Fixed
  this pass:** confirmed 0 rows, then dropped (migration
  `drop_orphaned_commission_payouts_table`).

### Dead migrations — do not trust the repo's `.sql` files

`migration_channel_partner_module.sql` and `channel_partner_complete_schema_fix.sql`
create `channel_partner_commissions` and `commission_payments` — **neither
exists in the live database.** Those migrations were never applied. Confirmed
independently: the columns they would add (`partner_name`, `phone`,
`commission_type`) do not exist on the live `channel_partners` table either,
which uses `name` and `mobile` instead.

`migration_commission_payout_rls_fix.sql` is *partially* applied — its
`policy_cp_commissions_all` policy exists on the real `cp_commissions` table —
but the migration also references `cp_commission_payouts` policies that
duplicate ones already there. **Treat every `.sql` file in this repo as
unverified until cross-checked against the live schema — several describe a
database that does not exist.**

### Dead code found and removed: vestigial commission fields on the CP list page

`ChannelPartners.tsx`'s `ChannelPartner` interface previously included
`commission_type`, `commission_value`, `commission_basis`,
`default_commission_rate`, `default_commission_amount`, and a `partnerType`
form state — none of these columns exist on the live `channel_partners`
table (they're leftovers from the dead migrations, see above). On closer
inspection **these were not a live, user-facing bug**: the state was
populated when opening the edit modal and reset when it closed, but was never
rendered as an input anywhere and never included in the submit payload —
pure dead code with no UI surface, not a form that silently discards what a
user types. The real per-partner/per-project commission rate is correctly
read and written via the `commission_structures` table on the Channel
Partner *detail* page's "Add Structure" control, which already works.

**Fixed in this pass:** removed the dead state, the dead `resetFormFields`
and `openEditModal` population blocks, the unused interface fields, and the
`// Suppress unused compiler warnings` hack that existed only to keep the
compiler quiet about them. No behavior change for users — this is cleanup,
not a functional fix.

### Type-check against the real schema surfaced ~93 further mismatches

Generating real types from the live DB (`src/types/database.ts`) and
type-checking the app against them (not wired into the live client yet — see
below) surfaced pre-existing interface/schema drift in 10 files:

| File | Error count | Nature |
|---|---|---|
| `Bookings.tsx` | 7 | Booking status literals not matching the real `booking_status` enum; `ChannelPartner` commission fields (same root cause as above) |
| `useAuth.tsx` | 6 | `UserProfile.email` typed non-nullable; DB column is nullable |
| `ChannelPartnerDetails.tsx` | 5 | Same `ChannelPartner` interface drift; `Commission.commission_percentage` typed non-nullable, DB allows null |
| `Projects.tsx` | 4 | Not yet analysed in detail — flagged for next pass |
| `Leads.tsx` | 4 | (same) |
| `Followups.tsx` | 4 | `followup_status` enum literals |
| `SiteVisits.tsx` | 3 | Not yet analysed |
| `Inventory.tsx` | 3 | `base_price` nullable in DB, typed non-nullable in insert payload |
| `Employees.tsx` | 2 | `employment_status` enum literal mismatch |
| `ChannelPartners.tsx` | 2 | Same `ChannelPartner` drift |

**Decision:** `src/types/database.ts` is committed as the authoritative,
regeneratable reference, but `supabaseClient.ts` is **not** wired to
`createClient<Database>(...)` yet — doing so today would force fixing all 93
errors across pages outside this engagement's current scope (Inventory,
Employees, Projects). Recommend turning it on page-by-page as each page is
repaired, so type safety ratchets forward instead of blocking unrelated work.

### Live database triggers — respect these, do not reimplement them

| Trigger | Table | Behaviour |
|---|---|---|
| `release_inventory_after_booking_cancel_trigger` | `bookings` UPDATE | Sets the linked `project_inventory` unit back to `available` when a booking's status transitions to **exactly `'cancelled'`** (verified: a transition to `'refunded'` does **not** fire it — see below) |
| `validate_booking_inventory_trigger` | `bookings` INSERT | Server-side booking validation |
| `update_inventory_after_booking_trigger` | `bookings` INSERT | Marks inventory booked |
| `calculate_cp_commission_trigger` | `cp_commissions` INSERT | Recomputes `pending_amount` and `status` from `payable_amount`/`paid_amount` — the app's own status-setting logic on insert is redundant |
| `calculate_attendance_late_minutes_trigger` | `attendance` INSERT | Auto-computes lateness |
| `calculate_campaign_metrics_trigger` | `campaigns` INSERT | Auto-computes campaign metrics |

### Fixed in this pass: booking cancellation, token refund, loss log

`Bookings.tsx` previously told the user that cancelling a *confirmed*
booking leaves the inventory unit locked (false — the trigger above releases
it) and had no way to record a token-money refund or a loss when money was
forfeited. Rebuilt as a dedicated `handleCancelBooking` flow:

- Corrected the misleading notice; the cancellation modal now states the
  unit will be released (accurate).
- Added a required cancellation reason and, when the booking has
  `token_amount > 0`, a refund-amount field (capped to the token amount).
- Writes `cancelled_at`, `cancellation_reason`, `refund_amount` on the
  booking, and voids any linked `cp_commissions` row (`status = 'cancelled'`)
  since the referral fee was earned on a sale that no longer exists.
- Any amount not refunded is written to a new `loss_logs` table (additive
  migration `add_loss_logs_table`; no existing tables altered).

**A real bug was caught before it shipped, via a rolled-back SQL dry run
against the live database (not guessed, not assumed):** the first version of
this fix set the booking's terminal status to `'refunded'` when any money
was returned, reasoning that `booking_status` has both `'cancelled'` and
`'refunded'` as distinct enum values. Testing against the live schema
showed the release trigger only fires on `status = 'cancelled'` — using
`'refunded'` silently skipped inventory release. Fixed: the booking status
is always set to `'cancelled'`; `refund_amount` alone fully captures how
much was returned. Re-verified with a second dry run (`BEGIN ... ROLLBACK`,
no data touched) confirming the booking updates, the inventory unit
releases via the trigger, and the loss log is written.

Removed the old duplicate manual inventory-release code for the
confirmed→cancelled transition from `handleUpdateStatus`, since the trigger
already handles it; `handleUpdateStatus` now only handles `draft →
confirmed`, and all cancellations go through `handleCancelBooking`.

### Tables already present that reduce "new feature" scope

| Table | Notable columns already there |
|---|---|
| `tasks` | `assigned_to`, `assigned_by`, `project_id`, `lead_id`, `due_date`, `priority`, `status` |
| `notifications` | `user_id`, `notification_type`, `related_entity`, `related_id`, `is_read` |
| `attendance` | GPS lat/long for check-in and check-out, selfie URL columns, `late_minutes`, `half_day`, `leave_type`, `approved_by` |
| `cp_leads` | `cp_id`, `lead_id`, `project_id`, `submitted_at`, `status`, `remarks` — needs `claim_expires_at` + `verification_code` added |
| `campaigns` | `platform`, `budget`, `spend`, `impressions`, `clicks`, `leads`, `bookings`, `revenue` |
| `leads` | already has `telecaller_id`, `sourcing_manager_id`, `channel_partner_id` |
| `bookings` | already has `token_amount`, `refund_amount`, `cancelled_at`, `cancellation_reason` |

Only `leave_requests`, `call_logs`, `cp_outreach`, and `loss_logs` need
creating from scratch.

### Permission system: fully designed, switched off

`roles` (14 rows) and `permissions` (91 rows) are populated; `role_permissions`
— the table that would actually connect them — is **empty (0 rows)**. RLS
helper functions already exist and are unused by any policy:
`is_super_admin()`, `current_user_has_role(text[])`, `has_project_access(uuid)`,
`can_manage_leads()`, `can_manage_project(uuid)`. Every table's RLS policy is
currently a blanket `TO authenticated USING (true)`, and `ProtectedRoute.tsx`
only checks "is logged in" — so every role can currently reach every page,
including Reports and Settings. Not fixed in this pass — this is Phase 5 of
the engagement plan.

### Security advisor findings (Supabase `get_advisors`, not yet remediated)

- `commission_payouts`: RLS enabled, no policies (see above — recommend dropping the table).
- 8 functions with mutable `search_path` (`calculate_inventory_total_price`,
  `validate_booking_inventory`, `update_inventory_after_booking`,
  `release_inventory_after_booking_cancel`, `calculate_cp_commission`,
  `calculate_campaign_metrics`, `calculate_attendance_late_minutes`,
  `is_authenticated`).
- 6 `SECURITY DEFINER` functions executable by the anonymous role via REST:
  `can_manage_leads`, `can_manage_project`, `current_user_has_role`,
  `handle_new_user`, `has_project_access`, `is_super_admin`.
- Leaked-password protection disabled on Supabase Auth.

All four items are addressed in Phase 5 of the engagement plan (permission
system activation), since fixing them properly requires the same RLS pass.

## Feature reality matrix

| Screen | Status | Notes |
|---|---|---|
| Channel Partners — list | Fixed this pass | Was broken (missing table), now points at real data |
| Channel Partners — detail: Overview / Leads / Site Visits / Bookings tabs | Working | Uses real tables throughout |
| Channel Partners — detail: Referral Fees (Commissions) tab | Working | `cp_commissions`, real data |
| Channel Partners — detail: Payouts tab | Working | `cp_commission_payouts`, real data |
| Channel Partners — detail: Towers lookup | Fixed this pass | Was broken (missing table) |
| Channel Partners — commission rate edit (list page modal) | Dead code removed this pass | Never had a live UI surface; real rates are set via commission_structures on the detail page |
| Bookings — create/confirm | Working | Validated by live triggers |
| Bookings — cancel (draft or confirmed) | Fixed this pass | Accurate UI copy, reason + refund capture, referral fee void, loss log |
| Marketing | Placeholder | `PlaceholderPage.tsx` |
| Attendance | Placeholder | `PlaceholderPage.tsx` — but `attendance` table already exists and is schema-rich |
| Tasks | Placeholder | `PlaceholderPage.tsx` — but `tasks` + `notifications` tables already exist |
| Reports | Placeholder | `PlaceholderPage.tsx` |
| Settings | Placeholder | `PlaceholderPage.tsx` |
| Role-based access | Absent | Every role sees every page; permission tables exist but are unpopulated |

## Not yet done (tracked for subsequent phases per the engagement plan)

- Telecaller call tracking.
- Tasks UI (schema already exists).
- Attendance + Leave UI (schema already exists, `leave_requests` still needed).
- Reports (admin-only).
- Turn on the permission system; remediate the 4 security advisor findings.

## Phase 1.3: "Commission" -> "Referral Fee" rename (this pass)

Renamed every user-facing occurrence of "Commission"/"commission" across
`ChannelPartnerDetails.tsx`, `ChannelPartners.tsx`, `Payments.tsx`, and
`Bookings.tsx` (103 lines changed) to "Referral Fee"/"referral fee" — labels,
tab names, button text, notification/error messages, and JSX text nodes.

Deliberately left unchanged: table names (`cp_commissions`,
`commission_structures`, `commission_payments`), column names
(`commission_amount`, `commission_percentage`, ...), TypeScript
interface/type names (`Commission`, `CommissionStructure`,
`CommissionPayment`), and JS variable/function identifiers
(`totalCommission`, `commissionsList`, `handleCreateManualCommission`,
etc.). Renaming those would touch live database schema and internal code
structure for no user-visible benefit, and was explicitly out of scope per
the engagement plan ("table names stay as-is").

Verified via `tsc -b --noEmit`, `npm run build`, and `npm run lint` all
clean, plus a manual scan confirming no remaining user-facing "Commission"
text in the four files.

## Phase 1.4: Channel Partner deactivation (this pass)

A deactivate/activate toggle for channel partners **already existed** in
`ChannelPartners.tsx` (`handleToggleStatus`, confirmation modal, list-row
button) — it correctly flips `status` between the live `channel_partner_status`
enum values `active`/`inactive`. No feature was missing here; the client's
request was already implemented.

What was actually missing was the **referrer guard**: checked all three
places a channel partner can be picked as a lead/booking referrer.
`Leads.tsx` and `SiteVisits.tsx` already filter `.eq('status', 'active')`
when loading the partner dropdown. `Bookings.tsx` did not — its query was
commented `// Fetch active Channel Partners` but had no actual status
filter, so a deactivated partner could still be selected as the referrer on
a new booking. Fixed: added the missing `.eq('status', 'active')`.

## Phase 2: Lead integrity rules (this pass)

**Global lead dedup + first-come-first-served.** `leads` already had a few
pre-existing duplicate phone numbers among test data (normalized numbers
1234567890 and 7894561230, 2-3 rows each). A plain `UNIQUE` index would
have failed to create against that data, and cleaning/merging those rows
wasn't this migration's call to make. Used a `BEFORE INSERT` trigger
(`prevent_duplicate_lead_phone_trigger`) instead — it only evaluates new
rows, so existing data was never touched or validated, and it gives a
clean custom error instead of a raw constraint violation. Phone numbers are
normalized (`normalize_phone()`) before comparison so `98765 43210`,
`+919876543210`, and `919876543210` are recognised as the same number.
Verified with a rolled-back SQL dry run: a genuine duplicate is blocked, a
fresh number succeeds, no existing rows were read/write-locked or altered.

**45-day Channel Partner lead claim.** `cp_leads` already existed
(`cp_id`, `lead_id`, `project_id`, `submitted_at`, `status`, `remarks`) but
nothing in the app wrote to it. Extended with `claim_expires_at`,
`verification_code`, `verified_at`. `Leads.tsx` now creates a `cp_leads`
row (45-day expiry, unique verification code) whenever a lead is tagged
with a referring channel partner. A daily `pg_cron` job
(`expire-cp-lead-claims-daily`, 2am UTC) marks lapsed claims `expired` and
clears `leads.channel_partner_id` so the CP is no longer attributed —
unless the lead already reached `booking_done`. Verified with a rolled-back
dry run: a claim set to expire in the past correctly flips to `expired`
and the lead's CP attribution clears.

**Verification code delivery (WhatsApp)** is generated and stored now but
not yet sent — that lands with the WhatsApp gateway in Phase 3/4.

## Phase 3: WhatsApp gateway (this pass)

Built a standalone `whatsapp-gateway/` Node service on `@whiskeysockets/baileys`
(free, unofficial, no Chromium — runs on any free-tier host). Not part of the
Vite app; deploys separately.

**How it connects to the CRM:** two new Supabase tables. `whatsapp_outbox`
is the send queue — the CRM (or anything else with DB access) inserts rows
here; the gateway's worker polls, throttles, and sends them, updating
status as it goes. `whatsapp_auth_state` persists the Baileys session
(creds + signal keys) as a JSON blob, since a free-tier host can restart or
redeploy between messages — without this, every restart would force
re-scanning the QR code. A custom `useSupabaseAuthState` adapter wraps
Baileys' own `useMultiFileAuthState`: rehydrates a temp directory from
Supabase on boot, lets Baileys manage it normally, re-uploads the whole
directory on every `creds.update`.

**Verified live, not just written:** ran the gateway locally with the real
Supabase project URL. It connected to WhatsApp's actual servers, completed
the Baileys handshake, and generated a real, scannable QR code — confirmed
by fetching it through `GET /qr` and getting back a valid base64 PNG.
`GET /status` correctly reported connection state. Environment validation
exits cleanly with a clear message when Supabase credentials are missing
(no crash/stack trace). Confirmed the auth-state table is genuinely
RLS-protected: booting with only the app's public anon/publishable key (no
service-role key available in this environment) resulted in the row
silently not being written, exactly as designed — the gateway needs the
real `service_role` key at deploy time to persist sessions, which only the
client can provide from their Supabase dashboard.

**Throttling:** randomised 8-15s gap between sends, 200/day cap, both
configurable via env vars. Exponential backoff on HTTP 429. These reduce
but cannot eliminate the ban risk inherent to any unofficial WhatsApp
client — documented plainly in `whatsapp-gateway/README.md` along with
full deploy instructions (Fly.io / Render) and the re-pairing procedure.

**Wired into the app this pass:** the CP lead verification code (Phase 2)
now actually enqueues into `whatsapp_outbox` and sends to the lead's
mobile number when a channel partner is tagged on a new lead. Added a
verification UI to the Channel Partner detail page's Leads tab — staff see
the code, claim expiry date, and a Verify button for confirming the code a
client shows at site visit.

**Not yet done:** the Marketing page itself (bulk campaign builder) — the
sending infrastructure it needs already exists and is proven working.

## Phase 4.1: Marketing — WhatsApp bulk messaging (this pass)

New `src/pages/Marketing.tsx` replaces the `PlaceholderPage` at `/marketing`.
Audience builder filters `leads` by project, status, and "CP-referred
only"; live match count shown before sending. Message template supports a
`{{name}}` merge field. On submit: creates a `campaigns` row
(`platform=whatsapp`) and bulk-inserts one `whatsapp_outbox` row per
matched lead, tagged with `campaign_id` and `lead_id`. The gateway built in
Phase 3 picks these up and sends them, throttled.

Delivery dashboard aggregates `whatsapp_outbox` status counts
(queued/sending/sent/failed) per campaign — this reads directly from the
outbox rather than `campaigns`' own metric columns, since those are for ad
spend, not messaging delivery.

## Phase 4.2: CP Outreach form (this pass)

New `src/pages/CPOutreach.tsx` + `cp_outreach` table, ported field-for-field
from the reference CRM (`CRM/src/pages/CPOutreach.jsx`) and rewritten in
TS/Tailwind to match this project's conventions. Adapted to the live
schema: the reference table used `channel_partner_firm_name`; this
project's `channel_partners` uses `company_name`/`name`, so the autosuggest
and exact-match auto-fill match against both.

Sourcing Manager selector is role-driven (employees joined through
`user_roles` -> `roles.name = 'sourcing_manager'`), not free-text, with an
"Other" fallback for people not yet in the system as a real employee
record — same pattern the reference used for its equivalent field.
Preserved two behaviours from the reference's own code comments: the
"Other" value is a UI sentinel that never reaches the `sourcing_manager_id`
foreign key, and `cp_outreach` is deliberately exempt from the Phase 2 lead
phone-dedup trigger (it only applies to `leads`, not this table) since
Fresh/Re-visit means repeat contact with the same CP is expected, not a
duplicate.

GPS location capture on submit (separate from the free-text Location
field) confirms the logger was actually on-site. New sidebar nav item
"CP Outreach" added under Channel Partners.

Verified with a rolled-back SQL dry run confirming the insert shape
(including the `leads_source_active_in` array column) matches the live
schema exactly.
