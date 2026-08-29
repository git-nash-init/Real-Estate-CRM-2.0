# Role & Permissions Audit — Opal Properties CRM

**Status:** Findings only. Nothing in this document has been changed yet.
**Roles in the live database (14):** super_admin, project_admin, site_head, sourcing_manager_tl, sourcing_manager, telecaller, presales_tl, presales, closing_manager_tl, closing_manager, marketing_head, marketing, receptionist, channel_partner

---

## Why this keeps happening

There is no single place that says "who can do what". Every page invents its own
rule — one uses `role === 'super_admin'`, another uses `super_admin || project_admin`,
a third checks nothing at all. That's why fixing one screen never fixes the next one.

The fix is one permissions file that every page reads from. Until that exists,
each new screen will keep reintroducing the same class of bug.

---

# CATEGORY A — Anyone can perform actions they shouldn't

Sorted by business risk.

### A1. The Projects page has almost no restrictions at all 🔴
Every role except channel partner can create projects, edit projects, edit towers,
add units and bulk-add units. Only *delete* is restricted.

This is the most serious finding because **Inventory already restricts these exact
same operations correctly** — so a receptionist blocked from adding a unit in
Inventory can simply go to Projects and do it there.

| Action | Projects page | Inventory page |
|---|---|---|
| Bulk Add Units | anyone | super admin only |
| Add Unit | anyone | admin only |
| Edit Unit / Tower | anyone | admin only |
| Add / Edit Project | anyone | — |

### A2. Cancelling a confirmed booking is open to everyone 🔴
*Confirming* a booking is properly restricted (super admin, or site head on their
own project). But **cancelling** one — which releases the unit, voids the
brokerage and writes a loss log — has no restriction at all. The destructive
action is less protected than the safe one.

### A3. Payments: Edit and Cancel Transaction are open to everyone 🔴
Only the hard delete is restricted. "Cancel Transaction" voids a payment record,
which is financially equivalent to deleting it. Any role can do it.

### A4. Marketing: anyone can send a bulk WhatsApp blast 🔴
Any non-CP role can launch a campaign to the entire lead database.
This directly contradicts Settings, where merely *using* WhatsApp is restricted to
super admin and closing managers. Marketing bypasses that restriction entirely.

Real-world consequence: this is also the fastest way to get the company's WhatsApp
number banned.

### A5. Leads: who can *edit* is far looser than who can *create* 🟠
- **Create** is correctly limited to: sourcing manager, sourcing manager TL, super admin, site head.
- **Edit** allows *everyone except channel partner*.

So a telecaller, presales, marketing, receptionist or closing manager **cannot create
a lead but can edit any lead** — including reassigning its owner, sourcing manager
and telecaller. Same mismatch appears again in the lead detail popup.

### A6. Follow-ups: no restrictions anywhere in the file 🟠
Create, Edit and Complete are all open to every role, with **no ownership check** —
any user can edit or complete another user's follow-up.

### A7. Site Visits: "Complete" is open to everyone 🟠
No role check and no ownership check. Only delete is restricted.

### A8. Tasks: anyone can create and assign work to anyone 🟡
Combined with the unscoped "Assign to" dropdown (B1), any role can assign a task to
the super admin or to a channel partner.

### A9. Bulk Uploads — three different answers for one feature 🟠
| Layer | Who's allowed |
|---|---|
| Sidebar menu | super admin, site head, sourcing manager, sourcing manager TL, telecaller, channel partner |
| Upload button on page | same list **minus telecaller** |
| The route itself | **no restriction — anyone can reach it by typing the URL** |

A telecaller sees the menu item, clicks it, and lands on a page with no upload
button. Meanwhile presales/marketing/receptionist can reach the page directly.

Also worth deciding: bulk upload *creates leads*, and it's open to channel partners —
which contradicts the rule that channel partners can't create leads.

