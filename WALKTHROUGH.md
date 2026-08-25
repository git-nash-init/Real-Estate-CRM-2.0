# EstateCRM — Plain-English Walkthrough

_Written for a non-technical read. No code, no jargon — just what each part of the CRM does, who uses it, how it works day to day, and what its limits honestly are. Use this to explain the CRM confidently to your own client._

---

## 1. What this CRM is, in one paragraph

EstateCRM is a real estate sales operations tool. It tracks a lead from the first enquiry all the way through site visits, negotiation, booking, and payment — and it tracks the people behind that work too: which telecaller called whom, which sourcing manager brought in which channel partner, who's checked in for the day, who's on leave. Everything lives in one shared database (Supabase), so every screen you see is reading and writing real, live records — nothing here is a mockup.

---

## 2. How to think about roles

Every person who logs in has exactly one **role** (Super Admin, Project Admin, Sourcing Manager, Telecaller, and so on — 14 in total). A role decides two things:

1. **Which pages they can even open.** A Telecaller doesn't see a "Settings" link in their sidebar at all — it's not hidden, it's not there.
2. **Which records they can see inside a page.** Two Sourcing Managers looking at the Leads page at the same time see *different* leads — each only sees the ones assigned to them (see section 12, Global Search, for the fullest explanation of this).

**Super Admin** and **Project Admin** are the two "sees everything" roles — think of them as the CRM's own owners/managers. Everyone else is scoped to their own patch of work.

---

## 3. Logging in, and what happens the first time

A person logs in with an email and password at the login screen. If it's their very first login (their account was just created by an admin — see section 11), they're forced to choose their own password before they can do anything else — the temporary one an admin generated for them only works once.

If someone forgets their password later, **Forgot Password** on the login screen sends a reset link to their email. Clicking it lets them set a new password themselves — no admin needs to get involved for a routine password reset.

---

## 4. Dashboard

The first screen after login. A live snapshot: total leads, pending follow-ups, upcoming site visits, total bookings and revenue, a lead-status breakdown chart, upcoming site visits, and a "My Tasks" panel showing tasks assigned to you specifically. Everything here updates as the underlying data changes — it's a summary view, not a separate copy of the data.

---

## 5. Leads

The core of the sales pipeline. Each lead is a person who's shown interest — a name, phone number, source (walk-in, website, channel partner referral, etc.), and a status that moves through a funnel: New → Contacted → Visit Scheduled → Booked (or Lost). You can search, filter by project/status/source, and open any lead to see its full history.

**Logging a call** (Telecaller / Sales roles): open a lead, click **Log Call**. This is where the anti-fraud changes live — see section 13 for the full explanation of how this works and why.

---

## 6. Follow-ups & Site Visits

**Follow-ups** is a to-do list generated from leads that need a next action — a callback, a scheduled check-in. **Site Visits** tracks scheduled property visits: who's visiting, which project, when, and the outcome afterward. Both pull from and update the same underlying lead records, so a follow-up completed here shows up on that lead's timeline too.

---

## 7. Projects & Inventory

**Projects** is your list of real-estate projects/developments. **Inventory** is the actual sellable units within each project — flats, plots, whatever the product is — with configuration, area, pricing, and status (available, on hold, sold). When a unit is put on hold or sold, that status is what everything downstream (Bookings, Payments) reads from — there's no separate spreadsheet to keep in sync.

---

## 8. Bookings & Payments

**Bookings** is where a lead becomes a sale: pick the unit, the customer, the sales owner, the amount. Cancelling a booking properly releases the inventory unit back to "available" and logs the refund/loss — this was a real bug fixed earlier in the engagement (see AUDIT.md), so it's worth knowing it's now solid. **Payments** tracks the installment schedule and receipts against a booking.

---

## 9. Channel Partners & CP Outreach

A **Channel Partner** is an external broker/agent who refers customers to you in exchange for a referral fee. The Channel Partners page manages their KYC, status (active/inactive), and referral-fee ledger. **CP Outreach** is a field-log for your sourcing managers — recording an in-person or phone visit to a channel partner, with GPS capture, so there's a record of relationship-building activity that isn't tied to a specific deal.

---

## 10. Marketing (WhatsApp)

