# Hardening Checklist

- `[x]` Cascading dropdown reset validation in `Bookings.tsx` (changing project resets tower and unit; changing tower resets unit).
- `[x]` Safe database-side validation right before inserting a booking in `Bookings.tsx`.
- `[x]` Atomic optimistic concurrency lock in `handleCreateSubmit` in `Bookings.tsx` (using conditional update to prevent double-booking).
- `[x]` Atomic optimistic concurrency lock in `handleUpdateStatus` (draft → confirmed) in `Bookings.tsx`.
- `[x]` Releasing inventory unit to `AVAILABLE` on booking cancellation if booking was confirmed.
- `[x]` Centralizing validation error handling to output clear, user-friendly messages instead of raw DB constraints.
- `[x]` Fetch-before-save database status check in `handleUnitSubmit` in `Inventory.tsx`.
- `[x]` Enforcement of the transition matrix in `Inventory.tsx` direct edits.
- `[x]` Build client bundle using `npm run build` to confirm compilation.

# Payments Module Integration Checklist
- `[x]` Create a complete Payments module page at `Payments.tsx` displaying statistics, filter lists, and modals.
- `[x]` Register and mount route for `payments` inside `App.tsx`.
- `[x]` Add a tab selector in Booking View modal for "Booking Details" vs "Payment Ledger".
- `[x]` Add dynamic overpayment limits (booking amount check) during payment creation.
- `[x]` Build browser-level print layout style for Tax Receipt invoice.
- `[x]` Run strict compiler build check to ensure all files compile cleanly with zero errors.

# Booking & Payments Financial Charges Structure Checklist
- `[x]` Design non-destructive Postgres migration schema (`migration_booking_financial_charges.sql`) for bookings table financial structure.
- `[x]` Add financial inputs (GST, Stamp Duty, Registration Charges, Development, Maintenance, Parking, and Other charges) to Booking Create Form in `Bookings.tsx`.
- `[x]` Implement dynamic real-time recalculations for total additional charges and total payable in UI.
- `[x]` Update Directory lists and details view to display both Base amount and Total Payable columns with backward compatibility fallbacks.
- `[x]` Adjust overpayment constraints and dashboard stats in `Payments.tsx` to handle `total_payable_amount` using strictly received payments.
- `[x]` Resolve database mismatch and prevent white-screen crashes by changing explicit select queries to `select('*')` with fallback calculations.
- `[x]` Run production build check to guarantee clean compilation.

# Channel Partner Module Integration Checklist
- `[x]` Design idempotent DB migration schema `migration_channel_partner_module.sql` mapping regulatory, banking, and commission snapshot fields.
- `[x]` Implement directory lists and dashboard metrics in `ChannelPartners.tsx` using real Supabase connections.
- `[x]` Implement sub-ledger detail views with Overview, Leads, Site Visits, Bookings, Commissions, Payments, and Projects tabs in `ChannelPartnerDetails.tsx`.
- `[x]` Add fallback field mappings (`cp_code || partner_code`, `partner_name || name`, `phone || mobile`) to prevent database schema cache mismatches.
- `[x]` Integrate referral selectors inside Leads creation and detail modules.
- `[x]` Auto-inherit referrers in Site Visits scheduling form.
- `[x]` Inherit referrers in Bookings and write frozen commission snapshot to `channel_partner_commissions` at confirmation.
- `[x]` Run production bundler build checks successfully.
