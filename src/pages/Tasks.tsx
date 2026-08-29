import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { reportQueryError } from '../services/queryLogger';
import { useAuth } from '../hooks/useAuth';
import { canEditTask, canAssignTasksToOthers } from '../utils/permissions';
import {
  CheckSquare,
  Plus,
  X,
  RefreshCw,
  CheckCircle,
  XCircle,
  Search,
  Trash2
} from 'lucide-react';

interface Task {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  assigned_by: string | null;
  due_date: string | null;
  completed_at: string | null;
  priority: string | null;
  status: string | null;
  created_at: string;
}

interface UserOption {
  id: string;
  full_name: string | null;
}

const priorityOptions = ['low', 'normal', 'high', 'urgent'];
const statusOptions = ['pending', 'in_progress', 'completed', 'cancelled', 'overdue'];

const statusColors: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-indigo-50 text-indigo-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-rose-50 text-rose-700',
  overdue: 'bg-amber-50 text-amber-700',
};

const priorityColors: Record<string, string> = {
  low: 'bg-slate-100 text-slate-500',
  normal: 'bg-sky-50 text-sky-700',
  high: 'bg-amber-50 text-amber-700',
  urgent: 'bg-rose-50 text-rose-700',
};

export const Tasks: React.FC = () => {
  const { user, role } = useAuth();
  const isSuperAdmin = role === 'super_admin';
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersMap, setUsersMap] = useState<Map<string, string>>(new Map());

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [scopeFilter, setScopeFilter] = useState<'all' | 'assigned_to_me' | 'created_by_me'>('assigned_to_me');
  const [searchTerm, setSearchTerm] = useState('');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('normal');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this task?')) return;
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', taskId);
      if (error) throw error;
      setNotification({ type: 'success', message: 'Task deleted permanently.' });
      fetchData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to delete task.' });
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) reportQueryError('Tasks: list', error);
      else setTasks(data || []);
    } catch (err) {
      reportQueryError('Tasks: list', err);
    }

    try {
      const { data, error } = await supabase.from('user_profiles').select('id, full_name');
      if (error) {
        reportQueryError('Tasks: users', error);
      } else {
        setUsers(data || []);
        setUsersMap(new Map((data || []).map(u => [u.id, u.full_name || 'Unnamed'])));
      }
    } catch (err) {
      reportQueryError('Tasks: users', err);
    }

    setLoading(false);
    setSyncing(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Live status sync — if someone else changes a task's status (e.g. the
  // assignee marks it complete), the creator's view updates without a
  // manual refresh.
  useEffect(() => {
    const channel = supabase
      .channel('tasks-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setTasks(prev => [payload.new as Task, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setTasks(prev => prev.map(t => t.id === (payload.new as Task).id ? payload.new as Task : t));
        } else if (payload.eventType === 'DELETE') {
          setTasks(prev => prev.filter(t => t.id !== (payload.old as Task).id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleSync = async () => {
    setSyncing(true);
    await fetchData();
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setAssignedTo('');
    setDueDate('');
    setPriority('normal');
    setCreateError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setCreateError('Title is required.');
      return;
    }
    setCreateError(null);
    setCreateLoading(true);

    try {
      const { data: newTask, error } = await supabase
        .from('tasks')
        .insert([{
          title: title.trim(),
          description: description.trim() || null,
          assigned_to: assignedTo || null,
          assigned_by: user?.id || null,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          priority,
          status: 'pending',
        }])
        .select('id')
        .single();

      if (error) throw error;

      // Notify the assignee — this is what the sidebar bell picks up live.
      if (assignedTo) {
        const { error: notifErr } = await supabase.from('notifications').insert([{
          user_id: assignedTo,
          notification_type: 'task_assigned',
          title: 'New task assigned to you',
          message: title.trim(),
          related_entity: 'tasks',
          related_id: newTask.id,
        }]);
        if (notifErr) reportQueryError('Tasks: assignment notification', notifErr);
      }

      setNotification({ type: 'success', message: 'Task created.' });
      setIsCreateOpen(false);
      resetForm();
      await fetchData();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create task.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleStatusChange = async (task: Task, newStatus: string) => {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    const { error } = await supabase
      .from('tasks')
      .update({ status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : null })
      .eq('id', task.id);
    if (error) {
      reportQueryError('Tasks: status update', error);
      setNotification({ type: 'error', message: 'Failed to update status.' });
    } else {
      // Let the creator know their task's status moved.
      if (task.assigned_by && task.assigned_by !== user?.id) {
        await supabase.from('notifications').insert([{
          user_id: task.assigned_by,
          notification_type: 'task_status_changed',
          title: 'Task status updated',
          message: `"${task.title}" is now ${newStatus.replace(/_/g, ' ')}`,
          related_entity: 'tasks',
          related_id: task.id,
        }]);
      }
    }
  };

  const filteredTasks = tasks.filter(t => {
    if (scopeFilter === 'assigned_to_me' && t.assigned_to !== user?.id) return false;
    if (scopeFilter === 'created_by_me' && t.assigned_by !== user?.id) return false;
    if (searchTerm && !t.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

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
            <CheckSquare className="h-6 w-6 text-indigo-600" /> Tasks
          </h2>
          <p className="text-slate-500 text-xs mt-1">Assign work, track status, and stay notified.</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="p-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => { resetForm(); setIsCreateOpen(true); }}
            className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-slate-200 overflow-hidden">
          {([
            ['assigned_to_me', 'Assigned to Me'],
            ['created_by_me', 'Created by Me'],
            ['all', 'All Tasks'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setScopeFilter(value)}
              className={`px-3.5 py-1.5 text-xs font-semibold transition-all ${scopeFilter === value ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            placeholder="Search tasks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-6">Title</th>
                <th className="py-3 px-6">Assigned To</th>
                <th className="py-3 px-6">Priority</th>
                <th className="py-3 px-6">Due</th>
                <th className="py-3 px-6">Status</th>
              <th className="py-3 px-6 text-right">Actions</th>
</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTasks.length > 0 ? (
                filteredTasks.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-6">
                      <div className="font-semibold text-slate-900">{t.title}</div>
                      {t.description && <div className="text-xs text-slate-500 mt-0.5 max-w-sm truncate">{t.description}</div>}
                    </td>
                    <td className="py-3 px-6 text-slate-600">{usersMap.get(t.assigned_to || '') || 'Unassigned'}</td>
                    <td className="py-3 px-6">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xxs font-semibold capitalize ${priorityColors[t.priority || 'normal']}`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-slate-500 text-xs">
                      {t.due_date ? new Date(t.due_date).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td className="py-3 px-6">
                      <select
                        value={t.status || 'pending'}
                        onChange={(e) => handleStatusChange(t, e.target.value)}
                        disabled={!canEditTask(role, user?.id || null, t.assigned_to, t.assigned_by)}
                        className={`text-xxs font-semibold rounded-full px-2 py-1 border-0 capitalize cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${statusColors[t.status || 'pending']}`}
                      >
                        {statusOptions.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                      </select>
                    </td>
                  <td className="py-3 px-6 text-right">
                      {isSuperAdmin && (
                        <button
                          onClick={() => handleDeleteTask(t.id)}
                          className="p-1.5 border border-slate-200 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                          title="Delete Task Permanently"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
</tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400 italic">No tasks found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !createLoading && setIsCreateOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">New Task</span>
              <button onClick={() => !createLoading && setIsCreateOpen(false)} className="p-1 rounded-lg text-indigo-200 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="p-6 space-y-4">
                {createError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-sm">{createError}</div>
                )}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Title *</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Assign To</label>
                    <select
                      value={assignedTo}
                      onChange={(e) => setAssignedTo(e.target.value)}
                      disabled={!canAssignTasksToOthers(role)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
                    >
                      {canAssignTasksToOthers(role) ? (
                        <>
                          <option value="">Unassigned</option>
                          {users.map(u => <option key={u.id} value={u.id}>{u.full_name || 'Unnamed'}</option>)}
                        </>
                      ) : (
                        <option value={user?.id || ''}>{user?.email || 'Me'}</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Priority</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    >
                      {priorityOptions.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
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
                  {createLoading ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