Bulk WhatsApp messaging to a filtered audience of leads (by project, status, or channel-partner-referred). You write one message with a `{{name}}` placeholder, pick your audience, and the system sends it out gradually (with built-in delays) rather than all at once — this is a deliberate safety measure, explained in section 14.

The WhatsApp connection itself lives under **Settings**: a QR code to scan with the business WhatsApp number, live connection status, and a Log Out button if you ever need to re-pair.

---

## 11. Employees & Onboarding

This is where you add a new team member and give them CRM access. Here's exactly what happens when you click **Add Employee**:

1. You fill in their details — name, designation, department, and (important) **their real email address**, not a placeholder.
2. You assign their role and, if relevant, which project(s) they're attached to.
3. On save, the system generates a random, one-time password for them and shows it to you **once**, in a popup with a copy button. It is never shown again and never stored anywhere in plain text — if you lose it, you'll need to trigger a reset (see below).
4. You hand that password to the new employee through whatever private channel you'd use anyway — a phone call, a chat message, in person.
5. They log in with it, and are **immediately required to set their own password** before they can do anything else in the CRM. From that point on, it's their password, not yours.
6. If they ever forget it later, they use **Forgot Password** on the login screen like anyone else — as long as you gave them a real, working email address in step 1.

**Why the real email matters:** if you leave it blank, the system falls back to a placeholder address that can receive login but can never receive a password-reset email — meaning if that person forgets their password, you'd have to manually reset it for them rather than them doing it themselves. Always use a real address you know they check.

**Who can do this:** only Super Admin and Project Admin can open the Employees page and onboard new people.

---

## 12. Global Search — and exactly what "your data only" means

The search bar at the top of every page does two things when you type: it suggests matching **pages** (type "attend" and it'll suggest the Attendance page — but only if your role can actually open it), and it searches matching **records** — leads, bookings, channel partners, projects, inventory units.

**The part that matters most:** what records show up depends on who's searching.

- **Super Admin / Project Admin** search everything — full visibility, by design.
- **Everyone else** only sees records they're actually connected to: leads where they're the assigned owner, sourcing manager, or telecaller; bookings where they're the sales owner or closing manager; channel partners they personally manage; and anything tied to a project they've been assigned to.

So if Sourcing Manager A and Sourcing Manager B are both using search at the same time, typing the same letters, they'll see different results — each only sees their own patch. This was a specific requirement, and it's built exactly to that spec.

**One honest limitation worth knowing:** this scoping lives in the search feature itself — it controls what the search bar's own queries return. It is not yet a database-level lock that would stop someone from pulling data a different way if they had direct access to the database (most tables still allow any logged-in user's session to read broadly at the database layer — a known, documented gap from earlier in this engagement, not something new). For the purposes of "can Sourcing Manager A see Sourcing Manager B's leads while using the CRM normally" — the answer is no, correctly. For "is this a hard security wall against someone deliberately trying to query around the app" — not yet; that's flagged as follow-up work.

---

## 13. Attendance & Leave

Employees check in and check out with GPS location capture, marking their attendance for the day. They can also request leave.

**Leave approval is restricted to Super Admin only** — this was a specific requirement. It's enforced two ways: the approval screen simply doesn't appear for anyone else, and separately, the database itself refuses the approval action if it's attempted by anyone who isn't a Super Admin (and refuses a Super Admin approving their own request, too). Both layers matter — the first is what a normal user experiences, the second is what stops someone from bypassing the first layer some other way.

**One thing to know:** check-in/out only works for people who have an Employee record in the system (created via the Employees page, section 11). Someone with a login but no linked employee record will see a clear message explaining that, rather than a confusing broken screen.

---

## 14. Telecaller Call Logging — and how it stops fake calls

This is worth explaining carefully, because it was a specific concern: *"how do I know a telecaller actually made the calls they say they made?"*

**How logging a call works now:**

1. A telecaller opens a lead and clicks **Log Call**.
2. Instead of typing in how long the call lasted, they click **Start Call** — a live timer starts running on screen.
3. They actually make the call. When it's done, they click **End Call** — the timer stops.
4. The duration that gets saved is *exactly* what the timer measured. There is no box to type a number into anymore — it's simply not possible to log a 10-minute call that only took 10 seconds.
5. The app also quietly captures the phone's GPS location the moment the call starts (with the browser's permission).
6. Once saved, that call also updates the lead's "last contacted" timestamp — so there's a second, independent trace of the contact elsewhere in the system, not just the call log itself.

