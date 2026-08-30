import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { reportQueryError } from '../services/queryLogger';
import { supabase } from '../services/supabaseClient';
import {
  Users,
  PhoneCall,
  Calendar,
  IndianRupee,
  Search,
  Filter,
  RefreshCw,
  TrendingUp,
  FileText,
  AlertCircle,
  CheckSquare
} from 'lucide-react';

interface Lead {
  id: string;
  customer_name: string | null;
  mobile: string | null;
  status: string | null;
  created_at: string;
  project_id: string | null;
  owner_id: string | null;
}

interface SiteVisit {
  id: string;
  lead_id: string | null;
  project_id: string | null;
  scheduled_at: string | null;
  status: string | null;
  remarks: string | null;
}

interface DashboardStats {
  totalLeads: number;
  pendingFollowups: number;
  upcomingVisits: number;
  totalBookingsValue: number;
  totalBookingsCount: number;
}

interface MyTask {
  id: string;
  title: string;
  priority: string | null;
  status: string | null;
  due_date: string | null;
}

const taskStatusOptions = ['pending', 'in_progress', 'completed', 'cancelled', 'overdue'];

const MyTasksPanel: React.FC<{ userId: string | undefined }> = ({ userId }) => {
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    supabase
      .from('tasks')
      .select('id, title, priority, status, due_date')
      .eq('assigned_to', userId)
      .not('status', 'in', '(completed,cancelled)')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(6)
      .then(({ data, error }) => {
        if (error) reportQueryError('Dashboard: my tasks', error);
        else setTasks(data || []);
        setLoading(false);
      });
  }, [userId]);

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    const { error } = await supabase
      .from('tasks')
      .update({ status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : null })
      .eq('id', taskId);
    if (error) {
      reportQueryError('Dashboard: my tasks status update', error);
    } else if (newStatus === 'completed' || newStatus === 'cancelled') {
      setTasks(prev => prev.filter(t => t.id !== taskId));
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-indigo-600" /> My Tasks
        </h3>
      </div>
      {loading ? (
        <p className="text-xs text-slate-400">Loading...</p>
      ) : tasks.length === 0 ? (
        <p className="text-xs text-slate-400 italic">No open tasks assigned to you.</p>
      ) : (
        <div className="space-y-2.5">
          {tasks.map(t => (
            <div key={t.id} className="flex items-center justify-between gap-3 border-b border-slate-50 last:border-0 pb-2.5 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{t.title}</p>
                <p className="text-xxs text-slate-400 mt-0.5">
                  {t.due_date ? `Due ${new Date(t.due_date).toLocaleDateString('en-IN')}` : 'No due date'} · <span className="capitalize">{t.priority}</span>
                </p>
              </div>
              <select
                value={t.status || 'pending'}
                onChange={(e) => handleStatusChange(t.id, e.target.value)}
                className="text-xxs font-semibold rounded-full px-2 py-1 border border-slate-200 capitalize flex-shrink-0"
              >
                {taskStatusOptions.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const Dashboard: React.FC = () => {
  const { profile, user, role } = useAuth();
  const navigate = useNavigate();
  const isChannelPartner = role === 'channel_partner';

  // Brokerage summary for a channel partner. leads/bookings counts above
  // already come out correctly scoped to just their own records now that
  // leads_select/bookings_select include the channel_partner_id branch
  // (see migration scope_channel_partner_data_access) -- RLS filters what
  // the unfiltered queries below can even return, so no query change was
  // needed there. This is the one number that table doesn't have: their
  // own referral earnings.
  const [brokerage, setBrokerage] = useState<{ pending: number; paid: number } | null>(null);
  useEffect(() => {
    if (!isChannelPartner) return;
    supabase
      .from('cp_commissions')
      .select('commission_amount, status')
      .then(({ data, error }) => {
        if (error) return reportQueryError('Dashboard: brokerage summary', error);
        const pending = (data || []).filter(c => c.status !== 'paid').reduce((s, c) => s + (c.commission_amount || 0), 0);
        const paid = (data || []).filter(c => c.status === 'paid').reduce((s, c) => s + (c.commission_amount || 0), 0);
        setBrokerage({ pending, paid });
      });
  }, [isChannelPartner]);

  // Filter states
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Data states
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [stats, setStats] = useState<DashboardStats>({
    totalLeads: 0,
    pendingFollowups: 0,
    upcomingVisits: 0,
    totalBookingsValue: 0,
    totalBookingsCount: 0,
  });

  const [recentLeads, setRecentLeads] = useState<Lead[]>([]);
  const [upcomingVisits, setUpcomingVisits] = useState<SiteVisit[]>([]);
  const [projectMap, setProjectMap] = useState<Map<string, string>>(new Map());
  const [profileMap, setProfileMap] = useState<Map<string, string>>(new Map());
  const [leadMap, setLeadMap] = useState<Map<string, string>>(new Map());

  // Function to load all dashboard data from Supabase in parallel
  const fetchDashboardData = useCallback(async () => {
    setError(null);
    try {
      // 1. Load active stats and primary collections in parallel
      const [
        leadsCountRes,
        followupsRes,
        visitsRes,
        bookingsRes,
        recentLeadsRes,
        upcomingVisitsRes,
        projectsRes,
        profilesRes
      ] = await Promise.all([
        // Bulk-uploaded leads are a separate thing and stay out of the main
        // leads count/recency views -- only visible from the Bulk Uploads page.
        supabase.from('leads').select('id', { count: 'exact', head: true }).is('bulk_upload_id', null),
        supabase.from('followups').select('status'),
        supabase.from('site_visits').select('status, scheduled_at'),
        supabase.from('bookings').select('booking_amount'),
        supabase.from('leads').select('*').is('bulk_upload_id', null).order('created_at', { ascending: false }).limit(5),
        supabase.from('site_visits').select('*').order('scheduled_at', { ascending: true }).limit(5),
        supabase.from('projects').select('id, project_name'),
        supabase.from('user_profiles').select('id, full_name')
      ]);

      // Check errors for critical requests
      if (leadsCountRes.error) throw new Error(`Leads count error: ${leadsCountRes.error.message}`);
      if (followupsRes.error) throw new Error(`Followups query error: ${followupsRes.error.message}`);
      if (visitsRes.error) throw new Error(`Site visits query error: ${visitsRes.error.message}`);
      if (bookingsRes.error) throw new Error(`Bookings query error: ${bookingsRes.error.message}`);
      if (recentLeadsRes.error) throw new Error(`Recent leads query error: ${recentLeadsRes.error.message}`);
      if (upcomingVisitsRes.error) throw new Error(`Upcoming site visits query error: ${upcomingVisitsRes.error.message}`);

      // Parse metadata maps
      const newProjectMap = new Map(projectsRes.data?.map(p => [p.id, p.project_name]) || []);
      const newProfileMap = new Map(profilesRes.data?.map(u => [u.id, u.full_name]) || []);
      setProjectMap(newProjectMap);
      setProfileMap(newProfileMap);

      // 2. Fetch lead names for site visits
      const visitLeadIds = [...new Set(upcomingVisitsRes.data?.map(v => v.lead_id).filter(Boolean) as string[])];
      let newLeadMap = new Map<string, string>();
      if (visitLeadIds.length > 0) {
        const { data: visitLeads, error: visitLeadsError } = await supabase
          .from('leads')
          .select('id, customer_name')
          .in('id', visitLeadIds);
        
        if (visitLeadsError) {
          reportQueryError('Dashboard: site visit lead names', visitLeadsError);
        } else {
          newLeadMap = new Map(visitLeads?.map(l => [l.id, l.customer_name || '']) || []);
        }
      }
      setLeadMap(newLeadMap);

      // 3. Compute stats
      const totalLeads = leadsCountRes.count || 0;
      
      const pendingFollowups = followupsRes.data?.filter(
        f => f.status?.toLowerCase() === 'pending'
      ).length || 0;

      const upcomingVisits = visitsRes.data?.filter(v => {
        const isScheduled = v.status?.toLowerCase() === 'scheduled' || v.status?.toLowerCase() === 'pending';
        const isUpcoming = v.scheduled_at ? new Date(v.scheduled_at) >= new Date() : true;
        return isScheduled && isUpcoming;
      }).length || 0;

      const totalBookingsCount = bookingsRes.data?.length || 0;
      const totalBookingsValue = bookingsRes.data?.reduce(
        (sum, b) => sum + (Number(b.booking_amount) || 0), 0
      ) || 0;

      setStats({
        totalLeads,
        pendingFollowups,
        upcomingVisits,
        totalBookingsValue,
        totalBookingsCount
      });

      // 4. Update listings
      setRecentLeads(recentLeadsRes.data || []);
      setUpcomingVisits(upcomingVisitsRes.data || []);
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err);
      setError(err.message || 'An unexpected error occurred while loading dashboard metrics.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Handle manual Sync click
  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    await fetchDashboardData();
  };

  // Filter listings in memory
  const getFilteredLeads = () => {
    return recentLeads.filter(lead => {
      const matchesSearch = searchQuery
        ? (lead.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
           lead.mobile?.includes(searchQuery) ||
           lead.status?.toLowerCase().includes(searchQuery.toLowerCase()))
        : true;

      const matchesProject = projectFilter ? lead.project_id === projectFilter : true;
      const matchesStatus = statusFilter ? lead.status === statusFilter : true;

      return matchesSearch && matchesProject && matchesStatus;
    });
  };

  const filteredLeads = getFilteredLeads();

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-100 border-t-indigo-600"></div>
        <p className="text-slate-500 font-medium">Loading live CRM metrics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Welcome, {profile?.full_name || 'Super Admin'}</h2>
          <p className="text-slate-500 text-sm">
            {isChannelPartner ? 'Your referred leads, bookings and brokerage — nothing else.' : 'CRM Overview & Live Operations Control Center.'}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center space-x-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm focus:outline-none disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 text-slate-500 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync Data'}</span>
          </button>
          <button 
            onClick={() => navigate('/leads?new=true')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md shadow-indigo-600/10 hover:shadow-lg transition-all focus:outline-none"
          >
            + New Lead
          </button>
        </div>
      </div>

      {/* Query Error State Display */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-4 flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-sm">Database Fetch Error</h4>
            <p className="text-xs text-rose-700 mt-0.5">
              {error}. Please check your database connection permissions or contact system administrators.
            </p>
          </div>
        </div>
      )}

      <MyTasksPanel userId={user?.id} />

      {/* KPI Stats Cards (Live States) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Leads */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-slate-500 text-xs font-semibold tracking-wider uppercase">{isChannelPartner ? 'My Referred Leads' : 'Total Leads'}</p>
            <h3 className="text-3xl font-extrabold text-slate-900">{stats.totalLeads}</h3>
            <p className="text-slate-400 text-xs font-medium">{isChannelPartner ? 'Leads you created or were assigned' : 'Synced from Supabase'}</p>
          </div>
          <div className="bg-indigo-50 p-4 rounded-xl text-indigo-600">
            <Users className="h-6 w-6" />
          </div>
        </div>

        {/* Follow-ups Pending */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-slate-500 text-xs font-semibold tracking-wider uppercase">Pending Follow-ups</p>
            <h3 className="text-3xl font-extrabold text-slate-900">{stats.pendingFollowups}</h3>
            <p className="text-slate-400 text-xs font-medium">Actions awaiting review</p>
          </div>
          <div className="bg-sky-50 p-4 rounded-xl text-sky-600">
            <PhoneCall className="h-6 w-6" />
          </div>
        </div>

        {/* Site Visits Scheduled */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-slate-500 text-xs font-semibold tracking-wider uppercase">Visits Scheduled</p>
            <h3 className="text-3xl font-extrabold text-slate-900">{stats.upcomingVisits}</h3>
            <p className="text-slate-400 text-xs font-medium">Upcoming site check-ins</p>
          </div>
          <div className="bg-emerald-50 p-4 rounded-xl text-emerald-600">
            <Calendar className="h-6 w-6" />
          </div>
        </div>

        {/* Total Bookings / Collections */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-slate-500 text-xs font-semibold tracking-wider uppercase">{isChannelPartner ? 'My Bookings' : 'Total Bookings'}</p>
            <h3 className="text-3xl font-extrabold text-slate-900">
              ₹{stats.totalBookingsValue.toLocaleString('en-IN')}
            </h3>
            <p className="text-slate-400 text-xs font-medium">{stats.totalBookingsCount} converted sales</p>
          </div>
          <div className="bg-amber-50 p-4 rounded-xl text-amber-600">
            <IndianRupee className="h-6 w-6" />
          </div>
        </div>

        {/* Brokerage — channel_partner only */}
        {isChannelPartner && (
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-slate-500 text-xs font-semibold tracking-wider uppercase">My Brokerage</p>
              <h3 className="text-3xl font-extrabold text-slate-900">
                ₹{(brokerage?.paid ?? 0).toLocaleString('en-IN')}
              </h3>
              <p className="text-slate-400 text-xs font-medium">
                {brokerage ? `₹${brokerage.pending.toLocaleString('en-IN')} pending payout` : 'Loading...'}
              </p>
            </div>
            <div className="bg-emerald-50 p-4 rounded-xl text-emerald-600">
              <IndianRupee className="h-6 w-6" />
            </div>
          </div>
        )}
      </div>

      {/* FILTER & SEARCH TOOLBAR */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute inset-y-0 left-3 h-4 w-4 text-slate-400 self-center top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search leads, status..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
          />
        </div>

        {/* Project Selector */}
        <div className="flex items-center space-x-2">
          <Filter className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
          >
            <option value="">All Projects</option>
            {Array.from(projectMap.entries()).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {/* Status Selector */}
        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all w-full md:w-auto"
          >
            <option value="">All Statuses</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="visit_scheduled">Visit Scheduled</option>
            <option value="booked">Booked</option>
            <option value="lost">Lost</option>
          </select>
        </div>
      </div>

      {/* DASHBOARD GRID CONTENT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leads Table Card (2/3 width) */}
        <div className="bg-white border border-slate-100 shadow-sm rounded-2xl lg:col-span-2 overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Recent Active Leads</h3>
            <span className="bg-indigo-50 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-full">
              {filteredLeads.length} Showing
            </span>
          </div>

          <div className="overflow-x-auto flex-1 min-h-[300px] flex flex-col">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-100">
                  <th className="py-3 px-5">Lead Name</th>
                  <th className="py-3 px-5">Contact</th>
                  <th className="py-3 px-5">Project</th>
                  {!isChannelPartner && <th className="py-3 px-5">Sourcing Manager</th>}
                  <th className="py-3 px-5">Status</th>
                  <th className="py-3 px-5">Created At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 flex-1">
                {filteredLeads.length > 0 ? (
                  filteredLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-5 font-semibold text-slate-950">{lead.customer_name || 'Unnamed Client'}</td>
                      <td className="py-3.5 px-5 text-sm text-slate-600">{lead.mobile || 'N/A'}</td>
                      <td className="py-3.5 px-5 text-sm text-slate-600">
                        {projectMap.get(lead.project_id || '') || 'N/A'}
                      </td>
                      {!isChannelPartner && (
                        <td className="py-3.5 px-5 text-sm text-slate-600">
                          {profileMap.get(lead.owner_id || '') || 'N/A'}
                        </td>
                      )}
                      <td className="py-3.5 px-5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          lead.status?.toLowerCase() === 'booked' ? 'bg-emerald-50 text-emerald-700' :
                          lead.status?.toLowerCase() === 'lost' ? 'bg-rose-50 text-rose-700' :
                          lead.status?.toLowerCase() === 'visit_scheduled' ? 'bg-amber-50 text-amber-700' :
                          'bg-indigo-50 text-indigo-700'
                        }`}>
                          {lead.status || 'new'}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-xs text-slate-400">
                        {new Date(lead.created_at).toLocaleDateString('en-IN')}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={isChannelPartner ? 5 : 6} className="py-16 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="bg-slate-50 p-4 rounded-full text-slate-300">
                          <Users className="h-8 w-8" />
                        </div>
                        <p className="text-slate-500 font-semibold text-sm">No Active Leads Connected</p>
                        <p className="text-xs max-w-sm text-slate-400">
                          We found no leads in your Supabase database matching the selected filters.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activities and Targets Panel (1/3 width) */}
        <div className="space-y-6">
          {/* Site Visits Card */}
          <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5">
            <h3 className="font-bold text-slate-900 mb-4">Upcoming Site Visits</h3>
            <div className="space-y-3">
              {upcomingVisits.length > 0 ? (
                upcomingVisits.map((visit) => (
                  <div key={visit.id} className="border-l-4 border-emerald-500 bg-slate-50/50 p-3.5 rounded-r-xl space-y-1">
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-sm text-slate-900">
                        {leadMap.get(visit.lead_id || '') || 'Client Visit'}
                      </span>
                      <span className="text-xxs font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded uppercase">
                        {visit.status || 'scheduled'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Project: {projectMap.get(visit.project_id || '') || 'N/A'}
                    </p>
                    {visit.remarks && <p className="text-xxs italic text-slate-400 mt-1">"{visit.remarks}"</p>}
                    <p className="text-xxs text-slate-400 pt-1 font-semibold">
                      {visit.scheduled_at ? new Date(visit.scheduled_at).toLocaleString('en-IN') : 'N/A'}
                    </p>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                  <div className="bg-slate-50 p-3 rounded-full text-slate-300">
                    <Calendar className="h-6 w-6" />
                  </div>
                  <p className="text-slate-600 font-semibold text-sm">No Site Visits Found</p>
                  <p className="text-xs text-slate-400">
                    There are no scheduled customer site visits logged in the site_visits table.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Sales Target Card */}
          <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Target Achievement</h3>
              <TrendingUp className="h-5 w-5 text-indigo-600" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Sales Conversion</span>
                <span className="font-semibold text-slate-900">
                  {stats.totalLeads > 0 ? Math.round((stats.totalBookingsCount / stats.totalLeads) * 100) : 0}%
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div 
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-500" 
                  style={{ 
                    width: `${stats.totalLeads > 0 ? Math.min(Math.round((stats.totalBookingsCount / stats.totalLeads) * 100), 100) : 0}%` 
                  }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-slate-400 pt-1">
                <span>{stats.totalBookingsCount} Sales Made</span>
                <span>Total Leads: {stats.totalLeads}</span>
              </div>
            </div>
            
            <div className="border-t border-slate-100 pt-4 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center">
                <FileText className="h-3.5 w-3.5 mr-1" />
                Target Period: Aug 2026
              </span>
              <span className="font-medium text-slate-500">Live DB Metrics</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
