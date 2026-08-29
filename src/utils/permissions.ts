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

// A2, A3: Financial & Booking destructive actions
export const canCancelBooking = (role: Role) => role === 'super_admin';
export const canEditPayment = (role: Role) => isAdminLevel(role);
export const canCancelPayment = (role: Role) => role === 'super_admin';

// A4: Marketing
export const canSendMarketingBlast = (role: Role) => 
  ['super_admin', 'closing_manager', 'marketing_head'].includes(role as string);

// A5: Leads
export const canCreateLead = (role: Role) => 
  ['sourcing_manager', 'sourcing_manager_tl', 'super_admin', 'site_head'].includes(role as string);

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
// allow it. Note this is the ONE lead-creation path a CP has: they still
// cannot create leads one-by-one (see canCreateLead below).
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
