import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { reportQueryError } from '../services/queryLogger';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { BarChart3, RefreshCw, IndianRupee, Users, TrendingUp, PhoneCall, ShieldAlert, Calendar, Target } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { buildReportScope, type ReportScope, type TeamMember } from '../services/reportScope';
import { resolveDateRange, presetOptions, type DateRangePreset } from '../services/dateRangePresets';

interface Lead {
  id: string;
  status: string | null;
  owner_id: string | null;
  sourcing_manager_id: string | null;
  channel_partner_id: string | null;
  telecaller_id: string | null;
  created_at: string;
}

interface Booking {
  id: string;
  status: string | null;
  sales_owner: string | null;
  closing_manager: string | null;
  lead_id: string | null;
  booking_amount: number | null;
  total_payable_amount: number | null;
  channel_partner_id: string | null;
  booking_date: string | null;
  created_at: string | null;
}

interface CallLog {
  id: string;
  employee_id: string | null;
  lead_id: string | null;
  outcome: string | null;
  duration_seconds: number | null;
  called_at: string | null;
}

interface AttendanceRow {
  employee_id: string | null;
  attendance_date: string | null;
  check_in: string | null;
  check_out: string | null;
}

const leadStatuses = [
  'new', 'contacted', 'interested', 'hot', 'site_visit_planned', 'site_visit_done',
  'negotiation', 'booking_done', 'not_reachable', 'call_back_later', 'lost', 'junk',
];

const statusColors: Record<string, string> = {
  new: '#6366f1', contacted: '#3b82f6', interested: '#0ea5e9', hot: '#f97316',
  site_visit_planned: '#a855f7', site_visit_done: '#8b5cf6', negotiation: '#eab308',
  booking_done: '#10b981', not_reachable: '#94a3b8', call_back_later: '#f59e0b',
  lost: '#ef4444', junk: '#64748b',
};

const CONFIRMED_STATUSES = ['confirmed', 'agreement_pending', 'agreement_completed'];
const PIE_COLORS = ['#6366f1', '#10b981'];

