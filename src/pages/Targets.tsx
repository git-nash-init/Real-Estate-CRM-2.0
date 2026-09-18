import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { reportQueryError } from '../services/queryLogger';
import { useAuth } from '../hooks/useAuth';
import { canManageTargets } from '../utils/permissions';
import { useHighlightParam } from '../hooks/useHighlightParam';
import {
  Target as TargetIcon,
  Plus,
  X,
  RefreshCw,
  CheckCircle,
  XCircle,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface TargetProgress {
  id: string;
  assigned_to: string;
  role: string;
  target_count: number;
  period_start: string;
  period_end: string;
  assigned_by: string | null;
  created_at: string;
  completed_count: number;
  remaining_count: number;
}

interface UserOption {
  id: string;
  full_name: string | null;
}

interface CompletionRow {
  id: string;
  source_type: string;
  completed_at: string;
  lead_id: string | null;
  leads: { customer_name: string | null } | null;
}

const ROLE_LABELS: Record<string, string> = {
  sourcing_manager: 'Sourcing Manager',
  closing_manager: 'Closing Manager',
  presales: 'Presales',
};

// A Sourcing Manager / Presales target completes when a Site Visit
// (quick_site_visits) is logged with them attached; a Closing Manager
// target completes when a Booking is created with them as closing_manager
// -- enforced by DB triggers (complete_target_on_site_visit /
// complete_target_on_booking), not by this page.
const COMPLETION_EVENT_LABEL: Record<string, string> = {
  sourcing_manager: 'on Site Visit logged',
  presales: 'on Site Visit logged',
  closing_manager: 'on Booking created',
};

const ROLE_STAFF_FILTERS: Record<string, string[]> = {
  sourcing_manager: ['sourcing_manager', 'sourcing_manager_tl'],
  closing_manager: ['closing_manager', 'closing_manager_tl', 'site_head'],
  presales: ['presales', 'presales_tl'],
};

const monthBounds = (year: number, month0: number) => {
  const start = new Date(Date.UTC(year, month0, 1));
  const end = new Date(Date.UTC(year, month0 + 1, 0));
  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  return { start: toISO(start), end: toISO(end) };
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const ProgressBar: React.FC<{ completed: number; total: number }> = ({ completed, total }) => {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  return (
    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};

interface ClosingManagerKra {
  visits_attended: number;
  bookings_closed: number;
}

const TargetCard: React.FC<{
  t: TargetProgress;
  staffName?: string;
  canManage: boolean;
  onDelete?: (id: string) => void;
  kra?: ClosingManagerKra;
  cardRef?: (el: HTMLElement | null) => void;
  cardClassName?: string;
  defaultExpanded?: boolean;
}> = ({ t, staffName, canManage, onDelete, kra, cardRef, cardClassName, defaultExpanded }) => {
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const [completions, setCompletions] = useState<CompletionRow[] | null>(null);
  const [loadingCompletions, setLoadingCompletions] = useState(false);

  const loadCompletions = async () => {
    if (completions !== null) return;
    setLoadingCompletions(true);
    const { data, error } = await supabase
      .from('target_completions')
      .select('id, source_type, completed_at, lead_id, leads(customer_name)')
      .eq('staff_target_id', t.id)
      .order('completed_at', { ascending: false });
    if (error) reportQueryError('Targets: completions', error);
    else setCompletions((data || []) as any);
    setLoadingCompletions(false);
  };

  const toggleExpand = () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    loadCompletions();
  };

  // A notification click lands here already expanded -- load its
  // completions up front instead of waiting for a manual toggle.
  useEffect(() => {
    if (defaultExpanded) loadCompletions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCurrentPeriod = todayISO() >= t.period_start && todayISO() <= t.period_end;

  return (
    <div ref={cardRef} className={`bg-white border border-slate-200 rounded-2xl shadow-sm p-5 ${cardClassName || ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {staffName && <span className="font-semibold text-slate-900">{staffName}</span>}
            <span className="inline-flex px-2 py-0.5 rounded-full text-xxs font-semibold bg-indigo-50 text-indigo-700">
              {ROLE_LABELS[t.role] || t.role}
            </span>
            {isCurrentPeriod && (
              <span className="inline-flex px-2 py-0.5 rounded-full text-xxs font-semibold bg-emerald-50 text-emerald-700">Active</span>
            )}
          </div>
          <p className="text-xxs text-slate-400 mt-1">
            {new Date(t.period_start).toLocaleDateString('en-IN')} – {new Date(t.period_end).toLocaleDateString('en-IN')} · {COMPLETION_EVENT_LABEL[t.role]}
          </p>
        </div>
        {canManage && onDelete && (
          <button onClick={() => onDelete(t.id)} className="p-1.5 border border-slate-200 rounded-lg text-rose-500 hover:bg-rose-50 flex-shrink-0" title="Delete target">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="mt-4 space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold text-slate-900">{t.completed_count} <span className="text-slate-400 font-normal">/ {t.target_count} completed</span></span>
          <span className={`font-semibold ${t.remaining_count <= 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
            {t.remaining_count <= 0 ? 'Target achieved' : `${t.remaining_count} remaining`}
          </span>
        </div>
        <ProgressBar completed={t.completed_count} total={t.target_count} />
      </div>

      {t.role === 'closing_manager' && kra && (
        <div className="mt-3 bg-slate-50 border border-slate-100 rounded-xl p-3">
          <p className="text-xxs font-bold text-slate-500 uppercase tracking-wider mb-1.5">KRA — Conversion Ratio</p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-700">
              <span className="font-bold">{kra.bookings_closed}</span> closed / <span className="font-bold">{kra.visits_attended}</span> visits attended
            </span>
            <span className={`font-bold ${kra.visits_attended > 0 && (kra.bookings_closed / kra.visits_attended) >= 0.1 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {kra.visits_attended > 0 ? `${Math.round((kra.bookings_closed / kra.visits_attended) * 100)}%` : '—'}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Benchmark: at least 1 booking per 10 visits attended (10%).</p>
        </div>
      )}

      <button onClick={toggleExpand} className="mt-3 flex items-center gap-1 text-xxs font-semibold text-indigo-600 hover:text-indigo-700">
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? 'Hide' : 'View'} completions
      </button>

      {expanded && (
        <div className="mt-2 border-t border-slate-100 pt-2 space-y-1.5 max-h-40 overflow-y-auto">
          {loadingCompletions ? (
            <p className="text-xs text-slate-400">Loading...</p>
          ) : completions && completions.length > 0 ? (
            completions.map(c => (
              <div key={c.id} className="flex items-center justify-between text-xs">
                <span className="text-slate-700 truncate">{c.leads?.customer_name || (c.source_type === 'booking' ? 'Booking' : 'Site Visit')}</span>
                <span className="text-slate-400 flex-shrink-0 ml-2">{new Date(c.completed_at).toLocaleDateString('en-IN')}</span>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-400 italic">No completions yet.</p>
          )}
        </div>
      )}
    </div>
  );
};

export const Targets: React.FC = () => {
  const { user, role } = useAuth();
  const canManage = canManageTargets(role);

  const [scopeTab, setScopeTab] = useState<'mine' | 'all'>('mine');
  const [targets, setTargets] = useState<TargetProgress[]>([]);
  const [usersMap, setUsersMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [roleFilter, setRoleFilter] = useState<'all' | 'sourcing_manager' | 'closing_manager' | 'presales'>('all');

  // A `target_assigned`/`target_updated` notification lands here with
  // ?highlight=<staff_target id> -- scroll to and ring-highlight that
  // card, and auto-expand its completions.
  const { highlightId, registerRow, rowClass, tryFocusRow } = useHighlightParam();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createRole, setCreateRole] = useState<'sourcing_manager' | 'closing_manager' | 'presales'>('sourcing_manager');
  const [createStaffId, setCreateStaffId] = useState('');
  const [staffOptions, setStaffOptions] = useState<UserOption[]>([]);
  const [createCount, setCreateCount] = useState('50');
  const [periodType, setPeriodType] = useState<'calendar_month' | 'custom'>('calendar_month');
  const now = new Date();
  const [monthValue, setMonthValue] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [customStart, setCustomStart] = useState(todayISO());
  const [customEnd, setCustomEnd] = useState(todayISO());
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const [kraMap, setKraMap] = useState<Map<string, ClosingManagerKra>>(new Map());

  const fetchData = useCallback(async () => {
    let query = supabase
      .from('staff_target_progress')
      .select('*')
      .order('period_start', { ascending: false });
    if (scopeTab === 'mine') {
      query = query.eq('assigned_to', user?.id || '');
    }
    const { data, error } = await query;
    if (error) reportQueryError('Targets: list', error);
    else setTargets((data || []) as any);

    if (scopeTab === 'all') {
      const { data: usersData, error: usersErr } = await supabase.from('user_profiles').select('id, full_name');
      if (usersErr) reportQueryError('Targets: users', usersErr);
      else setUsersMap(new Map((usersData || []).map(u => [u.id, u.full_name || 'Unnamed'])));
    }

    const closingManagerRows = (data || []).filter((t: any) => t.role === 'closing_manager');
    if (closingManagerRows.length > 0) {
      const { data: kraData, error: kraErr } = await supabase
        .from('closing_manager_kra')
        .select('staff_target_id, visits_attended, bookings_closed')
        .in('staff_target_id', closingManagerRows.map((t: any) => t.id));
      if (kraErr) reportQueryError('Targets: closing manager KRA', kraErr);
      else setKraMap(new Map((kraData || []).map((k: any) => [k.staff_target_id, { visits_attended: k.visits_attended, bookings_closed: k.bookings_closed }])));
    }

    setLoading(false);
    setSyncing(false);
  }, [scopeTab, user?.id]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
  useEffect(() => { tryFocusRow(); }, [targets, tryFocusRow]);

  useEffect(() => {
    const channel = supabase
      .channel('staff-targets-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_targets' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'target_completions' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    if (!isCreateOpen) return;
    const roleNames = ROLE_STAFF_FILTERS[createRole];
    supabase
      .from('user_roles')
      .select('user_id, roles!inner(name), user_profiles!inner(id, full_name, status)')
      .in('roles.name', roleNames)
      .eq('user_profiles.status', 'active')
      .then(({ data, error }) => {
        if (error) { reportQueryError('Targets: staff options', error); return; }
        const seen = new Map<string, UserOption>();
        (data || []).forEach((r: any) => {
          if (r.user_profiles) seen.set(r.user_profiles.id, { id: r.user_profiles.id, full_name: r.user_profiles.full_name });
        });
        setStaffOptions(Array.from(seen.values()));
        setCreateStaffId('');
      });
  }, [createRole, isCreateOpen]);

  const resetCreateForm = () => {
    setCreateRole('sourcing_manager');
    setCreateStaffId('');
    setCreateCount('50');
    setPeriodType('calendar_month');
    setMonthValue(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    setCustomStart(todayISO());
    setCustomEnd(todayISO());
    setCreateError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createStaffId) { setCreateError('Please select a staff member.'); return; }
    const count = parseInt(createCount, 10);
    if (!count || count <= 0) { setCreateError('Target count must be a positive number.'); return; }

    let period_start: string;
    let period_end: string;
    if (periodType === 'calendar_month') {
      const [y, m] = monthValue.split('-').map(Number);
      const bounds = monthBounds(y, m - 1);
      period_start = bounds.start;
      period_end = bounds.end;
    } else {
      if (!customStart || !customEnd || customEnd < customStart) {
        setCreateError('Please pick a valid start and end date.');
        return;
      }
      period_start = customStart;
      period_end = customEnd;
    }

    setCreateError(null);
    setCreateLoading(true);
    try {
      const { error } = await supabase.from('staff_targets').insert([{
        assigned_to: createStaffId,
        role: createRole,
        target_count: count,
        period_start,
        period_end,
        assigned_by: user?.id || null,
      }]);
      if (error) {
        if (error.code === '23505') {
          setCreateError('A target for this person, role, and exact period already exists.');
        } else {
          throw error;
        }
        return;
      }
      setNotification({ type: 'success', message: 'Target created.' });
      setIsCreateOpen(false);
      resetCreateForm();
      setScopeTab('all');
      fetchData();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create target.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDelete = async (targetId: string) => {
    if (!window.confirm('Delete this target permanently? Its completion history will also be removed.')) return;
    const { error } = await supabase.from('staff_targets').delete().eq('id', targetId);
    if (error) {
      reportQueryError('Targets: delete', error);
      setNotification({ type: 'error', message: 'Failed to delete target.' });
    } else {
      setNotification({ type: 'success', message: 'Target deleted.' });
      fetchData();
    }
  };

  const filteredTargets = targets.filter(t => roleFilter === 'all' || t.role === roleFilter);
  const activeTargets = filteredTargets.filter(t => todayISO() >= t.period_start && todayISO() <= t.period_end);
  const pastTargets = filteredTargets.filter(t => !(todayISO() >= t.period_start && todayISO() <= t.period_end));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-6 w-6 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {notification && (
        <div className={`fixed top-6 right-6 z-[60] flex items-center space-x-2.5 px-4 py-3 rounded-xl border shadow-lg ${
          notification.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-rose-600" />}
          <span className="text-sm font-semibold">{notification.message}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <TargetIcon className="h-6 w-6 text-indigo-600" /> Targets
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            Monthly (or custom-period) quotas for Sourcing Manager, Closing Manager &amp; Presales — auto-completed by Site Visits / Bookings.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => { setSyncing(true); fetchData(); }}
            disabled={syncing}
            className="p-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
          {canManage && (
            <button
              onClick={() => { resetCreateForm(); setIsCreateOpen(true); }}
              className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>New Target</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {canManage && (
          <div className="flex rounded-xl border border-slate-200 overflow-hidden">
            {([
              ['mine', 'My Targets'],
              ['all', 'All Targets'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => { setLoading(true); setScopeTab(value); }}
                className={`px-3.5 py-1.5 text-xs font-semibold transition-all ${scopeTab === value ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as any)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="all">All Roles</option>
          <option value="sourcing_manager">Sourcing Manager</option>
          <option value="closing_manager">Closing Manager</option>
          <option value="presales">Presales</option>
        </select>
      </div>

      {activeTargets.length === 0 && pastTargets.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm py-14 text-center text-slate-400 italic">
          No targets found.
        </div>
      ) : (
        <>
          {activeTargets.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Active Period</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeTargets.map(t => (
                  <TargetCard key={t.id} t={t} staffName={scopeTab === 'all' ? usersMap.get(t.assigned_to) : undefined} canManage={canManage} onDelete={handleDelete} kra={kraMap.get(t.id)} cardRef={registerRow(t.id)} cardClassName={rowClass(t.id)} defaultExpanded={t.id === highlightId} />
                ))}
              </div>
            </div>
          )}
          {pastTargets.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Other Periods</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pastTargets.map(t => (
                  <TargetCard key={t.id} t={t} staffName={scopeTab === 'all' ? usersMap.get(t.assigned_to) : undefined} canManage={canManage} onDelete={handleDelete} kra={kraMap.get(t.id)} cardRef={registerRow(t.id)} cardClassName={rowClass(t.id)} defaultExpanded={t.id === highlightId} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !createLoading && setIsCreateOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">New Target</span>
              <button onClick={() => !createLoading && setIsCreateOpen(false)} className="p-1 rounded-lg text-indigo-200 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="p-6 space-y-4">
                {createError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-sm">{createError}</div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Role</label>
                    <select
                      value={createRole}
                      onChange={(e) => setCreateRole(e.target.value as any)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    >
                      <option value="sourcing_manager">Sourcing Manager</option>
                      <option value="closing_manager">Closing Manager</option>
                      <option value="presales">Presales</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Staff Member *</label>
                    <select
                      value={createStaffId}
                      onChange={(e) => setCreateStaffId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    >
                      <option value="">Select...</option>
                      {staffOptions.map(u => <option key={u.id} value={u.id}>{u.full_name || 'Unnamed'}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Target Count *</label>
                  <input
                    type="number"
                    min={1}
                    value={createCount}
                    onChange={(e) => setCreateCount(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                  <p className="text-xxs text-slate-400 mt-1">{COMPLETION_EVENT_LABEL[createRole]} — each qualifying event reduces this by 1.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Period</label>
                  <div className="flex rounded-xl border border-slate-200 overflow-hidden w-fit mb-2">
                    {([
                      ['calendar_month', 'Calendar Month'],
                      ['custom', 'Custom Range'],
                    ] as const).map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        onClick={() => setPeriodType(value)}
                        className={`px-3 py-1.5 text-xs font-semibold transition-all ${periodType === value ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {periodType === 'calendar_month' ? (
                    <input
                      type="month"
                      value={monthValue}
                      onChange={(e) => setMonthValue(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="date"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                      <input
                        type="date"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={createLoading}
                  className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm disabled:opacity-50"
                >
                  {createLoading ? 'Creating...' : 'Create Target'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
