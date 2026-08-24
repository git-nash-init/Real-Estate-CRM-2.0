import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  AlertCircle,
  Clock,
  User,
  Bookmark,
  CheckCircle,
  MapPin,
  Users
} from 'lucide-react';

interface SiteVisit {
  id: string;
  created_at: string;
  lead_id: string | null;
  project_id: string | null;
  scheduled_at: string | null;
  status: string | null;
  remarks: string | null;
  feedback: string | null;
  channel_partner_id?: string | null;
}

interface Lead {
  id: string;
  customer_name: string | null;
  mobile: string | null;
  email: string | null;
  project_id: string | null;
  owner_id: string | null;
  channel_partner_id: string | null;
}

export const SiteVisits: React.FC = () => {
  // Query & state filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  // Pagination states
  const [page, setPage] = useState(0);
  const [pageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  // Data states
  const [visits, setVisits] = useState<SiteVisit[]>([]);
  const [leadsMap, setLeadsMap] = useState<Map<string, Lead>>(new Map());
  const [projectMap, setProjectMap] = useState<Map<string, string>>(new Map());
  const [profileMap, setProfileMap] = useState<Map<string, string>>(new Map());
  const [leadsList, setLeadsList] = useState<Lead[]>([]); // For Create dropdown

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal open states
  const [selectedVisit, setSelectedVisit] = useState<SiteVisit | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Create Form fields
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('planned');
  const [selectedChannelPartnerId, setSelectedChannelPartnerId] = useState('');
  const [remarks, setRemarks] = useState('');

  // Channel Partner lookups lists & map
  const [channelPartners, setChannelPartners] = useState<{ id: string; name: string; cp_code: string }[]>([]);
  const [channelPartnerMap, setChannelPartnerMap] = useState<Map<string, string>>(new Map());

  // Status updating loader
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Fetch lookups (projects, profiles, leads, CPs)
  const fetchLookups = useCallback(async () => {
    try {
      const [projectsRes, profilesRes, leadsRes, cpRes] = await Promise.all([
        supabase.from('projects').select('id, project_name'),
        supabase.from('user_profiles').select('id, full_name'),
        supabase.from('leads').select('id, customer_name, mobile, email, project_id, owner_id, channel_partner_id'),
        supabase.from('channel_partners').select('id, name, cp_code').eq('status', 'active')
      ]);

      if (projectsRes.data) {
        setProjectMap(new Map(projectsRes.data.map(p => [p.id, p.project_name])));
      }
      if (profilesRes.data) {
        setProfileMap(new Map(profilesRes.data.map(u => [u.id, u.full_name])));
      }
      if (leadsRes.data) {
        setLeadsList(leadsRes.data as any);
        setLeadsMap(new Map(leadsRes.data.map(l => [l.id, l as any])));
      }
      if (cpRes.data) {
        setChannelPartners(cpRes.data);
        setChannelPartnerMap(new Map(cpRes.data.map(c => [c.id, `${c.cp_code} - ${c.name}`])));
      }
    } catch (err) {
      console.warn('Failed to load site-visit lookups:', err);
    }
  }, []);

  // Fetch site-visits list
  const fetchSiteVisits = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      let query = supabase
        .from('site_visits')
        .select('*', { count: 'exact' });

      // Apply Filter by Status
      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }
      // Apply Filter by Project
      if (projectFilter) {
        query = query.eq('project_id', projectFilter);
      }

      // Apply Pagination
      const from = page * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to).order('scheduled_at', { ascending: true });

      const { data, count, error: fetchError } = await query;

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      setVisits(data || []);
      setTotalCount(count || 0);
    } catch (err: any) {
      console.error('Error fetching site visits:', err);
      setError(err.message || 'An unexpected error occurred while loading site visits.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [statusFilter, projectFilter, page, pageSize]);

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups]);

  useEffect(() => {
    fetchSiteVisits();
  }, [fetchSiteVisits]);

  // Sync refresh trigger
  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    await fetchLookups();
    await fetchSiteVisits();
  };

  // Auto-dismiss alert notifications
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Auto-populate Project and Channel Partner select when Lead is chosen in Creation form
  useEffect(() => {
    if (selectedLeadId) {
      const lead = leadsMap.get(selectedLeadId);
      if (lead) {
        if (lead.project_id) {
          setSelectedProjectId(lead.project_id);
        }
        if (lead.channel_partner_id) {
          setSelectedChannelPartnerId(lead.channel_partner_id);
        } else {
          setSelectedChannelPartnerId('');
        }
      }
    }
  }, [selectedLeadId, leadsMap]);

  // Submit New Site Visit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeadId) {
      setCreateError('Please select a Customer / Lead.');
      return;
    }
    if (!selectedProjectId) {
      setCreateError('Please select a Project.');
      return;
    }
    if (!scheduledAt) {
      setCreateError('Please select a Site Visit Date and Time.');
      return;
    }

    setCreateError(null);
    setCreateLoading(true);

    try {
      const { error: insertError } = await supabase
        .from('site_visits')
        .insert([
          {
            lead_id: selectedLeadId,
            project_id: selectedProjectId,
            status: selectedStatus || 'planned',
            remarks: remarks.trim() || null,
            scheduled_at: new Date(scheduledAt).toISOString()
          }
        ]);

      if (insertError) {
        throw new Error(insertError.message);
      }

      // Reset form states
      setIsCreateOpen(false);
      setSelectedLeadId('');
      setSelectedProjectId('');
      setScheduledAt('');
      setRemarks('');
      setSelectedStatus('planned');
      setSelectedChannelPartnerId('');

      // Refresh list
      setPage(0);
      await fetchSiteVisits();

      setNotification({
        type: 'success',
        message: 'New site visit schedule created successfully!'
      });
    } catch (err: any) {
      console.error('Site visit creation error:', err);
      // Nice user-facing message translation
      if (err.message && err.message.toLowerCase().includes('violates not-null constraint')) {
        setCreateError('Database insertion denied: missing required project fields or constraints.');
      } else {
        setCreateError(err.message || 'Database error occurred while scheduling site visit.');
      }
    } finally {
      setCreateLoading(false);
    }
  };

  // Update Status Quick Actions (Complete/Cancel)
  const handleUpdateStatus = async (visitId: string, newStatus: string) => {
    setUpdatingId(visitId);
    try {
      const { error: updateError } = await supabase
        .from('site_visits')
        .update({ status: newStatus })
        .eq('id', visitId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      // Local update to avoid full reload loading spinners
      setVisits(prev => prev.map(v => v.id === visitId ? { ...v, status: newStatus } : v));
      
      if (selectedVisit && selectedVisit.id === visitId) {
        setSelectedVisit(prev => prev ? { ...prev, status: newStatus } : null);
      }

      setNotification({
        type: 'success',
        message: `Site visit status updated to ${newStatus}!`
      });
    } catch (err: any) {
      console.error('Site visit status update error:', err);
      setNotification({
        type: 'error',
        message: err.message || 'Failed to update site visit status.'
      });
    } finally {
      setUpdatingId(null);
    }
  };

  // Filter site visits in-memory by search Query (matching lead customer name or remarks)
  const getFilteredVisits = () => {
    return visits.filter(v => {
      const lead = leadsMap.get(v.lead_id || '');
      const matchesSearch = searchQuery
        ? (lead?.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
           lead?.mobile?.includes(searchQuery) ||
           v.remarks?.toLowerCase().includes(searchQuery.toLowerCase()))
        : true;

      const matchesProject = projectFilter
        ? v.project_id === projectFilter
        : true;

      return matchesSearch && matchesProject;
    });
  };

  const filteredVisits = getFilteredVisits();
  const startRange = page * pageSize + 1;
  const endRange = Math.min((page + 1) * pageSize, totalCount);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Site Visits Directory</h2>
          <p className="text-slate-500 text-sm">Schedule, manage, and log client site inspect visits.</p>
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
            onClick={() => setIsCreateOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md shadow-indigo-600/10 hover:shadow-lg transition-all focus:outline-none"
          >
            + New Site Visit
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {notification && (
        <div className={`border rounded-xl p-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200 shadow-sm ${
          notification.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-rose-50 border-rose-200 text-rose-950'
        }`}>
          <div className="flex items-center space-x-2.5">
            <CheckCircle className={`h-5 w-5 ${notification.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`} />
            <span className="text-sm font-semibold">{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600 focus:outline-none">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Database Error Banner */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-4 flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-sm">Database Fetch Error</h4>
            <p className="text-xs text-rose-700 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* TOOLBAR */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Search */}
        <div className="relative md:col-span-2">
          <Search className="absolute inset-y-0 left-3 h-4 w-4 text-slate-400 self-center top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by customer name, mobile, remarks..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
          />
        </div>

        {/* Project filter */}
        <div>
          <select
            value={projectFilter}
            onChange={(e) => { setProjectFilter(e.target.value); setPage(0); }}
            className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all w-full"
          >
            <option value="">All Projects</option>
            {Array.from(projectMap.entries()).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>

        {/* Status filter */}
        <div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all w-full"
          >
            <option value="">All Statuses</option>
            <option value="planned">Planned</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* TABLE DIRECTORY */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col">
        {loading ? (
          <div className="py-24 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-100 border-t-indigo-600 mx-auto mb-4"></div>
            <p className="text-slate-500 font-medium">Loading site visits...</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3.5 px-6">Customer / Lead</th>
                    <th className="py-3.5 px-6">Phone</th>
                    <th className="py-3.5 px-6">Associated Project</th>
                    <th className="py-3.5 px-6">Sourcing Manager</th>
                    <th className="py-3.5 px-6">Site Visit Date & Time</th>
                    <th className="py-3.5 px-6">Status</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVisits.length > 0 ? (
                    filteredVisits.map((v) => {
                      const lead = leadsMap.get(v.lead_id || '');
                      return (
                        <tr key={v.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 px-6 font-semibold text-slate-900">{lead?.customer_name || 'Unnamed Client'}</td>
                          <td className="py-4 px-6 text-sm text-slate-600">{lead?.mobile || 'N/A'}</td>
                          <td className="py-4 px-6 text-sm text-slate-600">
                            {projectMap.get(v.project_id || '') || 'N/A'}
                          </td>
                          <td className="py-4 px-6 text-sm text-slate-600">
                            {profileMap.get(lead?.owner_id || '') || 'N/A'}
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center space-x-2 text-sm text-slate-700">
                              <Clock className="h-4 w-4 text-slate-400 flex-shrink-0" />
                              <span>{v.scheduled_at ? new Date(v.scheduled_at).toLocaleString('en-IN') : 'N/A'}</span>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              v.status?.toLowerCase() === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                              v.status?.toLowerCase() === 'cancelled' ? 'bg-rose-50 text-rose-700' :
                              'bg-amber-50 text-amber-700'
                            }`}>
                              {v.status || 'planned'}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              {/* Complete Site Visit Quick Action */}
                              {v.status?.toLowerCase() === 'planned' && (
                                <button
                                  onClick={() => handleUpdateStatus(v.id, 'completed')}
                                  disabled={updatingId === v.id}
                                  className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-emerald-50 border border-emerald-100 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                                >
                                  {updatingId === v.id ? '...' : 'Complete'}
                                </button>
                              )}
                              
                              <button
                                onClick={() => setSelectedVisit(v)}
                                className="inline-flex items-center space-x-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>View</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-20 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center space-y-3">
                          <div className="bg-slate-50 p-4 rounded-full text-slate-300">
                            <MapPin className="h-8 w-8" />
                          </div>
                          <p className="text-slate-500 font-semibold text-sm">No Site Visits Scheduled</p>
                          <p className="text-xs max-w-sm text-slate-400">
                            No scheduled client inspect records exist in your site_visits database matching active filters.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalCount > 0 && (
              <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">
                  Showing <span className="font-semibold text-slate-800">{startRange}</span> to{' '}
                  <span className="font-semibold text-slate-800">{endRange}</span> of{' '}
                  <span className="font-semibold text-slate-800">{totalCount}</span> visits
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setPage(prev => Math.max(prev - 1, 0))}
                    disabled={page === 0}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus:outline-none disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4.5 w-4.5" />
                  </button>
                  <span className="text-xs font-semibold text-slate-700">
                    Page {page + 1} of {Math.ceil(totalCount / pageSize)}
                  </span>
                  <button
                    onClick={() => setPage(prev => prev + 1)}
                    disabled={(page + 1) * pageSize >= totalCount}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus:outline-none disabled:opacity-50"
                  >
                    <ChevronRight className="h-4.5 w-4.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* VIEW DETAIL MODAL */}
      {selectedVisit && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedVisit(null)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <MapPin className="h-5 w-5 text-indigo-400" />
                <span className="font-bold tracking-tight">Site Visit Call logs</span>
              </div>
              <button onClick={() => setSelectedVisit(null)} className="p-1 rounded-lg text-slate-400 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {(() => {
                const lead = leadsMap.get(selectedVisit.lead_id || '');
                return (
                  <>
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-lg font-bold text-slate-900">{lead?.customer_name || 'Unnamed Client'}</h4>
                        <p className="text-xs text-slate-500">Live Client Property Inspect Log</p>
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        selectedVisit.status?.toLowerCase() === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                        selectedVisit.status?.toLowerCase() === 'cancelled' ? 'bg-rose-50 text-rose-700' :
                        'bg-amber-50 text-amber-700'
                      }`}>
                        {selectedVisit.status || 'planned'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-5">
                      <div className="flex items-start space-x-2 text-slate-700">
                        <User className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                        <div>
                          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Mobile Number</span>
                          <span className="text-sm font-semibold">{lead?.mobile || 'N/A'}</span>
                        </div>
                      </div>

                      <div className="flex items-start space-x-2 text-slate-700">
                        <User className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                        <div>
                          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Email Address</span>
                          <span className="text-sm font-semibold break-all">{lead?.email || 'N/A'}</span>
                        </div>
                      </div>

                      <div className="flex items-start space-x-2 text-slate-700">
                        <Clock className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                        <div>
                          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Visit Date & Time</span>
                          <span className="text-sm font-semibold">
                            {selectedVisit.scheduled_at ? new Date(selectedVisit.scheduled_at).toLocaleString('en-IN') : 'N/A'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-start space-x-2 text-slate-700">
                        <Bookmark className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                        <div>
                          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Property Project</span>
                          <span className="text-sm font-semibold">
                            {projectMap.get(selectedVisit.project_id || '') || 'N/A'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-start space-x-2 text-slate-700 col-span-2">
                        <User className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                        <div>
                          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Sourcing Manager Assigned</span>
                          <span className="text-sm font-semibold">
                            {profileMap.get(lead?.owner_id || '') || 'N/A'}
                          </span>
                        </div>
                      </div>

                      {lead?.channel_partner_id && (
                        <div className="flex items-start space-x-2 text-slate-700 col-span-2">
                          <Users className="h-4 w-4 text-indigo-500 mt-1 flex-shrink-0" />
                          <div>
                            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Channel Partner Attribution</span>
                            <span className="text-sm font-semibold text-indigo-600">
                              {channelPartnerMap.get(lead.channel_partner_id) || 'N/A'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-slate-100 pt-5">
                      <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider mb-2">Remarks / Notes</span>
                      <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-sm text-slate-700 leading-relaxed max-h-[120px] overflow-y-auto">
                        {selectedVisit.remarks || 'No remarks logged.'}
                      </div>
                    </div>

                    {selectedVisit.feedback && (
                      <div className="border-t border-slate-100 pt-5">
                        <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider mb-2">Client Feedback Log</span>
                        <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-sm text-slate-700 leading-relaxed max-h-[120px] overflow-y-auto">
                          {selectedVisit.feedback}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-6 py-4 flex justify-between items-center border-t border-slate-100">
              <div className="flex items-center space-x-2">
                {selectedVisit.status?.toLowerCase() === 'planned' && (
                  <>
                    <button
                      onClick={() => handleUpdateStatus(selectedVisit.id, 'completed')}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
                    >
                      Complete Visit
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedVisit.id, 'cancelled')}
                      className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-semibold transition-all"
                    >
                      Cancel Visit
                    </button>
                  </>
                )}
              </div>
              <button
                onClick={() => setSelectedVisit(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE SITE VISIT MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsCreateOpen(false)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">Schedule New Site Visit</span>
              <button type="button" onClick={() => setIsCreateOpen(false)} className="p-1 rounded-lg text-indigo-200 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateSubmit}>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {createError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-start space-x-2.5">
                    <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-semibold leading-tight">{createError}</span>
                  </div>
                )}

                {/* Lead Select */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Select Lead / Customer *</label>
                  <select
                    required
                    value={selectedLeadId}
                    onChange={(e) => setSelectedLeadId(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                  >
                    <option value="">Choose Lead...</option>
                    {leadsList.length > 0 ? (
                      leadsList.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.customer_name || 'Unnamed Lead'}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>No Leads available (Database is empty)</option>
                    )}
                  </select>
                </div>

                {/* Channel Partner Select */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Channel Partner (Auto-inherited from Lead)</label>
                  <select
                    value={selectedChannelPartnerId}
                    onChange={(e) => setSelectedChannelPartnerId(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                  >
                    <option value="">No Channel Partner...</option>
                    {channelPartners.map(cp => (
                      <option key={cp.id} value={cp.id}>
                        {cp.cp_code} - {cp.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Project Select */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Project *</label>
                  <select
                    required
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                  >
                    <option value="">Choose Project...</option>
                    {projectMap.size > 0 ? (
                      Array.from(projectMap.entries()).map(([id, name]) => (
                        <option key={id} value={id}>{name}</option>
                      ))
                    ) : (
                      <option value="" disabled>No projects available (Database is empty)</option>
                    )}
                  </select>
                </div>

                {/* Scheduled Date & Time */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Site Visit Date & Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
                  />
                </div>

                {/* Status select */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Status *</label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                  >
                    <option value="planned">Planned</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {/* Remarks */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Remarks / Notes</label>
                  <textarea
                    placeholder="Describe visit coordinates, specific flat block/unit interest..."
                    rows={3}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* Form Footer */}
              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/10 hover:shadow-lg disabled:opacity-50 transition-all focus:outline-none"
                >
                  {createLoading ? 'Scheduling...' : 'Schedule Visit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