// ---------------------------------------------------------------------
// Date range filter — shared by every tier below. Renders the quick-pick
// buttons plus a custom range pair of date inputs (shown only when Custom
// is selected). Kept small and dumb: this only computes labels, actual
// filtering happens via resolveDateRange in the parent.
// ---------------------------------------------------------------------
const DateRangeFilter: React.FC<{
  preset: DateRangePreset;
  onPresetChange: (p: DateRangePreset) => void;
  customStart: string;
  customEnd: string;
  onCustomChange: (start: string, end: string) => void;
}> = ({ preset, onPresetChange, customStart, customEnd, onCustomChange }) => (
  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
    <div className="flex items-center gap-2 mb-3 text-slate-700">
      <Calendar className="h-4 w-4 text-indigo-600" />
      <span className="text-xs font-bold uppercase tracking-wider">Date Range</span>
    </div>
    <div className="flex flex-wrap gap-2">
      {presetOptions.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onPresetChange(opt.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            preset === opt.value
              ? 'bg-indigo-600 border-indigo-600 text-white'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
    {preset === 'custom' && (
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <input
          type="date"
          value={customStart}
          onChange={(e) => onCustomChange(e.target.value, customEnd)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <span className="text-xs text-slate-400">to</span>
        <input
          type="date"
          value={customEnd}
          onChange={(e) => onCustomChange(customStart, e.target.value)}
          min={customStart || undefined}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        {(!customStart || !customEnd) && (
          <span className="text-xxs text-amber-600">Pick both dates to apply.</span>
        )}
      </div>
    )}
  </div>
);

// ---------------------------------------------------------------------
// Simple per-person metrics used by the team / individual / partner
// tiers. "Conversions" deliberately means bookings made from THIS
// person's leads (by lead_id), not bookings they personally closed —
// that's the literal ask ("the conversion... they have made from those
// leads"). A separate "closed" count covers the closing-manager function,
// since a closing manager's leads count is usually near zero (leads are
// generated by sourcing, assigned to them only to close).
// ---------------------------------------------------------------------
interface PersonMetrics {
  leadsCount: number;
  conversionsFromLeads: number;
  bookingsClosed: number;
  revenueClosed: number;
}

function computeMetricsForUser(
  userId: string | null,
  leads: Lead[],
  bookings: Booking[],
  cpId: string | null = null
): PersonMetrics {
  const myLeads = cpId
    ? leads.filter((l) => l.channel_partner_id === cpId)
    : leads.filter((l) => l.owner_id === userId || l.sourcing_manager_id === userId || l.telecaller_id === userId);
  const myLeadIds = new Set(myLeads.map((l) => l.id));

  const confirmed = bookings.filter((b) => CONFIRMED_STATUSES.includes(b.status || ''));
  const conversionsFromLeads = confirmed.filter((b) => b.lead_id && myLeadIds.has(b.lead_id)).length;

  const closed = cpId
    ? confirmed.filter((b) => b.channel_partner_id === cpId)
    : confirmed.filter((b) => b.sales_owner === userId || b.closing_manager === userId);

  return {
    leadsCount: myLeads.length,
    conversionsFromLeads,
    bookingsClosed: closed.length,
    revenueClosed: closed.reduce((sum, b) => sum + (b.total_payable_amount || b.booking_amount || 0), 0),
  };
}

const MetricCard: React.FC<{ icon: React.ReactNode; label: string; value: string; accent?: string }> = ({ icon, label, value, accent }) => (
  <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
    <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">{icon} {label}</span>
    <span className={`block text-xl font-bold mt-1 ${accent || 'text-slate-900'}`}>{value}</span>
  </div>
);

const PersonRow: React.FC<{ name: string; m: PersonMetrics; showClosed: boolean }> = ({ name, m, showClosed }) => (
  <tr>
    <td className="py-2 font-semibold text-slate-800">{name}</td>
    <td className="py-2 text-right text-slate-600">{m.leadsCount}</td>
    <td className="py-2 text-right text-slate-600">{m.conversionsFromLeads}</td>
    <td className="py-2 text-right text-slate-600">
      {m.leadsCount > 0 ? `${Math.round((m.conversionsFromLeads / m.leadsCount) * 100)}%` : '—'}
    </td>
    {showClosed && (
      <>
        <td className="py-2 text-right text-slate-600">{m.bookingsClosed}</td>
        <td className="py-2 text-right font-semibold text-indigo-600">₹{m.revenueClosed.toLocaleString('en-IN')}</td>
      </>
    )}
  </tr>
);

export const Reports: React.FC = () => {
  const { role, user } = useAuth();

  const [scope, setScope] = useState<ReportScope | null>(null);
  const [scopeLoading, setScopeLoading] = useState(true);

  const [preset, setPreset] = useState<DateRangePreset>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const range = useMemo(() => resolveDateRange(preset, customStart, customEnd), [preset, customStart, customEnd]);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [employeesMap, setEmployeesMap] = useState<Map<string, string>>(new Map());
  const [profilesMap, setProfilesMap] = useState<Map<string, string>>(new Map());

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setScopeLoading(true);
    buildReportScope(user.id, role).then((s) => {
      if (!cancelled) {
        setScope(s);
        setScopeLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [user?.id, role]);

  const fetchData = useCallback(async () => {
    if (!scope) return;
    const isOrg = scope.tier === 'org';

    try {
      let query = supabase
        .from('leads')
        .select('id, status, owner_id, sourcing_manager_id, channel_partner_id, telecaller_id, created_at')
        .gte('created_at', range.startISO)
        .lt('created_at', range.endISO);
      if (!isOrg) {
        // Non-admin tiers only ever need their own / their team's leads —
        // narrowing server-side rather than filtering a full-table fetch
        // client-side, since most tables here still carry permissive RLS
        // (documented in AUDIT.md) that would otherwise hand every lead in
        // the business to the browser just to throw most of them away.
        if (scope.tier === 'partner' && scope.channelPartnerId) {
          query = query.eq('channel_partner_id', scope.channelPartnerId);
        } else if (scope.includedUserIds.length) {
          const orClause = scope.includedUserIds
            .flatMap((id) => [`owner_id.eq.${id}`, `sourcing_manager_id.eq.${id}`, `telecaller_id.eq.${id}`])
            .join(',');
          query = query.or(orClause);
        }
      }
      const { data, error } = await query;
      if (error) reportQueryError('Reports: leads', error);
      else setLeads(data || []);
    } catch (err) {
      reportQueryError('Reports: leads', err);
    }

    try {
      let query = supabase
        .from('bookings')
        .select('id, status, sales_owner, closing_manager, lead_id, booking_amount, total_payable_amount, channel_partner_id, booking_date, created_at')
        .gte('booking_date', range.startISO)
        .lt('booking_date', range.endISO);
      if (!isOrg) {
        if (scope.tier === 'partner' && scope.channelPartnerId) {
          query = query.eq('channel_partner_id', scope.channelPartnerId);
        } else if (scope.includedUserIds.length) {
          // A booking belongs in this report either because someone in
          // scope closed it, OR because its lead was sourced by someone in
          // scope (needed for the "conversions from your leads" metric) —
          // the lead_id membership check itself happens client-side below
          // once leads are loaded, so here we only need the "closed by"
          // half scoped server-side; the fuller set is fetched for org.
          const orClause = scope.includedUserIds
            .flatMap((id) => [`sales_owner.eq.${id}`, `closing_manager.eq.${id}`])
            .join(',');
          query = query.or(orClause);
        }
      }
      const { data, error } = await query;
      if (error) reportQueryError('Reports: bookings', error);
      else setBookings(data || []);
    } catch (err) {
      reportQueryError('Reports: bookings', err);
    }

    if (isOrg) {
      try {
        const { data, error } = await supabase
          .from('call_logs')
          .select('id, employee_id, lead_id, outcome, duration_seconds, called_at')
          .gte('called_at', range.startISO)
          .lt('called_at', range.endISO);
        if (error) reportQueryError('Reports: call logs', error);
        else setCallLogs(data || []);
      } catch (err) {
        reportQueryError('Reports: call logs', err);
      }

      try {
        const { data, error } = await supabase
          .from('attendance')
          .select('employee_id, attendance_date, check_in, check_out');
        if (error) reportQueryError('Reports: attendance', error);
        else setAttendanceRows(data || []);
      } catch (err) {
        reportQueryError('Reports: attendance', err);
      }

      try {
        const { data, error } = await supabase.from('employees').select('id, first_name, last_name');
        if (error) reportQueryError('Reports: employees', error);
        else setEmployeesMap(new Map((data || []).map(e => [e.id, [e.first_name, e.last_name].filter(Boolean).join(' ') || 'Unnamed'])));
      } catch (err) {
        reportQueryError('Reports: employees', err);
      }

      try {
        const { data, error } = await supabase.from('user_profiles').select('id, full_name');
        if (error) reportQueryError('Reports: profiles', error);
        else setProfilesMap(new Map((data || []).map(p => [p.id, p.full_name || 'Unnamed'])));
      } catch (err) {
        reportQueryError('Reports: profiles', err);
      }
    }

    setLoading(false);
    setSyncing(false);
  }, [scope, range.startISO, range.endISO]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    await fetchData();
  };

  const handleCustomChange = (start: string, end: string) => {
    setCustomStart(start);
    setCustomEnd(end);
  };

  // ---- Org-tier aggregations (unchanged logic, now date-scoped) ----

  const funnelData = useMemo(() => {
    return leadStatuses.map(status => ({
      status: status.replace(/_/g, ' '),
      count: leads.filter(l => l.status === status).length,
      fill: statusColors[status],
    }));
  }, [leads]);

  const confirmedBookings = useMemo(
    () => bookings.filter(b => CONFIRMED_STATUSES.includes(b.status || '')),
    [bookings]
  );

  const totalRevenue = useMemo(
    () => confirmedBookings.reduce((sum, b) => sum + (b.total_payable_amount || b.booking_amount || 0), 0),
    [confirmedBookings]
  );

  const salesByEmployee = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number }>();
    for (const b of confirmedBookings) {
      const key = b.sales_owner || 'unassigned';
      const entry = map.get(key) || { count: 0, revenue: 0 };
      entry.count += 1;
      entry.revenue += b.total_payable_amount || b.booking_amount || 0;
      map.set(key, entry);
    }
    return Array.from(map.entries())
      .map(([ownerId, v]) => ({
        name: ownerId === 'unassigned' ? 'Unassigned' : (profilesMap.get(ownerId) || employeesMap.get(ownerId) || 'Unknown'),
        bookings: v.count,
        revenue: v.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [confirmedBookings, profilesMap, employeesMap]);

  const cpVsDirect = useMemo(() => {
    const cpLeads = leads.filter(l => l.channel_partner_id).length;
    const directLeads = leads.length - cpLeads;
    const cpBookings = confirmedBookings.filter(b => b.channel_partner_id).length;
    const directBookings = confirmedBookings.length - cpBookings;
    return {
      leads: [{ name: 'CP Referred', value: cpLeads }, { name: 'Direct', value: directLeads }],
      bookings: [{ name: 'CP Referred', value: cpBookings }, { name: 'Direct', value: directBookings }],
    };
  }, [leads, confirmedBookings]);

  const telecallerStats = useMemo(() => {
    const map = new Map<string, { total: number; connected: number; totalDuration: number }>();
    for (const c of callLogs) {
      const key = c.employee_id || 'unassigned';
      const entry = map.get(key) || { total: 0, connected: 0, totalDuration: 0 };
      entry.total += 1;
      if (c.outcome === 'connected') entry.connected += 1;
      entry.totalDuration += c.duration_seconds || 0;
      map.set(key, entry);
    }
    return Array.from(map.entries())
      .map(([empId, v]) => ({
        name: empId === 'unassigned' ? 'Unassigned' : (employeesMap.get(empId) || 'Unknown'),
        totalCalls: v.total,
        connectRate: v.total > 0 ? Math.round((v.connected / v.total) * 100) : 0,
        avgDurationSec: v.total > 0 ? Math.round(v.totalDuration / v.total) : 0,
      }))
      .sort((a, b) => b.totalCalls - a.totalCalls);
  }, [callLogs, employeesMap]);

  const fraudSignals = useMemo(() => {
    const byEmployee = new Map<string, CallLog[]>();
    for (const c of callLogs) {
      if (!c.employee_id || !c.called_at) continue;
      const arr = byEmployee.get(c.employee_id) || [];
      arr.push(c);
      byEmployee.set(c.employee_id, arr);
    }

    const attendanceByEmployeeDate = new Map<string, AttendanceRow>();
    for (const a of attendanceRows) {
      if (!a.employee_id || !a.attendance_date) continue;
      attendanceByEmployeeDate.set(`${a.employee_id}__${a.attendance_date}`, a);
    }

    const leadStatusById = new Map(leads.map((l) => [l.id, l.status]));

    const burstFlags: { employeeId: string; count: number; windowStart: string }[] = [];
    for (const [empId, calls] of byEmployee) {
      const sorted = [...calls].sort((a, b) => new Date(a.called_at!).getTime() - new Date(b.called_at!).getTime());
      for (let i = 0; i < sorted.length; i++) {
        const windowStart = new Date(sorted[i].called_at!).getTime();
        let count = 1;
        for (let j = i + 1; j < sorted.length; j++) {
          if (new Date(sorted[j].called_at!).getTime() - windowStart <= 10 * 60 * 1000) count++;
          else break;
        }
        if (count >= 5) {
          burstFlags.push({ employeeId: empId, count, windowStart: sorted[i].called_at! });
          break;
        }
      }
    }

    const outsideAttendance: { employeeId: string }[] = [];
    for (const c of callLogs) {
      if (!c.employee_id || !c.called_at) continue;
      const dateKey = c.called_at.slice(0, 10);
      const att = attendanceByEmployeeDate.get(`${c.employee_id}__${dateKey}`);
      if (!att || !att.check_in) outsideAttendance.push({ employeeId: c.employee_id });
    }

    const connectedNoProgress = callLogs.filter(
      (c) => c.outcome === 'connected' && c.lead_id && leadStatusById.get(c.lead_id) === 'new'
    );

    return {
      burstFlags: burstFlags.map((f) => ({ ...f, name: employeesMap.get(f.employeeId) || 'Unknown' })),
      outsideAttendanceCount: outsideAttendance.length,
      outsideAttendanceByEmployee: Array.from(
        outsideAttendance.reduce((map, r) => map.set(r.employeeId, (map.get(r.employeeId) || 0) + 1), new Map<string, number>())
      ).map(([empId, count]) => ({ name: employeesMap.get(empId) || 'Unknown', count })),
      connectedNoProgressCount: connectedNoProgress.length,
    };
  }, [callLogs, attendanceRows, leads, employeesMap]);

  // ---- Team / individual / partner metrics ----

  const ownMetrics = useMemo(() => {
    if (!scope) return null;
    return computeMetricsForUser(scope.userId, leads, bookings, scope.channelPartnerId);
  }, [scope, leads, bookings]);

  const sourcingTeam = useMemo(() => scope?.team.filter((m) => m.fn === 'sourcing') ?? [], [scope]);
  const closingTeam = useMemo(() => scope?.team.filter((m) => m.fn === 'closing') ?? [], [scope]);
  const otherTeam = useMemo(() => scope?.team.filter((m) => m.fn === 'other') ?? [], [scope]);

  const metricsFor = useCallback(
    (m: TeamMember) => computeMetricsForUser(m.userId, leads, bookings),
    [leads, bookings]
  );

  const teamTotals = useMemo(() => {
    if (!scope) return null;
    const all = [scope.userId, ...scope.team.map((m) => m.userId)].filter((v): v is string => !!v);
    const leadsCount = leads.length;
    const confirmed = bookings.filter((b) => CONFIRMED_STATUSES.includes(b.status || ''));
    const leadIds = new Set(leads.map((l) => l.id));
    const conversionsFromLeads = confirmed.filter((b) => b.lead_id && leadIds.has(b.lead_id)).length;
    const revenue = confirmed.reduce((s, b) => s + (b.total_payable_amount || b.booking_amount || 0), 0);
    return { leadsCount, conversionsFromLeads, bookingsClosed: confirmed.length, revenue, memberCount: all.length };
  }, [scope, leads, bookings]);

  if (scopeLoading || !scope) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-6 w-6 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-6 w-6 text-indigo-600 animate-spin" />
      </div>
    );
  }

  const header = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-indigo-600" /> Reports
        </h2>
        <p className="text-slate-500 text-xs mt-1">
          {scope.tier === 'org' && 'Sales and performance overview — whole business.'}
          {scope.tier === 'team' && `Your team's leads and conversions — ${range.label}.`}
          {scope.tier === 'individual' && `Your leads and conversions — ${range.label}.`}
          {scope.tier === 'partner' && `Leads you've referred and their conversions — ${range.label}.`}
        </p>
      </div>
      <button
        onClick={handleSync}
        disabled={syncing}
        className="p-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );

  const dateFilter = (
    <DateRangeFilter
      preset={preset}
      onPresetChange={setPreset}
      customStart={customStart}
      customEnd={customEnd}
      onCustomChange={handleCustomChange}
    />
  );

  // ---- Individual / partner tier: focused personal report ----
  if (scope.tier === 'individual' || scope.tier === 'partner') {
    const m = ownMetrics!;
    const conversionRate = m.leadsCount > 0 ? Math.round((m.conversionsFromLeads / m.leadsCount) * 100) : 0;
    return (
      <div className="space-y-6">
        {header}
        {dateFilter}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard icon={<Users className="h-3 w-3" />} label={scope.tier === 'partner' ? 'Leads Referred' : 'Your Leads'} value={String(m.leadsCount)} />
          <MetricCard icon={<TrendingUp className="h-3 w-3" />} label="Conversions From Your Leads" value={String(m.conversionsFromLeads)} accent="text-emerald-600" />
          <MetricCard icon={<Target className="h-3 w-3" />} label="Conversion Rate" value={`${conversionRate}%`} />
          <MetricCard icon={<IndianRupee className="h-3 w-3" />} label="Revenue You Closed" value={`₹${m.revenueClosed.toLocaleString('en-IN')}`} accent="text-indigo-600" />
        </div>
        {m.bookingsClosed > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-1">Bookings You Personally Closed</h3>
            <p className="text-xs text-slate-500">{m.bookingsClosed} booking{m.bookingsClosed === 1 ? '' : 's'} in this period, worth ₹{m.revenueClosed.toLocaleString('en-IN')}.</p>
          </div>
        )}
        {m.leadsCount === 0 && (
          <p className="text-xs text-slate-400 italic text-center py-8">No leads recorded for you in this period.</p>
        )}
      </div>
    );
  }

  // ---- Team tier: site head / TL roles — bifurcated by function ----
  if (scope.tier === 'team') {
    const tt = teamTotals!;
    const conversionRate = tt.leadsCount > 0 ? Math.round((tt.conversionsFromLeads / tt.leadsCount) * 100) : 0;
    return (
      <div className="space-y-6">
        {header}
        {dateFilter}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard icon={<Users className="h-3 w-3" />} label="Team Leads" value={String(tt.leadsCount)} />
          <MetricCard icon={<TrendingUp className="h-3 w-3" />} label="Conversions" value={String(tt.conversionsFromLeads)} accent="text-emerald-600" />
          <MetricCard icon={<Target className="h-3 w-3" />} label="Conversion Rate" value={`${conversionRate}%`} />
          <MetricCard icon={<IndianRupee className="h-3 w-3" />} label="Revenue" value={`₹${tt.revenue.toLocaleString('en-IN')}`} accent="text-indigo-600" />
        </div>

        {scope.team.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm">
            No one is set up as reporting to you yet. Set a "Reporting Manager" on the Employees page for each team member to see them bifurcated here.
          </div>
        )}

        {sourcingTeam.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-4">Sourcing Team — Leads &amp; Conversions</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-100">
                    <th className="py-2">Name</th>
                    <th className="py-2 text-right">Leads</th>
                    <th className="py-2 text-right">Conversions</th>
                    <th className="py-2 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sourcingTeam.map((mem) => (
                    <PersonRow key={mem.employeeId} name={mem.name} m={metricsFor(mem)} showClosed={false} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {closingTeam.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-4">Closing Team — Bookings &amp; Revenue</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-100">
                    <th className="py-2">Name</th>
                    <th className="py-2 text-right">Leads</th>
                    <th className="py-2 text-right">Conversions</th>
                    <th className="py-2 text-right">Rate</th>
                    <th className="py-2 text-right">Booked</th>
                    <th className="py-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {closingTeam.map((mem) => (
                    <PersonRow key={mem.employeeId} name={mem.name} m={metricsFor(mem)} showClosed />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {otherTeam.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-4">Other Team Members</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-100">
                    <th className="py-2">Name</th>
                    <th className="py-2 text-right">Leads</th>
                    <th className="py-2 text-right">Conversions</th>
                    <th className="py-2 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {otherTeam.map((mem) => (
                    <PersonRow key={mem.employeeId} name={mem.name} m={metricsFor(mem)} showClosed={false} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- Org tier: full admin dashboard (unchanged, now date-scoped) ----
  return (
    <div className="space-y-6">
      {header}
      {dateFilter}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <MetricCard icon={<Users className="h-3 w-3" />} label="Total Leads" value={String(leads.length)} />
        <MetricCard icon={<TrendingUp className="h-3 w-3" />} label="Bookings" value={String(confirmedBookings.length)} accent="text-emerald-600" />
        <MetricCard icon={<Target className="h-3 w-3" />} label="Conversion Rate" value={leads.length > 0 ? `${Math.round((confirmedBookings.length / leads.length) * 100)}%` : '—'} />
        <MetricCard icon={<IndianRupee className="h-3 w-3" />} label="Revenue" value={`₹${totalRevenue.toLocaleString('en-IN')}`} accent="text-indigo-600" />
        <MetricCard icon={<PhoneCall className="h-3 w-3" />} label="Calls Logged" value={String(callLogs.length)} />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-4">Lead Funnel by Status</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={funnelData} margin={{ top: 5, right: 20, left: -10, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="status" angle={-35} textAnchor="end" interval={0} tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {funnelData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-800 mb-4">Bookings & Revenue by Sales Owner</h3>
          {salesByEmployee.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-100">
                    <th className="py-2">Owner</th>
                    <th className="py-2 text-right">Bookings</th>
                    <th className="py-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {salesByEmployee.map((row, i) => (
                    <tr key={i}>
                      <td className="py-2 font-semibold text-slate-800">{row.name}</td>
                      <td className="py-2 text-right text-slate-600">{row.bookings}</td>
                      <td className="py-2 text-right font-semibold text-indigo-600">₹{row.revenue.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No confirmed bookings yet.</p>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-800 mb-4">Channel Partner vs Direct</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xxs font-bold text-slate-400 uppercase tracking-wider text-center mb-2">Leads</p>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={cpVsDirect.leads} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label>
                    {cpVsDirect.leads.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={24} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-xxs font-bold text-slate-400 uppercase tracking-wider text-center mb-2">Bookings</p>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={cpVsDirect.bookings} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label>
                    {cpVsDirect.bookings.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={24} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2"><PhoneCall className="h-4 w-4 text-indigo-600" /> Presales (Telecaller) Call Performance</h3>
        {telecallerStats.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-100">
                  <th className="py-2">Presales (Telecaller)</th>
                  <th className="py-2 text-right">Total Calls</th>
                  <th className="py-2 text-right">Connect Rate</th>
                  <th className="py-2 text-right">Avg Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {telecallerStats.map((row, i) => (
                  <tr key={i}>
                    <td className="py-2 font-semibold text-slate-800">{row.name}</td>
                    <td className="py-2 text-right text-slate-600">{row.totalCalls}</td>
                    <td className="py-2 text-right text-slate-600">{row.connectRate}%</td>
                    <td className="py-2 text-right text-slate-600">{Math.floor(row.avgDurationSec / 60)}m {row.avgDurationSec % 60}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">No calls logged yet. Log calls from the Leads page to populate this report.</p>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-500" /> Call Log Fraud Signals
        </h3>
        <p className="text-xxs text-slate-400 mb-4">
          These flag patterns worth checking, not proof of wrongdoing — a burst of real calls during a busy hour is possible too. See the Walkthrough guide for what this can and can't catch.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-slate-100 rounded-xl p-4">
            <p className="text-xs font-bold text-slate-700 mb-2">Burst Logging</p>
            {fraudSignals.burstFlags.length > 0 ? (
              <ul className="space-y-1.5">
                {fraudSignals.burstFlags.map((f, i) => (
                  <li key={i} className="text-xxs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-1.5">
                    <span className="font-semibold">{f.name}</span> logged {f.count} calls within 10 minutes starting {new Date(f.windowStart).toLocaleString('en-IN')}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xxs text-slate-400 italic">No unusually fast bursts detected.</p>
            )}
          </div>
          <div className="border border-slate-100 rounded-xl p-4">
            <p className="text-xs font-bold text-slate-700 mb-2">Outside Attendance Window</p>
            {fraudSignals.outsideAttendanceCount > 0 ? (
              <ul className="space-y-1.5">
                {fraudSignals.outsideAttendanceByEmployee.map((r, i) => (
                  <li key={i} className="text-xxs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                    <span className="font-semibold">{r.name}</span>: {r.count} call{r.count === 1 ? '' : 's'} logged with no matching check-in
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xxs text-slate-400 italic">All logged calls fall within a checked-in day.</p>
            )}
          </div>
          <div className="border border-slate-100 rounded-xl p-4">
            <p className="text-xs font-bold text-slate-700 mb-2">Connected, No Progress</p>
            {fraudSignals.connectedNoProgressCount > 0 ? (
              <p className="text-xxs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                {fraudSignals.connectedNoProgressCount} call{fraudSignals.connectedNoProgressCount === 1 ? '' : 's'} marked "Connected" but the lead is still sitting at "New" status.
              </p>
            ) : (
              <p className="text-xxs text-slate-400 italic">Every connected call has a lead that moved forward.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
