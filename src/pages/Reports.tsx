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
  outcome: string | null;
  duration_seconds: number | null;
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
        .select('id, employee_id, outcome, duration_seconds');
      if (error) reportQueryError('Reports: call logs', error);
      else setCallLogs(data || []);
    } catch (err) {
      reportQueryError('Reports: call logs', err);
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
    </div>
  );
};
