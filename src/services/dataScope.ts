import { supabase } from './supabaseClient';
import type { UserRole } from '../types/auth';

// Per-user data scoping for the global search (and any future feature that
// needs "only show me records I'm associated with").
//
// HONEST LIMITATION (also stated in WALKTHROUGH.md): this is
// application-layer scoping only. It controls what the search UI queries and
// renders. It does NOT stop a user who queries Supabase directly with their
// own valid session token, because most tables still carry a permissive
// `FOR ALL TO authenticated USING (true)` policy left over from earlier
// phases (documented in AUDIT.md as deferred RLS hardening). The filters
// below are written so the same logic can be lifted into real `USING`
// clauses later without redesigning it.

const FULL_ACCESS_ROLES: UserRole[] = ['super_admin', 'project_admin'];

export type ScopedTable = 'leads' | 'bookings' | 'channel_partners' | 'projects' | 'project_inventory';

export interface ScopeContext {
  userId: string;
  role: UserRole | null;
  employeeId: string | null;
  channelPartnerId: string | null;
  assignedProjectIds: string[];
}

export function hasFullAccess(role: UserRole | null): boolean {
  return !!role && FULL_ACCESS_ROLES.includes(role);
}

/** Resolves the identity rows (employee / channel partner / project assignments) needed to scope this user's queries. */
export async function buildScopeContext(userId: string, role: UserRole | null): Promise<ScopeContext> {
  const [employeeRes, cpRes, assignRes] = await Promise.all([
    supabase.from('employees').select('id').eq('user_id', userId).maybeSingle(),
    supabase.from('channel_partners').select('id').eq('user_id', userId).maybeSingle(),
    supabase.from('user_project_assignments').select('project_id').eq('user_id', userId),
  ]);

  return {
    userId,
    role,
    employeeId: (employeeRes.data as { id: string } | null)?.id ?? null,
    channelPartnerId: (cpRes.data as { id: string } | null)?.id ?? null,
    assignedProjectIds: ((assignRes.data as { project_id: string }[] | null) ?? []).map((r) => r.project_id),
  };
}

/**
 * Returns a PostgREST `.or()` filter string scoping `table` to what `ctx`
 * should see, the literal `'ALL'` when the role has unrestricted access, or
 * `null` when nothing has been resolved yet and the caller should show zero
 * results rather than accidentally leaking an unfiltered query.
 */
export function scopeFilter(table: ScopedTable, ctx: ScopeContext): string | 'ALL' | null {
  if (hasFullAccess(ctx.role)) return 'ALL';

  const clauses: string[] = [];
  const projectIn = ctx.assignedProjectIds.length
    ? `project_id.in.(${ctx.assignedProjectIds.join(',')})`
    : null;

  switch (table) {
    case 'leads':
      if (ctx.employeeId) {
        clauses.push(
          `owner_id.eq.${ctx.employeeId}`,
          `sourcing_manager_id.eq.${ctx.employeeId}`,
          `telecaller_id.eq.${ctx.employeeId}`
        );
      }
      if (ctx.channelPartnerId) clauses.push(`channel_partner_id.eq.${ctx.channelPartnerId}`);
      if (projectIn) clauses.push(projectIn);
      break;
    case 'bookings':
      if (ctx.employeeId) clauses.push(`sales_owner.eq.${ctx.employeeId}`, `closing_manager.eq.${ctx.employeeId}`);
      if (ctx.channelPartnerId) clauses.push(`channel_partner_id.eq.${ctx.channelPartnerId}`);
      if (projectIn) clauses.push(projectIn);
      break;
    case 'channel_partners':
      if (ctx.employeeId) clauses.push(`sourcing_manager.eq.${ctx.employeeId}`);
      if (ctx.channelPartnerId) clauses.push(`id.eq.${ctx.channelPartnerId}`);
      break;
    case 'projects':
      if (ctx.assignedProjectIds.length) clauses.push(`id.in.(${ctx.assignedProjectIds.join(',')})`);
      break;
    case 'project_inventory':
      if (projectIn) clauses.push(projectIn);
      break;
  }

  if (clauses.length === 0) return null;
  return clauses.join(',');
}
