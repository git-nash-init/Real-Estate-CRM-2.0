import type { UserRole } from '../types/auth';

/**
 * Central Permissions Registry
 *
 * Single source of truth for who can perform what actions across the application.
 *
 * Signature note: role params are `Role` (UserRole | string | null | undefined)
 * and id params are `Id` (string | null | undefined). Deliberately permissive --
 * call sites pass values straight from useAuth() (`role` is UserRole | null) and
 * from database rows (where optional columns are `string | undefined`), and
 * `<ProtectedRoute allowedRoles>` types its role as plain `string | null`.
 * Narrower types here forced a cast at every call site, which is exactly the kind
 * of friction that leads people to skip the check entirely.
 */
type Role = UserRole | string | null | undefined;
type Id = string | null | undefined;

// Super Admins can do everything
export const isSuperAdmin = (role: Role) => role === 'super_admin';

// Admin-level roles for general management
export const isAdminLevel = (role: Role) =>
  ['super_admin', 'project_admin', 'site_head'].includes(role as string);

// A1: Projects
export const canManageProjects = (role: Role) => isAdminLevel(role);
export const canBulkAddUnits = (role: Role) => role === 'super_admin';

// Creating a brand-new project is narrower than canManageProjects (which
// still governs editing towers/floors/units for project_admin/site_head).
// Client's explicit instruction: only super_admin can add a new project --
// closing_manager and presales were both reaching this via an ungated
// empty-state "+ Create Project" button the audit found.
export const canCreateProject = (role: Role) => role === 'super_admin';

// A2, A3: Financial & Booking destructive actions
export const canCancelBooking = (role: Role) => role === 'super_admin';
export const canEditPayment = (role: Role) => isAdminLevel(role);
export const canCancelPayment = (role: Role) => role === 'super_admin';

// A4: Marketing
export const canSendMarketingBlast = (role: Role) => 
  ['super_admin', 'closing_manager', 'marketing_head'].includes(role as string);

// A5: Leads
// The full lead form (Fresh/Revisit, Sourcing Manager, Project, Presales/
// Telecaller, Allocated To/Closing Manager, requirement details, budget,
// follow-up, status -- the "official" leads directory) is only for the
// roles who actually allocate leads to other people: super_admin,
// site_head, receptionist, closing_manager, closing_manager_tl. Everyone
// else adds leads for themselves through the separate, simpler "Own
// Leads" form instead (see canAddOwnLead below) -- channel_partner keeps
// its own pre-existing cut-down variant of this same full form, unrelated
// to either of these.
export const canCreateLead = (role: Role) =>
  ['super_admin', 'site_head', 'receptionist', 'closing_manager', 'closing_manager_tl'].includes(role as string);

// "Own Leads" -- a self-service lead list, separate from the main Leads
// directory, for roles that don't allocate leads to others but still need
// somewhere to log a lead they personally sourced. Excludes channel_partner
// (has its own separate flow already) and the canCreateLead roles above
// (they use the full form instead).
export const canAddOwnLead = (role: Role) =>
  role !== 'channel_partner' && !canCreateLead(role);

// Who can see the Own Leads tab at all -- everyone who can add to it (to
// see their own), plus super_admin/site_head for oversight of everyone
// else's self-added leads (super_admin already sees everything via
// leads_select; site_head gets a dedicated RLS carve-out for is_own_lead
// rows specifically, since their normal visibility is allocation-based).
export const canViewOwnLeadsTab = (role: Role) =>
  canAddOwnLead(role) || role === 'super_admin' || role === 'site_head';

// Editing an existing lead record (the pencil button on the Leads
// directory / lead detail modal) is super_admin only, full stop -- per the
// client's explicit "edit option should only be given to super admin...
// they should not have the option to edit they should just have to add
// data only." This replaces the earlier self-service model (site_head/
// sourcing_manager_tl/project_admin, or a lead's own assignees, editing
// their own leads) and also removes the bulk-upload-assigned telecaller's
// ability to edit their own bulk lead's status through this same button --
// that was a status-only update sharing this exact Edit control, so it
// goes away as a direct consequence of "only super admin can edit."
// Deliberately separate from canEditLead below, which Followups.tsx/
// SiteVisits.tsx reuse for a different question (can this person manage
// the follow-up/site-visit tied to a lead they're assigned to) that this
// change was never meant to touch.
export const canEditLeadRecord = (role: Role) => isSuperAdmin(role);

export const canEditLead = (
  role: Role,
  currentUserId: Id,
  ownerId: Id,
  sourcingManagerId: Id,
  telecallerId: Id,
  bulkUploadId?: Id
) => {
  if (bulkUploadId) {
    return currentUserId ? currentUserId === telecallerId : false;
  }

  if (isSuperAdmin(role)) return true;
  if (['site_head', 'sourcing_manager_tl', 'project_admin'].includes(role as string)) return true;

  // Direct assignees can edit their own leads
  if (currentUserId && (
    currentUserId === ownerId ||
    currentUserId === sourcingManagerId ||
    currentUserId === telecallerId
  )) {
    return true;
  }

  return false;
};

// A6, A7: Follow-ups and Site Visits
export const canManageActivity = (
  role: Role,
  currentUserId: Id,
  assigneeId: Id
) => {
  if (isAdminLevel(role)) return true;
  if (currentUserId && currentUserId === assigneeId) return true;
  return false;
};

// Bulk Upload Leads Status Update
export const canUpdateBulkUploadLeadStatus = (
  currentUserId: Id,
  telecallerId: Id
) => {
  // Only the assigned telecaller can update statuses on bulk uploaded leads
  if (currentUserId && currentUserId === telecallerId) {
    return true;
  }
  return false;
};

// A8: Tasks
export const canAssignTasksToOthers = (role: Role) => 
  ['super_admin', 'site_head', 'sourcing_manager_tl', 'presales_tl', 'closing_manager_tl'].includes(role as string);

export const canEditTask = (
  role: Role,
  currentUserId: Id,
  assigneeId: Id,
  creatorId: Id
) => {
  if (isAdminLevel(role)) return true;
  if (currentUserId && (currentUserId === assigneeId || currentUserId === creatorId)) return true;
  return false;
};

// A9: Bulk Uploads
// channel_partner is included deliberately -- the client explicitly asked
// for bulk upload to be available to channel partners, and the supporting
// RLS (can_manage_leads / bulk_lead_uploads insert policy) was widened to
// allow it. A CP can also add a single lead one-by-one (see canCreateLead
// above) -- Leads.tsx scopes that form to their own CP record and assigned
// projects when the role is channel_partner.
export const canAccessBulkUploadPage = (role: Role) =>
  ['super_admin', 'site_head', 'sourcing_manager', 'sourcing_manager_tl', 'telecaller', 'channel_partner'].includes(role as string);

export const canPerformBulkUpload = (role: Role) =>
  ['super_admin', 'site_head', 'sourcing_manager', 'sourcing_manager_tl', 'channel_partner'].includes(role as string);

// A10: New Booking Button
export const canCreateBooking = (role: Role) =>
  ['super_admin', 'project_admin', 'site_head', 'closing_manager', 'closing_manager_tl'].includes(role as string);

// D: Expenses -- super_admin ONLY, per the client's explicit instruction
// ("it will be at my personal level, nobody else should have access to it").
// The personal_expenses RLS policy is stricter still: it scopes each super
// admin to their OWN rows, so even a second super_admin can't read these.
export const canViewExpenses = (role: Role) => role === 'super_admin';
