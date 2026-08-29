import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { canEditLead } from '../utils/permissions';
import { reportQueryError } from '../services/queryLogger';
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  AlertCircle,
  Calendar,
  PhoneCall,
  Clock,
  User,
  Bookmark,
  FileText,
  CheckCircle
} from 'lucide-react';

interface Followup {
  id: string;
  created_at: string;
  lead_id: string | null;
  status: string | null;
  notes: string | null;
  due_at: string | null;
  reminder_at: string | null;
}

interface Lead {
  id: string;
  customer_name: string | null;
  mobile: string | null;
  email: string | null;
  project_id: string | null;
  owner_id: string | null;
}

export const Followups: React.FC = () => {
  const { role, user } = useAuth();

  // Query & state filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  // Pagination states
  const [page, setPage] = useState(0);
  const [pageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  // Data states
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [leadsMap, setLeadsMap] = useState<Map<string, Lead>>(new Map());
  const [projectMap, setProjectMap] = useState<Map<string, string>>(new Map());
  const [profileMap, setProfileMap] = useState<Map<string, string>>(new Map());
  const [leadsList, setLeadsList] = useState<Lead[]>([]); // For Create dropdown

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal open states
  const [selectedFollowup, setSelectedFollowup] = useState<Followup | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Create Form fields
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [reminderAt, setReminderAt] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('pending');

  // Edit Form fields
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingFollowup, setEditingFollowup] = useState<Followup | null>(null);
  const [editDueAt, setEditDueAt] = useState('');
  const [editReminderAt, setEditReminderAt] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('pending');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Status updating loader
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Fetch lookups (projects, profiles, leads)
  const fetchLookups = useCallback(async () => {
    try {
      const [projectsRes, profilesRes, leadsRes] = await Promise.all([
        supabase.from('projects').select('id, project_name'),
        supabase.from('user_profiles').select('id, full_name'),
        supabase.from('leads').select('id, customer_name, mobile, email, project_id, owner_id')
      ]);

      if (projectsRes.data) {
        setProjectMap(new Map(projectsRes.data.map(p => [p.id, p.project_name])));
      }
      if (profilesRes.data) {
        setProfileMap(new Map(profilesRes.data.map(u => [u.id, u.full_name])));
      }
      if (leadsRes.data) {
        setLeadsList(leadsRes.data);
        setLeadsMap(new Map(leadsRes.data.map(l => [l.id, l])));
      }
    } catch (err) {
      reportQueryError('Follow-ups: lookups', err);
    }
  }, []);

  // Fetch follow-ups list
  const fetchFollowups = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      let query = supabase
        .from('followups')
        .select('*', { count: 'exact' });

      // Apply Filter by Status
      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }

      // Apply Pagination
      const from = page * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to).order('due_at', { ascending: true });

      const { data, count, error: fetchError } = await query;

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      setFollowups(data || []);
      setTotalCount(count || 0);
    } catch (err: any) {
      console.error('Error fetching follow-ups:', err);
      setError(err.message || 'An unexpected error occurred while loading follow-ups.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [statusFilter, page, pageSize]);

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups]);

  useEffect(() => {
    fetchFollowups();
  }, [fetchFollowups]);

  // Sync refresh trigger
  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    await fetchLookups();
    await fetchFollowups();
  };

  // Toast alert dismiss timer
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Submit New Follow-up
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeadId) {
      setCreateError('Please select a Customer / Lead.');
      return;
    }
    if (!dueAt) {
      setCreateError('Please select a Follow-up Date and Time.');
      return;
    }

    setCreateError(null);
    setCreateLoading(true);

    try {
      const { error: insertError } = await supabase
        .from('followups')
        .insert([
          {
            lead_id: selectedLeadId,
            status: selectedStatus || 'pending',
            notes: notes.trim() || null,
            due_at: new Date(dueAt).toISOString(),
            reminder_at: reminderAt ? new Date(reminderAt).toISOString() : null
          }
        ]);

      if (insertError) {
        throw new Error(insertError.message);
      }

      // Keep leads table in sync
      if (selectedStatus === 'pending') {
        await supabase
          .from('leads')
          .update({
            next_followup_at: new Date(dueAt).toISOString()
          })
          .eq('id', selectedLeadId);
      } else if (selectedStatus === 'completed') {
        await supabase
          .from('leads')
          .update({
            last_contact_at: new Date().toISOString(),
            next_followup_at: null
          })
          .eq('id', selectedLeadId);
      }

      // Reset form states
      setIsCreateOpen(false);
      setSelectedLeadId('');
      setDueAt('');
      setReminderAt('');
      setNotes('');
      setSelectedStatus('pending');

      // Refresh list
      setPage(0);
      await fetchFollowups();

      setNotification({
        type: 'success',
        message: 'New follow-up record created successfully!'
      });
    } catch (err: any) {
      console.error('Follow-up creation error:', err);
      setCreateError(err.message || 'Database error occurred while inserting follow-up.');
    } finally {
      setCreateLoading(false);
    }
  };

  // Submit Edit Follow-up
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFollowup) return;
    if (!editDueAt) {
      setEditError('Please select a Follow-up Date and Time.');
      return;
    }

    setEditError(null);
    setEditLoading(true);

    try {
      const { error: updateError } = await supabase
        .from('followups')
        .update({
          due_at: new Date(editDueAt).toISOString(),
          reminder_at: editReminderAt ? new Date(editReminderAt).toISOString() : null,
          notes: editNotes.trim() || null,
          status: editStatus
        })
        .eq('id', editingFollowup.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      // Sync the related lead cache fields
      if (editingFollowup.lead_id) {
        if (editStatus === 'pending') {
          await supabase
            .from('leads')
            .update({
              next_followup_at: new Date(editDueAt).toISOString()
            })
            .eq('id', editingFollowup.lead_id);
        } else if (editStatus === 'completed') {
          await supabase
            .from('leads')
            .update({
              last_contact_at: new Date().toISOString(),
              next_followup_at: null
            })
            .eq('id', editingFollowup.lead_id);
        } else if (editStatus === 'cancelled') {
          await supabase
            .from('leads')
            .update({
              next_followup_at: null
            })
            .eq('id', editingFollowup.lead_id);
        }
      }

      setIsEditOpen(false);
      setEditingFollowup(null);
      await fetchFollowups();

      setNotification({
        type: 'success',
        message: 'Follow-up updated successfully!'
      });
    } catch (err: any) {
      console.error('Follow-up update error:', err);
      setEditError(err.message || 'Database error occurred while updating follow-up.');
    } finally {
      setEditLoading(false);
    }
  };

  // Update Status Quick Toggle
  const handleUpdateStatus = async (followupId: string, newStatus: string) => {
    setUpdatingId(followupId);
    try {
      const { error: updateError } = await supabase
        .from('followups')
        .update({ status: newStatus })
        .eq('id', followupId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      // Keep leads table in sync
      const f = followups.find(item => item.id === followupId);
      if (f && f.lead_id) {
        if (newStatus === 'completed') {
          await supabase
            .from('leads')
            .update({
              last_contact_at: new Date().toISOString(),
              next_followup_at: null
            })
            .eq('id', f.lead_id);
        } else if (newStatus === 'cancelled') {
          await supabase
            .from('leads')
            .update({
              next_followup_at: null
            })
            .eq('id', f.lead_id);
        }
      }

      // Update local state to avoid full reload lag
      setFollowups(prev => prev.map(f => f.id === followupId ? { ...f, status: newStatus } : f));
      
      // Update selected modal details if open
      if (selectedFollowup && selectedFollowup.id === followupId) {
        setSelectedFollowup(prev => prev ? { ...prev, status: newStatus } : null);
      }

      setNotification({
        type: 'success',
        message: `Follow-up status updated to ${newStatus}!`
      });
    } catch (err: any) {
      console.error('Follow-up status update error:', err);
      setNotification({
        type: 'error',
        message: err.message || 'Failed to update follow-up status.'
      });
    } finally {
      setUpdatingId(null);
    }
  };

  // Filter followups in-memory by search Query (matching lead customer name or notes)
  const getFilteredFollowups = () => {
    return followups.filter(f => {
      const lead = leadsMap.get(f.lead_id || '');
      const matchesSearch = searchQuery
        ? (lead?.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
           f.notes?.toLowerCase().includes(searchQuery.toLowerCase()))
        : true;

      const matchesProject = projectFilter
        ? lead?.project_id === projectFilter
        : true;

      return matchesSearch && matchesProject;
    });
  };

  const getStats = () => {
    let todayCount = 0;
    let upcomingCount = 0;
    let overdueCount = 0;
    let completedCount = 0;

    const now = new Date();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    followups.forEach(f => {
      const status = f.status?.toLowerCase();
      if (status === 'completed') {
        completedCount++;
      } else if (status === 'pending' || status === '' || !status) {
        if (!f.due_at) return;
        const due = new Date(f.due_at);
        if (due < now) {
          overdueCount++;
        } else {
          upcomingCount++;
        }
        
        if (due >= startOfToday && due <= endOfToday) {
          todayCount++;
        }
      }
    });

    return { todayCount, upcomingCount, overdueCount, completedCount };
  };

  const stats = getStats();

  const filteredFollowups = getFilteredFollowups();
  const startRange = page * pageSize + 1;
  const endRange = Math.min((page + 1) * pageSize, totalCount);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Follow-ups Scheduler</h2>
          <p className="text-slate-500 text-sm">Schedule and audit customer follow-ups and callbacks.</p>
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
            + New Follow-up
          </button>
        </div>
      </div>

      {/* Alerts toast */}
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

      {/* STATS SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Follow-ups */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Today's Callbacks</p>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{stats.todayCount}</h3>
          </div>
        </div>

        {/* Upcoming */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
            <Calendar className="h-6 w-6" />
          </div>
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Upcoming Calls</p>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{stats.upcomingCount}</h3>
          </div>
        </div>

        {/* Overdue */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-rose-50 rounded-xl text-rose-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Overdue Callbacks</p>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{stats.overdueCount}</h3>
          </div>
        </div>

        {/* Completed */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <CheckCircle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Completed Audit</p>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{stats.completedCount}</h3>
          </div>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Search */}
        <div className="relative md:col-span-2">
          <Search className="absolute inset-y-0 left-3 h-4 w-4 text-slate-400 self-center top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by customer name, notes..."
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
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* TABLE LIST */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col">
        {loading ? (
          <div className="py-24 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-100 border-t-indigo-600 mx-auto mb-4"></div>
            <p className="text-slate-500 font-medium">Loading scheduler...</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3.5 px-6">Customer / Lead</th>
                    <th className="py-3.5 px-6">Associated Project</th>
                    <th className="py-3.5 px-6">Sourcing Manager</th>
                    <th className="py-3.5 px-6">Scheduled Date & Time</th>
                    <th className="py-3.5 px-6">Status</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredFollowups.length > 0 ? (
                    filteredFollowups.map((f) => {
                      const lead = leadsMap.get(f.lead_id || '');
                      const canManage = canEditLead(role, user?.id, lead?.owner_id || null, null, null);
                      return (
                        <tr key={f.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="py-4 px-6">
                            <span className="block font-semibold text-slate-900">{lead?.customer_name || 'N/A'}</span>
                            <span className="block text-xs text-slate-400">{lead?.mobile || 'No contact'}</span>
                          </td>
                          <td className="py-4 px-6 text-sm text-slate-600">
                            {projectMap.get(lead?.project_id || '') || 'N/A'}
                          </td>
                          <td className="py-4 px-6 text-sm text-slate-600">
                            {profileMap.get(lead?.owner_id || '') || 'N/A'}
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center space-x-2 text-sm text-slate-700">
                              <Calendar className="h-4 w-4 text-slate-400 flex-shrink-0" />
                              <span>{f.due_at ? new Date(f.due_at).toLocaleString('en-IN') : 'N/A'}</span>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              f.status?.toLowerCase() === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                              f.status?.toLowerCase() === 'cancelled' ? 'bg-rose-50 text-rose-700' :
                              'bg-amber-50 text-amber-700'
                            }`}>
                              {f.status || 'pending'}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end space-x-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              {canManage && f.status === 'pending' && (
                                <>
                                  <button
                                    onClick={() => handleUpdateStatus(f.id, 'completed')}
                                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200 focus:outline-none transition-colors"
                                    title="Mark as completed"
                                  >
                                    <CheckCircle className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingFollowup(f);
                                      const isoStr = f.due_at || new Date().toISOString();
                                      const d = new Date(isoStr);
                                      const tzoffset = d.getTimezoneOffset() * 60000;
                                      const localISOTime = (new Date(d.getTime() - tzoffset)).toISOString().slice(0, 16);
                                      setEditDueAt(localISOTime);
                                      
                                      if (f.reminder_at) {
                                        const rd = new Date(f.reminder_at);
                                        const rtz = rd.getTimezoneOffset() * 60000;
                                        setEditReminderAt((new Date(rd.getTime() - rtz)).toISOString().slice(0, 16));
                                      } else {
                                        setEditReminderAt('');
                                      }
                                      setEditNotes(f.notes || '');
                                      setEditStatus(f.status || 'pending');
                                      setIsEditOpen(true);
                                    }}
                                    className="flex items-center space-x-1 p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-indigo-600 focus:outline-none transition-colors"
                                    title="Edit or Reschedule"
                                  >
                                    <Calendar className="h-3.5 w-3.5" />
                                    <span className="text-xs font-semibold">Edit</span>
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => setSelectedFollowup(f)}
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
                      <td colSpan={6} className="py-20 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center space-y-3">
                          <div className="bg-slate-50 p-4 rounded-full text-slate-300">
                            <PhoneCall className="h-8 w-8" />
                          </div>
                          <p className="text-slate-500 font-semibold text-sm">No Follow-ups Found</p>
                          <p className="text-xs max-w-sm text-slate-400">
                            There are currently no scheduled callback records mapping your filter settings in database.
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
                  <span className="font-semibold text-slate-800">{totalCount}</span> followups
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

      {/* DETAILS VIEW MODAL */}
      {selectedFollowup && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedFollowup(null)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <PhoneCall className="h-5 w-5 text-indigo-400" />
                <span className="font-bold tracking-tight">Follow-up Call Audit</span>
              </div>
              <button onClick={() => setSelectedFollowup(null)} className="p-1 rounded-lg text-slate-400 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {(() => {
                const lead = leadsMap.get(selectedFollowup.lead_id || '');
                return (
                  <>
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-lg font-bold text-slate-900">{lead?.customer_name || 'Unnamed Client'}</h4>
                        <p className="text-xs text-slate-500">Scheduled Audit Callback</p>
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        selectedFollowup.status?.toLowerCase() === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                        selectedFollowup.status?.toLowerCase() === 'cancelled' ? 'bg-rose-50 text-rose-700' :
                        'bg-amber-50 text-amber-700'
                      }`}>
                        {selectedFollowup.status || 'pending'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-5">
                      <div className="flex items-start space-x-2 text-slate-700">
                        <User className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                        <div>
                          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Contact Number</span>
                          <span className="text-sm font-semibold">{lead?.mobile || 'N/A'}</span>
                        </div>
                      </div>

                      <div className="flex items-start space-x-2 text-slate-700">
                        <Clock className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                        <div>
                          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Follow-up Date & Time</span>
                          <span className="text-sm font-semibold">
                            {selectedFollowup.due_at ? new Date(selectedFollowup.due_at).toLocaleString('en-IN') : 'N/A'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-start space-x-2 text-slate-700">
                        <Bookmark className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                        <div>
                          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Project Focus</span>
                          <span className="text-sm font-semibold">
                            {projectMap.get(lead?.project_id || '') || 'N/A'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-start space-x-2 text-slate-700">
                        <FileText className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                        <div>
                          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Reminder Date</span>
                          <span className="text-sm font-semibold text-slate-600">
                            {selectedFollowup.reminder_at ? new Date(selectedFollowup.reminder_at).toLocaleString('en-IN') : 'None'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-start space-x-2 text-slate-700 col-span-2">
                        <User className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                        <div>
                          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Assigned Sourcing Manager</span>
                          <span className="text-sm font-semibold">
                            {profileMap.get(lead?.owner_id || '') || 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-5">
                      <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider mb-2">Follow-up Requirements / Notes</span>
                      <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-sm text-slate-700 leading-relaxed max-h-[150px] overflow-y-auto">
                        {selectedFollowup.notes || 'No description notes available for this schedule callback.'}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-6 py-4 flex justify-between items-center border-t border-slate-100">
              <div className="flex items-center space-x-2">
                {(() => {
                  const lead = leadsMap.get(selectedFollowup.lead_id || '');
                  const canManage = canEditLead(role, user?.id, lead?.owner_id || null, null, null);
                  return canManage && selectedFollowup.status?.toLowerCase() === 'pending' && (
                    <>
                      <button
                        onClick={() => {
                          handleUpdateStatus(selectedFollowup.id, 'completed');
                        }}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
                      >
                        Complete Call
                      </button>
                      <button
                        onClick={() => {
                          handleUpdateStatus(selectedFollowup.id, 'cancelled');
                        }}
                        className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-semibold transition-all"
                      >
                        Cancel Callback
                      </button>
                    </>
                  );
                })()}
              </div>
              <button
                onClick={() => setSelectedFollowup(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE FOLLOW-UP MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsCreateOpen(false)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">Schedule New Follow-up</span>
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
                    <span className="text-sm font-medium leading-tight">{createError}</span>
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
                          {l.customer_name || 'Unnamed Lead'} ({projectMap.get(l.project_id || '') || 'No Project'})
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>No Leads available (Database is empty)</option>
                    )}
                  </select>
                </div>

                {/* Due Date & Time */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Scheduled Date & Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
                  />
                </div>

                {/* Reminder Date & Time */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Reminder Date & Time</label>
                  <input
                    type="datetime-local"
                    value={reminderAt}
                    onChange={(e) => setReminderAt(e.target.value)}
                    className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
                  />
                </div>

                {/* Status select */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Initial Status</label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                  >
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Callback Action Notes</label>
                  <textarea
                    placeholder="Describe follow-up agenda, budget clarification, interest checks..."
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
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
                  {createLoading ? 'Scheduling...' : 'Schedule Follow-up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* EDIT FOLLOW-UP MODAL */}
      {isEditOpen && editingFollowup && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setIsEditOpen(false); setEditingFollowup(null); }} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">Edit / Reschedule Follow-up</span>
              <button type="button" onClick={() => { setIsEditOpen(false); setEditingFollowup(null); }} className="p-1 rounded-lg text-indigo-200 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleEditSubmit}>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {editError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-start space-x-2.5">
                    <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-medium leading-tight">{editError}</span>
                  </div>
                )}

                {/* Lead Display */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Lead / Customer</label>
                  <input
                    type="text"
                    disabled
                    value={leadsMap.get(editingFollowup.lead_id || '')?.customer_name || 'N/A'}
                    className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-100 text-slate-500 text-sm focus:outline-none"
                  />
                </div>

                {/* Due Date & Time */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Scheduled Date & Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={editDueAt}
                    onChange={(e) => setEditDueAt(e.target.value)}
                    className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
                  />
                </div>

                {/* Reminder Date & Time */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Reminder Date & Time</label>
                  <input
                    type="datetime-local"
                    value={editReminderAt}
                    onChange={(e) => setEditReminderAt(e.target.value)}
                    className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
                  />
                </div>

                {/* Status select */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                  >
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Callback Action Notes</label>
                  <textarea
                    placeholder="Describe follow-up agenda, budget clarification, interest checks..."
                    rows={3}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* Form Footer */}
              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setIsEditOpen(false); setEditingFollowup(null); }}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/10 hover:shadow-lg disabled:opacity-50 transition-all focus:outline-none"
                >
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