### A10. New Booking button has no role check 🟡
Any role, including channel partner (the bookings route doesn't exclude them), can
open the create-booking form.

---

# CATEGORY B — Dropdowns showing too much

**Agreed rule going forward: scope dropdowns to the user's assigned projects.**
Super admin sees everything; a site head or project admin assigned to one project
sees only that project; a channel partner sees only their assigned projects.

The project-assignment data already exists (set in the Employees form, and
`channel_partner_projects` for partners) — but **no dropdown anywhere uses it**.

Currently loading every row, unscoped:

| Page | Dropdowns affected |
|---|---|
| Leads | Projects, all user profiles |
| Bookings | User profiles, leads, inventory units |
| Payments | Projects, towers, inventory, bookings, channel partners |
| Follow-ups | Projects, users, **entire leads table** |
| Site Visits | Projects, users, leads |
| Marketing | Projects, **entire leads table** (campaign audience) |
| Inventory | Projects, inventory, bookings, leads |
| Projects | Projects, inventory, bookings, leads |
| Tasks | All user profiles (the "Assign to" list) |
| Dashboard | Leads, bookings, projects, users |
| Attendance | All employees |

Note: a channel partner can currently reach **Bookings** and **Payments** (neither
route excludes them) and would see every project, unit and booking in those
dropdowns.

---

# CATEGORY C — Dropdowns missing options they should show

These are the "the form won't let me pick the person/project I need" complaints.

### C1. Closing Manager TLs are missing from the Closing Team dropdown 🔴 CONFIRMED
The lead form filters for role names `telecaller_tl` and `closing_tl`.
**Neither of those roles exists** — I verified against the live database. The real
role is `closing_manager_tl`.

Result: **every Closing Manager TL is silently absent** from the Closing Team
dropdown on the lead create/edit form. `telecaller_tl` matches nothing at all.
Presales and Presales TL aren't mapped to any dropdown either.

### C2. Bookings can't be created against upcoming projects 🟠
The Bookings page only loads projects with status `active`. Projects support five
statuses (active, upcoming, completed, on_hold, inactive).

A pre-launch (`upcoming`) project can't be booked against — which is a normal
real-estate scenario. Every other page (Leads, Payments, Site Visits, Follow-ups,
Marketing) loads projects *without* that filter, so the same project appears in five
places and is missing only in Bookings.

*Currently all 5 projects are `active`, so this isn't biting yet — it will the moment
someone adds an upcoming project.*

### C3. Channel Partners page has the same filter 🟡
Partners mapped to an upcoming/on-hold project show a blank project name.

### C4. CP Outreach shows deactivated partners 🟡
Every other page filters channel partners to `status = active`. CP Outreach doesn't —
so rejected, pending and deactivated partners appear in its picker.

---

# CATEGORY D — Smaller things worth knowing

- **Expenses is hidden by a hardcoded email address** (`anilhiwale17@gmail.com`) rather
  than by role. Brittle, and invisible to the permission system — if that person's
  email changes, the rule silently stops working.
- **Reports has no route guard** by design (the page scopes itself internally). Worth
  confirming it handles `receptionist` and `marketing`, which aren't in its team-role list.
- **Attendance leave approval is the cleanest gating in the codebase** — restricted to
  super admin *and* blocks self-approval. Good model for the rest.
- **A data-scoping helper already exists** (`dataScope.ts`) but is only used by the global
  search box. No page uses it — which is precisely why every dropdown is unscoped.

---

# Suggested order of work

1. **Category A1–A4** — the genuinely dangerous ones (Projects wide open, booking
   cancel, payment cancel/edit, marketing blast).
2. **C1** — the confirmed Closing Manager TL dropdown bug; small fix, real daily impact.
3. **A5, A9** — align the inconsistent rules (lead edit vs create; bulk upload's three
   different answers).
4. **Central permissions file** — then move every page onto it, so this class of bug
   stops recurring.
5. **Category B** — project-scoped dropdowns, done once centrally rather than page by page.
