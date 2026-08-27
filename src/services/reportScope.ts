import { supabase } from './supabaseClient';
import type { UserRole } from '../types/auth';

/**
 * Works out *which* report a given user should see, and whose records
 * belong in it.
 *
 * Three tiers:
 *  - `org`        — super_admin / project_admin: the whole business.
 *  - `team`       — site_head and the TL roles: their own numbers plus
 *                   everyone reporting to them, split by function.
 *  - `individual` — everyone else: only their own leads and conversions.
 *  - `partner`    — channel_partner: only leads they referred.
 *
 * IDENTITY NOTE (verified against the live database): leads.owner_id,
 * leads.sourcing_manager_id, leads.telecaller_id, bookings.sales_owner and
 * bookings.closing_manager all hold **user_profiles.id** (the auth user
 * id), not employees.id. The reporting hierarchy, however, lives on
 * **employees.reporting_manager -> employees.id**. So resolving a
 * manager's team is a two-hop walk: find their employee row, find the
 * employee rows reporting to it, then map those back to user ids before
 * anything can be matched against leads or bookings.
 */

export type ReportTier = 'org' | 'team' | 'individual' | 'partner';

const ORG_ROLES: UserRole[] = ['super_admin', 'project_admin'];

/** Roles that manage other people and therefore get the bifurcated team report. */
const TEAM_ROLES: UserRole[] = [
  'site_head',
  'sourcing_manager_tl',
  'closing_manager_tl',
  'presales_tl',
  'marketing_head',
];

/** Which function a team member belongs to, for the site head's split view. */
export type TeamFunction = 'sourcing' | 'closing' | 'other';

export interface TeamMember {
  userId: string | null;
  employeeId: string;
  name: string;
  role: UserRole | null;
  fn: TeamFunction;
}

export interface ReportScope {
  tier: ReportTier;
  userId: string;
  employeeId: string | null;
  channelPartnerId: string | null;
  /** Team members reporting to this user (empty for non-managers). */
  team: TeamMember[];
  /** Every user id whose records belong in this report, including the viewer's own. */
  includedUserIds: string[];
}

export const tierForRole = (role: UserRole | null): ReportTier => {
  if (role && ORG_ROLES.includes(role)) return 'org';
  if (role === 'channel_partner') return 'partner';
  if (role && TEAM_ROLES.includes(role)) return 'team';
  return 'individual';
};

const functionForRole = (role: UserRole | null): TeamFunction => {
  if (!role) return 'other';
  if (role.startsWith('sourcing_manager')) return 'sourcing';
  if (role.startsWith('closing_manager')) return 'closing';
  return 'other';
};

export const buildReportScope = async (
  userId: string,
  role: UserRole | null
): Promise<ReportScope> => {
  const tier = tierForRole(role);

  const [employeeRes, cpRes] = await Promise.all([
    supabase.from('employees').select('id').eq('user_id', userId).maybeSingle(),
    supabase.from('channel_partners').select('id').eq('user_id', userId).maybeSingle(),
  ]);

  const employeeId = (employeeRes.data as { id: string } | null)?.id ?? null;
  const channelPartnerId = (cpRes.data as { id: string } | null)?.id ?? null;

  let team: TeamMember[] = [];

  if (tier === 'team' && employeeId) {
    // Direct reports. Deliberately NOT "everyone with a sourcing/closing
    // role" — a manager should see the people who actually report to them,
    // not every peer in the company. If reporting lines aren't set up yet
    // this comes back empty, and the UI says so explicitly rather than
    // silently falling back to showing everyone.
    const { data: reports } = await supabase
      .from('employees')
      .select('id, user_id, first_name, last_name')
      .eq('reporting_manager', employeeId);

    const reportRows = (reports ?? []) as {
      id: string; user_id: string | null; first_name: string | null; last_name: string | null;
    }[];

    // Resolve each report's role in one query rather than N.
    const reportUserIds = reportRows.map(r => r.user_id).filter((v): v is string => !!v);
    const roleByUserId = new Map<string, UserRole>();
    if (reportUserIds.length) {
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('user_id, roles(name)')
        .in('user_id', reportUserIds);
      for (const r of (roleRows ?? []) as any[]) {
        if (r.user_id && r.roles?.name) roleByUserId.set(r.user_id, r.roles.name as UserRole);
      }
    }

    team = reportRows.map(r => {
      const memberRole = r.user_id ? roleByUserId.get(r.user_id) ?? null : null;
      return {
        userId: r.user_id,
        employeeId: r.id,
        name: [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unnamed',
        role: memberRole,
        fn: functionForRole(memberRole),
      };
    });
  }

  const includedUserIds = [userId, ...team.map(m => m.userId).filter((v): v is string => !!v)];

  return { tier, userId, employeeId, channelPartnerId, team, includedUserIds };
};
