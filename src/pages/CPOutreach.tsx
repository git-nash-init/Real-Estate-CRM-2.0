import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { reportQueryError } from '../services/queryLogger';
import { useAuth } from '../hooks/useAuth';
import { isSuperAdmin } from '../utils/permissions';
import { useHighlightParam } from '../hooks/useHighlightParam';
import {
  Handshake,
  Plus,
  X,
  Search,
  MapPin,
  RefreshCw,
  CheckCircle,
  XCircle,
  Eye,
} from 'lucide-react';

interface OutreachEntry {
  id: string;
  meet_date: string;
  sourcing_manager_id: string | null;
  sourcing_manager_other: string | null;
  cp_firm_name: string;
  cp_name: string;
  cp_contact_number: string;
  location: string;
  cp_type: string;
  meeting_done: string;
  leads_source_active_in: string[];
  meeting_remarks: string | null;
  live_location: string | null;
  logged_by: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface SourcingManagerOption {
  id: string;
  name: string;
}

interface ChannelPartnerOption {
  id: string;
  name: string | null;
  company_name: string | null;
  mobile: string | null;
}

const cpTypes = [
  { value: 'ICP', label: 'ICP — Ideal Partner Profile' },
  { value: 'RCP', label: 'RCP — Recommended Partner Profile' },
];
const meetingDoneOptions = ['Fresh', 'Re-visit'];
const activeInOptions = ['Digital', 'Tele-calling', 'SMS', 'Reference', 'Cross Pitch'];

const emptyForm = {
  sourcingManagerId: '',
  sourcingManagerOther: '',
  cpFirmId: '',
  cpFirmName: '',
  cpName: '',
  cpContactNumber: '',
  location: '',
  cpType: '',
  meetingDone: '',
  leadsSourceActiveIn: [] as string[],
  meetingRemarks: '',
  liveLocation: '',
};

// Parses a "lat,lng" string stored in live_location into a Google Maps link.
const LiveLocationLink: React.FC<{ value: string | null }> = ({ value }) => {
  if (!value) return <span className="text-slate-400 text-xs">—</span>;
  const parts = value.split(',');
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lng)) return <span className="text-slate-400 text-xs text-[11px]">{value}</span>;
  return (
    <a
      href={`https://www.google.com/maps?q=${lat},${lng}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
    >
      <MapPin className="h-3.5 w-3.5" /> View on Map
    </a>
  );
};

export const CPOutreach: React.FC = () => {
  const { user, role, assignedProjects } = useAuth();
  const [entries, setEntries] = useState<OutreachEntry[]>([]);

  // A `cp_outreach_approved`/`cp_outreach_rejected` notification lands here
  // with ?highlight=<entry id>. No detail modal exists on this page --
  // ring-highlight the row only.
  const { registerRow, rowClass, tryFocusRow } = useHighlightParam();
  useEffect(() => { tryFocusRow(); }, [entries, tryFocusRow]);
  const [sourcingManagers, setSourcingManagers] = useState<SourcingManagerOption[]>([]);
  const [channelPartners, setChannelPartners] = useState<ChannelPartnerOption[]>([]);
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<OutreachEntry | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('cp_outreach')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) reportQueryError('CP Outreach: entries', error);
      else setEntries(data || []);
    } catch (err) {
      reportQueryError('CP Outreach: entries', err);
    }

    try {
      const [roleRes, assignRes, cpProjRes] = await Promise.all([
        supabase.from('roles').select('id').in('name', ['sourcing_manager', 'sourcing_manager_tl']),
        supabase.from('user_project_assignments').select('user_id, project_id').eq('is_active', true),
        supabase.from('channel_partner_projects').select('channel_partner_id, project_id'),
      ]);

      const userProjectMap = new Map<string, Set<string>>();
      (assignRes.data || []).forEach(row => {
        if (!userProjectMap.has(row.user_id)) userProjectMap.set(row.user_id, new Set());
        userProjectMap.get(row.user_id)!.add(row.project_id);
      });

      const cpProjectMap = new Map<string, Set<string>>();
      (cpProjRes.data || []).forEach(row => {
        if (!cpProjectMap.has(row.channel_partner_id)) cpProjectMap.set(row.channel_partner_id, new Set());
        cpProjectMap.get(row.channel_partner_id)!.add(row.project_id);
      });

      const roleIds = (roleRes.data || []).map(r => r.id);
      if (roleIds.length > 0) {
        const { data: userRoles, error: urErr } = await supabase
          .from('user_roles')
          .select('user_id')
          .in('role_id', roleIds);
        if (urErr) {
          reportQueryError('CP Outreach: sourcing manager user_roles', urErr);
        } else {
          let userIds = (userRoles || []).map(r => r.user_id);
          if (!isSuperAdmin(role) && assignedProjects && assignedProjects.length > 0) {
            userIds = userIds.filter(uid => {
              const pSet = userProjectMap.get(uid);
              return pSet && assignedProjects.some(pid => pSet.has(pid));
            });
          }
          if (userIds.length > 0) {
            const { data: emps, error: empErr } = await supabase
              .from('employees')
              .select('id, first_name, last_name')
              .in('user_id', userIds);
            if (empErr) {
              reportQueryError('CP Outreach: sourcing manager employees', empErr);
            } else {
              setSourcingManagers((emps || []).map(e => ({
                id: e.id,
                name: [e.first_name, e.last_name].filter(Boolean).join(' ') || 'Unnamed',
              })));
            }
          } else {
            setSourcingManagers([]);
          }
        }
      }

      // Only channel partners who've actually been onboarded (i.e. have a
      // login -- user_id set) are selectable here. Client's explicit
      // request: outreach can no longer be logged against a partner who
      // hasn't been onboarded yet -- onboard them first, then log outreach.
      const { data: cpData, error: cpErr } = await supabase
        .from('channel_partners')
        .select('id, name, company_name, mobile')
        .not('user_id', 'is', null);
      if (cpErr) reportQueryError('CP Outreach: channel partners', cpErr);
      else {
        let partners = cpData || [];
        if (!isSuperAdmin(role) && assignedProjects && assignedProjects.length > 0) {
          partners = partners.filter(cp => {
            const pSet = cpProjectMap.get(cp.id);
            return pSet && assignedProjects.some(pid => pSet.has(pid));
          });
        }
        setChannelPartners(partners);
      }
    } catch (err) {
      reportQueryError('CP Outreach: lookups', err);
    }

    if (user) {
      try {
        const { data, error } = await supabase
          .from('employees')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) reportQueryError('CP Outreach: current employee', error);
        else setCurrentEmployeeId(data?.id || null);
      } catch (err) {
        reportQueryError('CP Outreach: current employee', err);
      }
    }

    setLoading(false);
    setSyncing(false);
  }, [user, role, assignedProjects]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
    setForm(emptyForm);
    setFormError(null);
  };

  // Selecting an onboarded partner auto-fills CP Name and Contact Number.
  // A CP not yet onboarded can't be picked at all -- the datalist/free-text
  // path this used to have (letting a brand-new prospect be typed in
  // directly) was removed per the client's explicit request: outreach can
  // only be logged against a partner who's already been onboarded.
  const handleFirmNameChange = (cpId: string) => {
    const match = channelPartners.find(cp => cp.id === cpId);
    setForm(prev => ({
      ...prev,
      cpFirmId: cpId,
      cpFirmName: match ? (match.company_name || match.name || '') : '',
      cpName: match ? (match.name || prev.cpName) : prev.cpName,
      cpContactNumber: match ? (match.mobile || prev.cpContactNumber) : prev.cpContactNumber,
    }));
  };

  const toggleActiveIn = (option: string) => {
    setForm(prev => ({
      ...prev,
      leadsSourceActiveIn: prev.leadsSourceActiveIn.includes(option)
        ? prev.leadsSourceActiveIn.filter(o => o !== option)
        : [...prev.leadsSourceActiveIn, option],
    }));
  };

  // Captures the logger's actual GPS position at submission time — confirms
  // they were really on-site, unlike the free-text Location field above.
  const handleCaptureLocation = () => {
    if (!navigator.geolocation) {
      setFormError('Geolocation is not supported by this browser.');
      return;
    }
    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setForm(prev => ({ ...prev, liveLocation: `${latitude},${longitude}` }));
        setIsGettingLocation(false);
      },
      (error) => {
        setFormError(`Unable to retrieve your location: ${error.message}`);
        setIsGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sourcingManagerId && !form.sourcingManagerOther.trim() ||
        !form.cpFirmId || !form.cpName.trim() || !form.cpContactNumber.trim() ||
        !form.location.trim() || !form.cpType || !form.meetingDone || form.leadsSourceActiveIn.length === 0) {
      setFormError('Please fill all required fields.');
      return;
    }
    if (!form.liveLocation) {
      setFormError('Please capture your current location before submitting.');
      return;
    }

    setFormError(null);
    setSubmitting(true);

    try {
      const { error } = await supabase.from('cp_outreach').insert([{
        meet_date: new Date().toISOString().slice(0, 10),
        sourcing_manager_id: form.sourcingManagerId || null,
        sourcing_manager_other: form.sourcingManagerId ? null : form.sourcingManagerOther.trim(),
        cp_firm_name: form.cpFirmName.trim(),
        cp_name: form.cpName.trim(),
        cp_contact_number: form.cpContactNumber.trim(),
        location: form.location.trim(),
        cp_type: form.cpType,
        meeting_done: form.meetingDone,
        leads_source_active_in: form.leadsSourceActiveIn,
        meeting_remarks: form.meetingRemarks.trim() || null,
        live_location: form.liveLocation,
        logged_by: currentEmployeeId,
        channel_partner_id: form.cpFirmId,
      }]);

      if (error) throw error;

      setNotification({ type: 'success', message: 'Outreach visit logged successfully!' });
      setIsDialogOpen(false);
      resetForm();
      await fetchData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to log outreach visit.');
    } finally {
      setSubmitting(false);
    }
  };

  const allowedSmIds = new Set(sourcingManagers.map(sm => sm.id));
  const allowedCpFirmNames = new Set(channelPartners.map(cp => (cp.company_name || cp.name || '').toLowerCase()));
  const filteredEntries = entries.filter(en => {
    if (!isSuperAdmin(role) && assignedProjects && assignedProjects.length > 0) {
      const smMatch = en.sourcing_manager_id && allowedSmIds.has(en.sourcing_manager_id);
      const cpMatch = en.cp_firm_name && allowedCpFirmNames.has(en.cp_firm_name.toLowerCase());
      const ownMatch = currentEmployeeId && en.sourcing_manager_id === currentEmployeeId;
      if (!smMatch && !cpMatch && !ownMatch) return false;
    }
    return (
      en.cp_firm_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      en.cp_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
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
            <Handshake className="h-6 w-6 text-indigo-600" /> CP Outreach
          </h2>
          <p className="text-slate-500 text-xs mt-1">Log field visits to prospective and existing channel partners.</p>
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
            onClick={() => { resetForm(); setIsDialogOpen(true); }}
            className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>Log Outreach</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              placeholder="Search by CP firm or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-2 w-full rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-6">Created At</th>
                <th className="py-3 px-6">Sourcing Manager</th>
                <th className="py-3 px-6">CP Firm</th>
                <th className="py-3 px-6">CP Name</th>
                <th className="py-3 px-6">Contact</th>
                <th className="py-3 px-6">Type</th>
                <th className="py-3 px-6">Visit</th>
                <th className="py-3 px-6">Active In</th>
                <th className="py-3 px-6">Map</th>
                <th className="py-3 px-6">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEntries.length > 0 ? (
                filteredEntries.map(en => (
                  <tr key={en.id} ref={registerRow(en.id)} className={`hover:bg-slate-50/50 ${rowClass(en.id)}`}>
                      <td className="py-3 px-6 text-slate-800 font-semibold">
                        <span className="block">{new Date(en.created_at).toLocaleDateString('en-IN')}</span>
                        <span className="block text-xs text-slate-400">{new Date(en.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                    <td className="py-3 px-6 text-slate-600">
                      {sourcingManagers.find(sm => sm.id === en.sourcing_manager_id)?.name || en.sourcing_manager_other || '—'}
                    </td>
                    <td className="py-3 px-6 text-slate-900 font-semibold">{en.cp_firm_name}</td>
                    <td className="py-3 px-6 text-slate-600">{en.cp_name}</td>
                    <td className="py-3 px-6 text-slate-600">{en.cp_contact_number}</td>
                    <td className="py-3 px-6">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xxs font-semibold bg-indigo-50 text-indigo-700">{en.cp_type}</span>
                    </td>
                    <td className="py-3 px-6">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xxs font-semibold ${en.meeting_done === 'Fresh' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {en.meeting_done}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-slate-500 text-xs">{en.leads_source_active_in.join(', ')}</td>
                    <td className="py-3 px-6"><LiveLocationLink value={en.live_location} /></td>
                    <td className="py-3 px-6">
                      <button
                        onClick={() => setSelectedEntry(en)}
                        title="View full details"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-400 italic">No outreach visits logged yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isDialogOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !submitting && setIsDialogOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">Log CP Outreach Visit</span>
              <button onClick={() => !submitting && setIsDialogOpen(false)} className="p-1 rounded-lg text-indigo-200 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {formError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-sm">{formError}</div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">SM Name *</label>
                    <select
                      value={form.sourcingManagerId}
                      onChange={(e) => setForm(prev => ({ ...prev, sourcingManagerId: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    >
                      <option value="">Select sourcing manager</option>
                      {sourcingManagers.map(sm => <option key={sm.id} value={sm.id}>{sm.name}</option>)}
                      <option value="">Other</option>
                    </select>
                  </div>
                </div>

                {!form.sourcingManagerId && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Specify SM Name *</label>
                    <input
                      value={form.sourcingManagerOther}
                      onChange={(e) => setForm(prev => ({ ...prev, sourcingManagerOther: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">CP Firm Name *</label>
                    <select
                      value={form.cpFirmId}
                      onChange={(e) => handleFirmNameChange(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    >
                      <option value="">Select onboarded Channel Partner...</option>
                      {channelPartners.map(cp => (
                        <option key={cp.id} value={cp.id}>{cp.company_name || cp.name || 'Unnamed'}</option>
                      ))}
                    </select>
                    <p className="text-xxs text-slate-400 mt-1">Only Channel Partners who've been onboarded (have a login) appear here.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">CP Name *</label>
                    <input
                      value={form.cpName}
                      onChange={(e) => setForm(prev => ({ ...prev, cpName: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">CP Contact Number *</label>
                    <input
                      value={form.cpContactNumber}
                      onChange={(e) => setForm(prev => ({ ...prev, cpContactNumber: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Location *</label>
                    <input
                      value={form.location}
                      onChange={(e) => setForm(prev => ({ ...prev, location: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">CP Type *</label>
                    <select
                      value={form.cpType}
                      onChange={(e) => setForm(prev => ({ ...prev, cpType: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    >
                      <option value="">Select CP type</option>
                      {cpTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Meeting Done *</label>
                    <select
                      value={form.meetingDone}
                      onChange={(e) => setForm(prev => ({ ...prev, meetingDone: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    >
                      <option value="">Select meeting type</option>
                      {meetingDoneOptions.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Leads Source Active In * <span className="text-slate-400 normal-case font-normal">(select all that apply)</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {activeInOptions.map(opt => (
                      <button
                        type="button"
                        key={opt}
                        onClick={() => toggleActiveIn(opt)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                          form.leadsSourceActiveIn.includes(opt)
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Meeting Remarks</label>
                  <textarea
                    value={form.meetingRemarks}
                    onChange={(e) => setForm(prev => ({ ...prev, meetingRemarks: e.target.value }))}
                    rows={2}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Your Current Location *</label>
                  {form.liveLocation ? (
                    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      <MapPin className="h-3.5 w-3.5" /> Captured: {form.liveLocation}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleCaptureLocation}
                      disabled={isGettingLocation}
                      className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <MapPin className="h-3.5 w-3.5" /> {isGettingLocation ? 'Getting location...' : 'Capture Location'}
                    </button>
                  )}
                </div>
              </div>
              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDialogOpen(false)}
                  disabled={submitting}
                  className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Log Outreach'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Detail view modal ───────────────────────────────────────────── */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedEntry(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-2xl w-full overflow-hidden">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">CP Outreach — Visit Details</span>
              <button onClick={() => setSelectedEntry(null)} className="p-1 rounded-lg text-indigo-200 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Row 1: Date + Sourcing Manager */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Logged At</p>
                  <p className="text-sm font-semibold text-slate-800">{new Date(selectedEntry.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{new Date(selectedEntry.created_at).toLocaleTimeString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Sourcing Manager</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {sourcingManagers.find(sm => sm.id === selectedEntry.sourcing_manager_id)?.name || selectedEntry.sourcing_manager_other || '—'}
                  </p>
                </div>
              </div>
              {/* Row 2: CP Firm + CP Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">CP Firm Name</p>
                  <p className="text-sm font-semibold text-slate-800">{selectedEntry.cp_firm_name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">CP Name</p>
                  <p className="text-sm font-semibold text-slate-800">{selectedEntry.cp_name}</p>
                </div>
              </div>
              {/* Row 3: Contact + Location */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">CP Contact Number</p>
                  <p className="text-sm font-semibold text-slate-800">{selectedEntry.cp_contact_number}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Location</p>
                  <p className="text-sm font-semibold text-slate-800">{selectedEntry.location}</p>
                </div>
              </div>
              {/* Row 4: CP Type + Meeting Done */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">CP Type</p>
                  <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">{selectedEntry.cp_type}</span>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Meeting Done</p>
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    selectedEntry.meeting_done === 'Fresh' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}>{selectedEntry.meeting_done}</span>
                </div>
              </div>
              {/* Leads Source Active In */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Leads Source Active In</p>
                <div className="flex flex-wrap gap-2">
                  {selectedEntry.leads_source_active_in.map(opt => (
                    <span key={opt} className="px-3 py-1 bg-indigo-600 text-white text-xs font-semibold rounded-full">{opt}</span>
                  ))}
                </div>
              </div>
              {/* Meeting Remarks */}
              {selectedEntry.meeting_remarks && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Meeting Remarks</p>
                  <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 whitespace-pre-wrap">{selectedEntry.meeting_remarks}</p>
                </div>
              )}
              {/* Live GPS Location */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">GPS Location (at time of logging)</p>
                <LiveLocationLink value={selectedEntry.live_location} />
                {selectedEntry.live_location && (
                  <p className="text-[11px] text-slate-400 mt-0.5">{selectedEntry.live_location}</p>
                )}
              </div>
              {/* Logged at — footer note only, main date is already at top */}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Record Created</p>
                <p className="text-xs text-slate-500">{new Date(selectedEntry.created_at).toLocaleString('en-IN')}</p>
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-100">
              <button
                onClick={() => setSelectedEntry(null)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