**What stops someone from logging a call under a colleague's name:** the database itself checks that whoever is submitting a call log is logging it under *their own* employee record — not anyone else's. This was tested directly against the database (not just assumed): a simulated non-admin user could successfully log their own call, but was rejected when the simulation tried to log one under a different employee's ID.

**The Fraud Signals panel** (Reports page, admin only) actively looks for suspicious patterns and flags them:
- **Burst logging** — one person logging 5 or more calls within a 10-minute window (a real telecaller physically can't do this).
- **Outside attendance window** — a call logged on a day (or at a time) the person wasn't checked in at all.
- **Connected, no progress** — a call marked "Connected" where the lead's status never moved forward afterward, which can be a sign the call was logged but never really happened, or at minimum never went anywhere.

**Here's the honest part, stated plainly, not buried:** none of this can *prove* a phone call actually took place. What it does is remove the easy, casual ways to fake a log (typing a fake duration, mass-logging fake calls in seconds, logging calls under someone else's name) and it makes the harder-to-fake patterns visible to admins instead of invisible. A telecaller who is determined to cheat could, in theory, click Start Call, wait for the real duration without dialing anyone, then click End Call — that specific case isn't caught by anything here. Catching *that* reliably requires an actual telephony/dialer system that places the call itself and can independently confirm it connected — which is a real, ongoing cost (a calling platform subscription), not a one-time build. This CRM's database already has empty placeholder fields (`provider_call_id`, `answered_at`, `recording_url`) ready for that upgrade whenever you decide it's worth the cost — nothing would need to be rebuilt, just connected.

---

## 15. Reports

Admin-only. A live analytics view: lead funnel by status, bookings and revenue by sales owner, channel-partner-referred vs. direct comparison, telecaller call performance (volume, connect rate, average duration), and the Fraud Signals panel described above. Everything here is computed from the same live data every other page reads and writes — there's no separate reporting database to keep in sync.

---

## 16. Settings

Admin-only. Currently this is where the WhatsApp connection lives — QR pairing, live connection status, and a logout/re-pair button.

---

## 17. Suggested demo flow for a client meeting

If you want to walk someone through this CRM live, this order tends to land well:

1. **Log in**, show the Dashboard — "this is the live state of the business right now."
2. **Add a lead** on the Leads page, then **log a call** against it — narrate the Start/End Call timer as you do it, since it's a visibly different (and better) experience than a typical CRM's free-text duration box.
3. **Search** for that lead by name in the global search bar — show it finding both the lead and the "Leads" page suggestion.
4. **Switch to Reports** and point at the Fraud Signals panel, even if it's empty — "the system is watching for fake call logs even when there's nothing to flag."
5. **Employees page** — walk through adding a person and the one-time password reveal, since this is a real trust/security story worth telling explicitly.
6. **Attendance** — show a check-in with GPS, and mention the leave-approval restriction as a governance detail.
7. Close on the **Marketing/WhatsApp** page if the client cares about bulk messaging — it's visually satisfying and easy to explain.

---

## 18. What's still genuinely a work-in-progress (say this out loud, don't hide it)

Being upfront about these builds trust faster than pretending everything is finished:

- **Database-level permission walls (RLS)** are only partially built — most pages correctly *hide* things a role shouldn't see, but the database itself doesn't yet independently enforce all of that for every table. This is flagged clearly in AUDIT.md and SUBMISSION.md as the top-priority next phase.
- **The `employees` table starts empty** — Attendance and any employee-linked feature won't fully work until real employee records are added via the Employees page.
- **Telecaller anti-fraud is a strong deterrent, not an ironclad guarantee** — see section 14 above for exactly where the line is.
- **WhatsApp runs on an unofficial library** (Baileys) — it works, and it's been tested live, but Meta doesn't officially support third-party WhatsApp automation, so there's a small standing risk of the connected number being flagged if messaging is too aggressive. The system already throttles sends to reduce this risk.

None of these are hidden problems — they're documented, understood, and each has a clear next step already written down.
