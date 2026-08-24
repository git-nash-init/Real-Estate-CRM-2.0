import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { reportQueryError } from '../services/queryLogger';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { BarChart3, RefreshCw, IndianRupee, Users, TrendingUp, PhoneCall, ShieldAlert } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface Lead {
  id: string;
  status: string | null;
  owner_id: string | null;
  channel_partner_id: string | null;
  telecaller_id: string | null;
  created_at: string;
}

interface Booking {
  id: string;
  status: string | null;
  sales_owner: string | null;
  booking_amount: number | null;
  total_payable_amount: number | null;
  channel_partner_id: string | null;
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

const PIE_COLORS = ['#6366f1', '#10b981'];

export const Reports: React.FC = () => {
  const { role } = useAuth();
  const isAdmin = role === 'super_admin' || role === 'project_admin';

  const [leads, setLeads] = useState<Lead[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [employeesMap, setEmployeesMap] = useState<Map<string, string>>(new Map());
  const [profilesMap, setProfilesMap] = useState<Map<string, string>>(new Map());

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('id, status, owner_id, channel_partner_id, telecaller_id, created_at');
      if (error) reportQueryError('Reports: leads', error);
      else setLeads(data || []);
    } catch (err) {
      reportQueryError('Reports: leads', err);
    }

    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, status, sales_owner, booking_amount, total_payable_amount, channel_partner_id');
      if (error) reportQueryError('Reports: bookings', error);
      else setBookings(data || []);
    } catch (err) {
      reportQueryError('Reports: bookings', err);
    }

    try {
      const { data, error } = await supabase
        .from('call_logs')
        .select('id, employee_id, lead_id, outcome, duration_seconds, called_at');
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

    setLoading(false);
    setSyncing(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    await fetchData();
  };

  // ---- Aggregations ----

  const funnelData = useMemo(() => {
    return leadStatuses.map(status => ({
      status: status.replace(/_/g, ' '),
      count: leads.filter(l => l.status === status).length,
      fill: statusColors[status],
    }));
  }, [leads]);

  const confirmedBookings = useMemo(
    () => bookings.filter(b => ['confirmed', 'agreement_pending', 'agreement_completed'].includes(b.status || '')),
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

  // ---- Telecaller anti-fraud signals ----
  // These don't prove a call happened over the phone — only a real
  // telephony/dialer integration can do that — but they surface the
  // patterns a telecaller faking logs would leave behind: too many calls
  // logged too fast, calls logged while off the clock, and "connected"
  // calls whose lead was never actually progressed. See WALKTHROUGH.md for
  // the honest, plain-language version of what this does and doesn't catch.
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

    // Signal 1: burst logging — 5+ calls logged within any 10-minute
    // window by the same employee.
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
          break; // one flag per employee is enough to surface the issue
        }
      }
    }

    // Signal 2: calls logged outside the employee's checked-in attendance
    // window for that day (or with no attendance record at all that day).
    const outsideAttendance: { employeeId: string; calledAt: string }[] = [];
    for (const [empId, calls] of byEmployee) {
      for (const c of calls) {
        const date = c.called_at!.slice(0, 10);
        const att = attendanceByEmployeeDate.get(`${empId}__${date}`);
        if (!att || !att.check_in) {
          outsideAttendance.push({ employeeId: empId, calledAt: c.called_at! });
          continue;
        }
        const calledAtMs = new Date(c.called_at!).getTime();
        const checkInMs = new Date(att.check_in).getTime();
        const checkOutMs = att.check_out ? new Date(att.check_out).getTime() : Infinity;
        if (calledAtMs < checkInMs || calledAtMs > checkOutMs) {
          outsideAttendance.push({ employeeId: empId, calledAt: c.called_at! });
        }
      }
    }

    // Signal 3: marked "connected" but the lead is still sitting at "new" —
    // i.e. the call was never actually followed through.
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

  if (!isAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-10 flex flex-col items-center justify-center text-center min-h-[300px]">
        <ShieldAlert className="h-10 w-10 text-amber-500 mb-3" />
        <h3 className="text-lg font-bold text-slate-800">Admin Access Only</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">Reports is currently limited to admin roles. Other teams will get their own relevant views in a future phase.</p>
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-indigo-600" /> Reports
          </h2>
          <p className="text-slate-500 text-xs mt-1">Sales and performance overview.</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="p-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Users className="h-3 w-3" /> Total Leads</span>
          <span className="block text-xl font-bold text-slate-900 mt-1">{leads.length}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Bookings</span>
          <span className="block text-xl font-bold text-emerald-600 mt-1">{confirmedBookings.length}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><IndianRupee className="h-3 w-3" /> Revenue</span>
          <span className="block text-xl font-bold text-indigo-600 mt-1">₹{totalRevenue.toLocaleString('en-IN')}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><PhoneCall className="h-3 w-3" /> Calls Logged</span>
          <span className="block text-xl font-bold text-slate-900 mt-1">{callLogs.length}</span>
        </div>
      </div>

      {/* Lead funnel */}
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
        {/* Sales by employee */}
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

        {/* CP vs Direct */}
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

      {/* Telecaller performance */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2"><PhoneCall className="h-4 w-4 text-indigo-600" /> Telecaller Call Performance</h3>
        {telecallerStats.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-100">
                  <th className="py-2">Telecaller</th>
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

      {/* Telecaller anti-fraud signals */}
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
