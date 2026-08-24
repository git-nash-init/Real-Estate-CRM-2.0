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
  exists with RLS enabled and **zero policies** — confirmed by Supabase's own
  `rls_enabled_no_policy` advisor. It silently returns 0 rows to everyone and
  duplicates `cp_commission_payouts`. Nothing in the app queries it. Recommend
  dropping it in a future migration so it cannot confuse anyone later.

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

### A newly discovered bug: Channel Partner commission editing is non-functional

`ChannelPartners.tsx`'s `ChannelPartner` interface (lines 21-51) includes
`commission_type`, `commission_value`, `default_commission_rate`,
`default_commission_amount`, `partner_name`, `phone`, `partner_type`,
`contact_person` — **none of these columns exist on the live `channel_partners`
table.** The app already has defensive fallbacks for some (`cp.phone ||
cp.mobile`), which shows a previous dev partially noticed this — but the
commission fields have no fallback:

```ts
setCommissionType(cp.commission_type || 'PERCENTAGE');          // always 'PERCENTAGE'
setFixedCommissionAmount(cp.default_commission_amount?.toString() || cp.commission_value?.toString() || '0'); // always '0'
setCommissionRate(cp.default_commission_rate?.toString() || cp.commission_value?.toString() || '2');           // always '2'
```

Because those columns do not exist, `cp.commission_type` etc. are always
`undefined` at runtime, so the edit form **always resets to the hardcoded
defaults** regardless of what is actually configured for that partner. The
real per-partner/per-project rate lives in the `commission_structures` table
(already queried correctly on the *detail* page), not on `channel_partners`
itself. **Not fixed in this pass — flagged for the next repair session**
(rewire this form to read/write `commission_structures` instead).

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
| `release_inventory_after_booking_cancel_trigger` | `bookings` UPDATE | Sets the linked `project_inventory` unit back to `available` on **any** cancellation |
| `validate_booking_inventory_trigger` | `bookings` INSERT | Server-side booking validation |
| `update_inventory_after_booking_trigger` | `bookings` INSERT | Marks inventory booked |
| `calculate_cp_commission_trigger` | `cp_commissions` INSERT | Recomputes `pending_amount` and `status` from `payable_amount`/`paid_amount` — the app's own status-setting logic on insert is redundant |
| `calculate_attendance_late_minutes_trigger` | `attendance` INSERT | Auto-computes lateness |
| `calculate_campaign_metrics_trigger` | `campaigns` INSERT | Auto-computes campaign metrics |

**Known contradiction (not yet fixed):** `Bookings.tsx:1842` tells the user
that cancelling a *confirmed* booking leaves the inventory unit locked. The
trigger above releases it regardless of prior status. The UI's warning is
false. `Bookings.tsx` also manually re-implements the release for draft
bookings (~line 914), duplicating what the trigger already does. Flagged for
the booking-cancellation repair phase.

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
| Channel Partners — commission rate edit (list page modal) | Broken, not yet fixed | Silently reads non-existent columns, see above |
| Bookings — create/confirm | Working | Validated by live triggers |
| Bookings — cancel (confirmed) | Misleading, not yet fixed | UI claims unit stays locked; DB trigger releases it anyway. No token refund or loss log yet. |
| Marketing | Placeholder | `PlaceholderPage.tsx` |
| Attendance | Placeholder | `PlaceholderPage.tsx` — but `attendance` table already exists and is schema-rich |
| Tasks | Placeholder | `PlaceholderPage.tsx` — but `tasks` + `notifications` tables already exist |
| Reports | Placeholder | `PlaceholderPage.tsx` |
| Settings | Placeholder | `PlaceholderPage.tsx` |
| Role-based access | Absent | Every role sees every page; permission tables exist but are unpopulated |

## Not yet done (tracked for subsequent phases per the engagement plan)

- Fix the Channel Partner commission-edit bug found above.
- Booking cancellation: correct the false UI warning, remove the duplicate
  manual inventory release, add token refund + loss log.
- Rename "Commission" -> "Referral Fee" in CP-facing copy.
- Deactivate-a-channel-partner UI + referrer guard.
- Lead dedup, 45-day claim window, first-come-first-served, verification codes.
- WhatsApp gateway (Baileys) + Marketing bulk messaging.
- CP Outreach form (ported from the reference CRM).
- Telecaller call tracking.
- Tasks UI (schema already exists).
- Attendance + Leave UI (schema already exists, `leave_requests` still needed).
- Reports (admin-only).
- Turn on the permission system; remediate the 4 security advisor findings.
