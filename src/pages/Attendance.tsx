import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { reportQueryError } from '../services/queryLogger';
import { useAuth } from '../hooks/useAuth';
import {
  ClipboardCheck,
  MapPin,
  LogIn,
  LogOut,
  Download,
  CheckCircle,
  XCircle,
  RefreshCw,
  CalendarPlus,
  Users,
} from 'lucide-react';

interface AttendanceRow {
  id: string;
  employee_id: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  check_in_latitude: number | null;
  check_in_longitude: number | null;
  check_out_latitude: number | null;
  check_out_longitude: number | null;
  status: string | null;
  late_minutes: number | null;
}

interface LeaveRequest {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  purpose: string | null;
  status: string;
  reviewed_at: string | null;
  created_at: string;
}

const leaveStatusColors: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-rose-50 text-rose-700',
};

export const Attendance: React.FC = () => {
  const { user } = useAuth();
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
  const [currentEmployeeName, setCurrentEmployeeName] = useState<string>('');

  const [todaysAttendance, setTodaysAttendance] = useState<AttendanceRow | null>(null);
  const [myHistory, setMyHistory] = useState<AttendanceRow[]>([]);
  const [teamAttendance, setTeamAttendance] = useState<(AttendanceRow & { employee_name?: string })[]>([]);
  const [employeesMap, setEmployeesMap] = useState<Map<string, string>>(new Map());

  const [myLeaveRequests, setMyLeaveRequests] = useState<LeaveRequest[]>([]);
  const [allLeaveRequests, setAllLeaveRequests] = useState<(LeaveRequest & { employee_name?: string })[]>([]);

  const [tab, setTab] = useState<'my' | 'team' | 'leave'>('my');
  const [loading, setLoading] = useState(true);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveType, setLeaveType] = useState('casual');
  const [leavePurpose, setLeavePurpose] = useState('');
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    let employeeId: string | null = null;
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('id, first_name, last_name')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) {
        reportQueryError('Attendance: current employee', error);
      } else if (data) {
        employeeId = data.id;
        setCurrentEmployeeId(data.id);
        setCurrentEmployeeName([data.first_name, data.last_name].filter(Boolean).join(' '));
      }
    } catch (err) {
      reportQueryError('Attendance: current employee', err);
    }

    try {
      const { data, error } = await supabase.from('employees').select('id, first_name, last_name');
      if (error) reportQueryError('Attendance: employees', error);
      else setEmployeesMap(new Map((data || []).map(e => [e.id, [e.first_name, e.last_name].filter(Boolean).join(' ')])));
    } catch (err) {
      reportQueryError('Attendance: employees', err);
    }

    if (employeeId) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const { data, error } = await supabase
          .from('attendance')
          .select('*')
          .eq('employee_id', employeeId)
          .eq('attendance_date', today)
          .maybeSingle();
        if (error) reportQueryError('Attendance: today', error);
        else setTodaysAttendance(data);
      } catch (err) {
        reportQueryError('Attendance: today', err);
      }

      try {
        const { data, error } = await supabase
          .from('attendance')
          .select('*')
          .eq('employee_id', employeeId)
          .order('attendance_date', { ascending: false })
          .limit(30);
        if (error) reportQueryError('Attendance: my history', error);
        else setMyHistory(data || []);
      } catch (err) {
        reportQueryError('Attendance: my history', err);
      }

      try {
        const { data, error } = await supabase
          .from('leave_requests')
          .select('*')
          .eq('employee_id', employeeId)
          .order('created_at', { ascending: false });
        if (error) reportQueryError('Attendance: my leave requests', error);
        else setMyLeaveRequests(data || []);
      } catch (err) {
        reportQueryError('Attendance: my leave requests', err);
      }
    }

    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .order('attendance_date', { ascending: false })
        .limit(200);
      if (error) reportQueryError('Attendance: team', error);
      else setTeamAttendance(data || []);
    } catch (err) {
      reportQueryError('Attendance: team', err);
    }

    try {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('*')
        .order('status', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) reportQueryError('Attendance: all leave requests', error);
      else setAllLeaveRequests(data || []);
    } catch (err) {
      reportQueryError('Attendance: all leave requests', err);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const getLocation = (): Promise<{ latitude: number; longitude: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        (err) => reject(new Error(err.message)),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  const handleCheckIn = async () => {
    if (!currentEmployeeId) return;
    setGettingLocation(true);
    try {
      const { latitude, longitude } = await getLocation();
      const { error } = await supabase.from('attendance').insert([{
        employee_id: currentEmployeeId,
        attendance_date: new Date().toISOString().slice(0, 10),
        check_in: new Date().toISOString(),
        check_in_latitude: latitude,
        check_in_longitude: longitude,
        status: 'present',
      }]);
      if (error) throw error;
      setNotification({ type: 'success', message: 'Checked in.' });
      await fetchData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Check-in failed.' });
    } finally {
      setGettingLocation(false);
    }
  };

  const handleCheckOut = async () => {
    if (!todaysAttendance) return;
    setGettingLocation(true);
    try {
      const { latitude, longitude } = await getLocation();
      const { error } = await supabase
        .from('attendance')
        .update({ check_out: new Date().toISOString(), check_out_latitude: latitude, check_out_longitude: longitude })
        .eq('id', todaysAttendance.id);
      if (error) throw error;
      setNotification({ type: 'success', message: 'Checked out.' });
      await fetchData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Check-out failed.' });
    } finally {
      setGettingLocation(false);
    }
  };

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveStart || !leaveEnd) {
      setLeaveError('Start and end dates are required.');
      return;
    }
    if (!currentEmployeeId) {
      // leave_requests.employee_id is NOT NULL — without this guard the
      // insert below would fail with a raw Postgres constraint error
      // instead of the clear message here.
      setLeaveError('No employee record is linked to your account, so a leave request cannot be submitted. Ask an admin to link one on the Employees page.');
      return;
    }
    setLeaveError(null);
    setLeaveSubmitting(true);
    try {
      const { error } = await supabase.from('leave_requests').insert([{
        employee_id: currentEmployeeId,
        start_date: leaveStart,
        end_date: leaveEnd,
        leave_type: leaveType,
        purpose: leavePurpose.trim() || null,
        status: 'pending',
      }]);
      if (error) throw error;
      setNotification({ type: 'success', message: 'Leave request submitted.' });
      setIsLeaveDialogOpen(false);
      setLeaveStart(''); setLeaveEnd(''); setLeaveType('casual'); setLeavePurpose('');
      await fetchData();
    } catch (err: any) {
      setLeaveError(err.message || 'Failed to submit leave request.');
    } finally {
      setLeaveSubmitting(false);
    }
  };

  const handleWithdrawLeave = async (id: string) => {
    const { error } = await supabase.from('leave_requests').delete().eq('id', id);
    if (error) reportQueryError('Attendance: withdraw leave', error);
    else await fetchData();
  };

  const handleReviewLeave = async (id: string, status: 'approved' | 'rejected') => {
    const { error } = await supabase
      .from('leave_requests')
      .update({ status, reviewed_by: currentEmployeeId, reviewed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) reportQueryError('Attendance: review leave', error);
    else await fetchData();
  };

  const handleExport = (rows: AttendanceRow[], filename: string) => {
    const csv = [
      ['Employee', 'Date', 'Check In', 'Check Out', 'Status', 'Late Minutes'].join(','),
      ...rows.map(r => {
        const checkIn = r.check_in ? new Date(r.check_in) : null;
        const checkOut = r.check_out ? new Date(r.check_out) : null;
        return [
          employeesMap.get(r.employee_id) || r.employee_id,
          r.attendance_date,
          checkIn ? checkIn.toLocaleTimeString('en-IN') : '',
          checkOut ? checkOut.toLocaleTimeString('en-IN') : '',
          r.status || '',
          r.late_minutes ?? '',
        ].join(',');
      }),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

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
            <ClipboardCheck className="h-6 w-6 text-indigo-600" /> Attendance
          </h2>
          <p className="text-slate-500 text-xs mt-1">GPS check-in/out and leave management.{currentEmployeeName ? ` — ${currentEmployeeName}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {!currentEmployeeId ? (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-xs">
              Check-in unavailable — see notice below
            </span>
          ) : !todaysAttendance ? (
            <button
              onClick={handleCheckIn}
              disabled={gettingLocation}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-sm disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" /> {gettingLocation ? 'Getting location...' : 'Check In'}
            </button>
          ) : !todaysAttendance.check_out ? (
            <button
              onClick={handleCheckOut}
              disabled={gettingLocation}
              className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold shadow-sm disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" /> {gettingLocation ? 'Getting location...' : 'Check Out'}
            </button>
          ) : (
            <span className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-500 rounded-xl text-sm font-semibold">
              <CheckCircle className="h-4 w-4" /> Day complete
            </span>
          )}
          <button
            onClick={() => setIsLeaveDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm"
          >
            <CalendarPlus className="h-4 w-4" /> Request Leave
          </button>
        </div>
      </div>

      {!currentEmployeeId && !loading && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm flex items-start gap-3">
          <MapPin className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Check-in/out isn't available for your account yet.</p>
            <p className="mt-0.5">
              No employee record is linked to your login. Ask an admin to create one for you on the{' '}
              <a href="/employees" className="underline font-semibold hover:text-amber-900">Employees</a> page and
              link it to this account. Leave requests and the Team/Approval views below still work in the meantime.
            </p>
          </div>
        </div>
      )}

      <div className="flex rounded-xl border border-slate-200 overflow-hidden w-fit">
        {([['my', 'My Attendance'], ['team', 'Team'], ['leave', 'Leave Requests']] as const).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`px-4 py-2 text-xs font-semibold transition-all ${tab === value ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'my' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">My History (last 30 records)</h3>
            <button
              onClick={() => handleExport(myHistory, 'my_attendance.csv')}
              className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-6">Date</th>
                  <th className="py-3 px-6">Check In</th>
                  <th className="py-3 px-6">Check Out</th>
                  <th className="py-3 px-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myHistory.length > 0 ? myHistory.map(r => (
                  <tr key={r.id}>
                    <td className="py-3 px-6 font-semibold text-slate-800">{new Date(r.attendance_date).toLocaleDateString('en-IN')}</td>
                    <td className="py-3 px-6 text-slate-600">{r.check_in ? new Date(r.check_in).toLocaleTimeString('en-IN') : '—'}</td>
                    <td className="py-3 px-6 text-slate-600">{r.check_out ? new Date(r.check_out).toLocaleTimeString('en-IN') : '—'}</td>
                    <td className="py-3 px-6">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xxs font-semibold bg-indigo-50 text-indigo-700 capitalize">{r.status}</span>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="py-10 text-center text-slate-400 italic">No attendance records yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'team' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Users className="h-4 w-4 text-indigo-600" /> Team Attendance</h3>
            <button
              onClick={() => handleExport(teamAttendance, 'team_attendance.csv')}
              className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-6">Employee</th>
                  <th className="py-3 px-6">Date</th>
                  <th className="py-3 px-6">Check In</th>
                  <th className="py-3 px-6">Check Out</th>
                  <th className="py-3 px-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teamAttendance.length > 0 ? teamAttendance.map(r => (
                  <tr key={r.id}>
                    <td className="py-3 px-6 font-semibold text-slate-800">{employeesMap.get(r.employee_id) || '—'}</td>
                    <td className="py-3 px-6 text-slate-600">{new Date(r.attendance_date).toLocaleDateString('en-IN')}</td>
                    <td className="py-3 px-6 text-slate-600">{r.check_in ? new Date(r.check_in).toLocaleTimeString('en-IN') : '—'}</td>
                    <td className="py-3 px-6 text-slate-600">{r.check_out ? new Date(r.check_out).toLocaleTimeString('en-IN') : '—'}</td>
                    <td className="py-3 px-6">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xxs font-semibold bg-indigo-50 text-indigo-700 capitalize">{r.status}</span>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="py-10 text-center text-slate-400 italic">No team attendance records.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'leave' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-800">My Leave Requests</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3 px-6">Dates</th>
                    <th className="py-3 px-6">Type</th>
                    <th className="py-3 px-6">Purpose</th>
                    <th className="py-3 px-6">Status</th>
                    <th className="py-3 px-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {myLeaveRequests.length > 0 ? myLeaveRequests.map(lr => (
                    <tr key={lr.id}>
                      <td className="py-3 px-6 text-slate-800 font-semibold">
                        {new Date(lr.start_date).toLocaleDateString('en-IN')} – {new Date(lr.end_date).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-3 px-6 text-slate-600 capitalize">{lr.leave_type}</td>
                      <td className="py-3 px-6 text-slate-600 text-xs">{lr.purpose || '—'}</td>
                      <td className="py-3 px-6">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xxs font-semibold capitalize ${leaveStatusColors[lr.status]}`}>{lr.status}</span>
                      </td>
                      <td className="py-3 px-6">
                        {lr.status === 'pending' && (
                          <button onClick={() => handleWithdrawLeave(lr.id)} className="text-xxs text-rose-600 font-semibold hover:underline">Withdraw</button>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} className="py-10 text-center text-slate-400 italic">No leave requests yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-800">All Leave Requests (Approval)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3 px-6">Employee</th>
                    <th className="py-3 px-6">Dates</th>
                    <th className="py-3 px-6">Type</th>
                    <th className="py-3 px-6">Status</th>
                    <th className="py-3 px-6">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allLeaveRequests.length > 0 ? allLeaveRequests.map(lr => (
                    <tr key={lr.id}>
                      <td className="py-3 px-6 font-semibold text-slate-800">{employeesMap.get(lr.employee_id) || '—'}</td>
                      <td className="py-3 px-6 text-slate-600">
                        {new Date(lr.start_date).toLocaleDateString('en-IN')} – {new Date(lr.end_date).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-3 px-6 text-slate-600 capitalize">{lr.leave_type}</td>
                      <td className="py-3 px-6">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xxs font-semibold capitalize ${leaveStatusColors[lr.status]}`}>{lr.status}</span>
                      </td>
                      <td className="py-3 px-6">
                        {lr.status === 'pending' && (
                          <div className="flex gap-2">
                            <button onClick={() => handleReviewLeave(lr.id, 'approved')} className="text-xxs text-emerald-600 font-semibold hover:underline">Approve</button>
                            <button onClick={() => handleReviewLeave(lr.id, 'rejected')} className="text-xxs text-rose-600 font-semibold hover:underline">Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} className="py-10 text-center text-slate-400 italic">No leave requests to review.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {isLeaveDialogOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !leaveSubmitting && setIsLeaveDialogOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">Request Leave</span>
              <button onClick={() => !leaveSubmitting && setIsLeaveDialogOpen(false)} className="p-1 rounded-lg text-indigo-200 hover:text-white">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitLeave}>
              <div className="p-6 space-y-4">
                {leaveError && <div className="bg-rose-50 border border-rose-200 text-rose-800 px-3 py-2 rounded-lg text-xs">{leaveError}</div>}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Start Date *</label>
                    <input type="date" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">End Date *</label>
                    <input type="date" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Leave Type</label>
                  <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="casual">Casual</option>
                    <option value="sick">Sick</option>
                    <option value="earned">Earned</option>
                    <option value="unpaid">Unpaid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Purpose</label>
                  <textarea value={leavePurpose} onChange={(e) => setLeavePurpose(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-2 border-t border-slate-100">
                <button type="button" onClick={() => setIsLeaveDialogOpen(false)} disabled={leaveSubmitting} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-100 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={leaveSubmitting} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm disabled:opacity-50">
                  {leaveSubmitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
