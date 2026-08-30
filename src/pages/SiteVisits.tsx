import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { reportQueryError } from '../services/queryLogger';
import { useAuth } from '../hooks/useAuth';
import { canEditLead } from '../utils/permissions';
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
  Users,
  Trash2
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

// Walk-in visit codes for a channel-partner-submitted visit always send
// from the super admin's own connected WhatsApp number, not the CP's --
// channel partners don't get their own WhatsApp login for this feature.
const SWAPNIL_USER_ID = 'ccfd55b7-36a2-4ab0-964e-a7e8403a9504';

export const SiteVisits: React.FC = () => {
  const { role, user } = useAuth();
  const isChannelPartner = role === 'channel_partner';
  // Delete is restricted to super_admin — both DB tables' DELETE RLS
  // policies already enforce this independently (site_visits_delete /
  // quick_site_visits_delete both check is_super_admin()), this only
  // decides whether to show the button.
  const canDelete = role === 'super_admin';

  // A channel partner's Project dropdown in the Walk-in Visit form is
  // limited to the projects actually assigned to them
  // (channel_partner_projects) -- previously showed every project in the
  // company regardless of assignment. Also resolve their own CP id/name so
  // the Channel Partner and Referenced By fields can auto-fill to
  // themselves instead of offering a picker.
  const [myCpId, setMyCpId] = useState<string | null>(null);
  const [myCpProjectIds, setMyCpProjectIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (role !== 'channel_partner' || !user?.id) return;
    (async () => {
      const { data: cp } = await supabase.from('channel_partners').select('id').eq('user_id', user.id).maybeSingle();
      if (!cp) { setMyCpProjectIds([]); return; }
      setMyCpId(cp.id);
      const { data: assignments } = await supabase.from('channel_partner_projects').select('project_id').eq('channel_partner_id', cp.id);
      setMyCpProjectIds((assignments || []).map(a => a.project_id));
    })();
  }, [role, user?.id]);

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

  const visibleProjectEntries = Array.from(projectMap.entries()).filter(
    ([id]) => role !== 'channel_partner' || !myCpProjectIds || myCpProjectIds.includes(id)
  );

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal open states
  const [selectedVisit, setSelectedVisit] = useState<SiteVisit | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Channel Partner lookups lists & map
  const [channelPartners, setChannelPartners] = useState<{ id: string; name: string; cp_code: string; mobile: string | null; company_name: string | null }[]>([]);
  const [channelPartnerMap, setChannelPartnerMap] = useState<Map<string, string>>(new Map());

  // Status updating loader
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // --- Walk-in Site Visit (new, standalone — no lead relation at all) ---
  // Client's explicit requirement: customer name/number, date-time, CP and
  // project only; duplicate customer numbers are allowed (unlike Leads);
  // open to every role; auto-expires 24h after creation; a verification
  // code is generated and sent via WhatsApp to both the customer and the
  // referring Channel Partner. Lives entirely in its own table
  // (quick_site_visits) — nothing here touches leads or the existing
  // site_visits records above.
  interface QuickVisit {
    id: string;
    customer_name: string;
    customer_mobile: string;
    visit_at: string;
    channel_partner_id: string;
    project_id: string;
    verification_code: string;
    referenced_by: string;
    status: 'active' | 'expired';
    created_at: string;
  }
  const [quickVisits, setQuickVisits] = useState<QuickVisit[]>([]);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [quickCreateLoading, setQuickCreateLoading] = useState(false);
  const [quickCreateError, setQuickCreateError] = useState<string | null>(null);
  const [quickCustomerName, setQuickCustomerName] = useState('');
  const [quickCustomerMobile, setQuickCustomerMobile] = useState('');
  // Split into date + 12-hour time + AM/PM rather than a single
  // <input type="datetime-local">, which renders in whatever 12h/24h
  // format the visitor's OS is set to -- there's no HTML/CSS way to force
  // AM/PM display on that input. This guarantees AM/PM every time.
  const [quickVisitDate, setQuickVisitDate] = useState('');
  const [quickVisitHour, setQuickVisitHour] = useState('12');
  const [quickVisitMinute, setQuickVisitMinute] = useState('00');
  const [quickVisitAmPm, setQuickVisitAmPm] = useState<'AM' | 'PM'>('PM');
  const [quickChannelPartnerId, setQuickChannelPartnerId] = useState('');
  const [quickProjectId, setQuickProjectId] = useState('');
  const [quickSourcingManagerName, setQuickSourcingManagerName] = useState('');
  const [quickReferencedBy, setQuickReferencedBy] = useState('');

  // A channel partner logging their own walk-in visit doesn't pick a
  // Channel Partner or type who referred it -- both are themselves.
  useEffect(() => {
    if (!isQuickCreateOpen || !isChannelPartner) return;
    if (myCpId) setQuickChannelPartnerId(myCpId);
    setQuickReferencedBy(profileMap.get(user?.id || '') || '');
  }, [isQuickCreateOpen, isChannelPartner, myCpId, user?.id, profileMap]);

  // Sourcing Manager picker for the Walk-in Visit form. Not tied to any
  // one role -- the client wants every walk-in visit to be able to credit
  // a Sourcing Manager by name, separately from (and before) "Referenced
  // By", and neither field is mandatory since a walk-in can come from a
  // personal referral with no Channel Partner or Sourcing Manager involved.
  const [sourcingManagers, setSourcingManagers] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    (async () => {
      const { data: roleRow } = await supabase.from('roles').select('id').eq('name', 'sourcing_manager').maybeSingle();
      if (!roleRow) return;
      const { data: userRoles } = await supabase.from('user_roles').select('user_id').eq('role_id', roleRow.id);
      const userIds = (userRoles || []).map(ur => ur.user_id);
      if (userIds.length === 0) return;
      const { data: profiles } = await supabase.from('user_profiles').select('id, full_name').in('id', userIds);
      setSourcingManagers((profiles || []).map(p => ({ id: p.id, name: p.full_name || 'Unnamed' })));
    })();
  }, []);

  const fetchQuickVisits = useCallback(async () => {
    const { data, error } = await supabase
      .from('quick_site_visits')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) reportQueryError('Site Visits: walk-in visits', error);
    else setQuickVisits(data || []);
  }, []);

  // Live WhatsApp delivery status per walk-in visit — quick_visit_id ->
  // list of {status}. Each visit sends up to 2 messages (customer + CP), so
  // this rolls them into one summary per visit rather than showing rows.
  const [quickVisitMsgStatus, setQuickVisitMsgStatus] = useState<Map<string, string[]>>(new Map());

  const fetchQuickVisitMsgStatus = useCallback(async () => {
    const { data, error } = await supabase
      .from('whatsapp_outbox')
      .select('quick_visit_id, status')
      .not('quick_visit_id', 'is', null);
    if (error) return reportQueryError('Site Visits: walk-in message status', error);
    const map = new Map<string, string[]>();
    for (const row of data || []) {
      if (!row.quick_visit_id) continue;
      const arr = map.get(row.quick_visit_id) || [];
      arr.push(row.status);
      map.set(row.quick_visit_id, arr);
    }
    setQuickVisitMsgStatus(map);
  }, []);

  useEffect(() => {
    fetchQuickVisitMsgStatus();
    // Realtime: the gateway updates whatsapp_outbox.status as it sends —
    // subscribe so "queued" flips to "sent"/"failed" live, no manual refresh.
    const channel = supabase
      .channel('quick-visit-outbox-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_outbox' }, () => {
        fetchQuickVisitMsgStatus();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchQuickVisitMsgStatus]);

  const summarizeMsgStatus = (visitId: string): { label: string; color: string } => {
    const statuses = quickVisitMsgStatus.get(visitId);
    if (!statuses || statuses.length === 0) return { label: 'No messages', color: 'text-slate-400' };
    if (statuses.some(s => s === 'failed')) return { label: 'Failed', color: 'text-rose-600' };
    if (statuses.every(s => s === 'sent')) return { label: 'Delivered', color: 'text-emerald-600' };
    if (statuses.some(s => s === 'sending')) return { label: 'Sending...', color: 'text-indigo-600' };
    return { label: 'Queued', color: 'text-amber-600' };
  };

  const resetQuickForm = () => {
    setQuickCustomerName('');
    setQuickCustomerMobile('');
    setQuickVisitDate('');
    setQuickVisitHour('12');
    setQuickVisitMinute('00');
    setQuickVisitAmPm('PM');
    setQuickChannelPartnerId('');
    setQuickProjectId('');
    setQuickSourcingManagerName('');
    setQuickReferencedBy('');
    setQuickCreateError(null);
  };

  // DD-MM-YYYY, matching the client's exact template example ("25-12-2021").
  const formatDDMMYYYY = (d: Date) => {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}-${month}-${d.getFullYear()}`;
  };

  // Combines the date + 12-hour time + AM/PM fields into a real Date,
  // converting to 24-hour internally (JS Date always works in 24h).
  const buildQuickVisitDateTime = (): Date | null => {
    if (!quickVisitDate) return null;
    let hour24 = parseInt(quickVisitHour, 10) % 12;
    if (quickVisitAmPm === 'PM') hour24 += 12;
    const [year, month, day] = quickVisitDate.split('-').map(Number);
    return new Date(year, month - 1, day, hour24, parseInt(quickVisitMinute, 10));
  };

  // 12-hour label for the WhatsApp message, e.g. "02:30 PM".
  const formatTime12h = (d: Date) => {
    let h = d.getHours() % 12;
    if (h === 0) h = 12;
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
    return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
  };

  const handleQuickCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const visitDateTime = buildQuickVisitDateTime();
    if (!quickCustomerName.trim() || !quickCustomerMobile.trim() || !visitDateTime || !quickProjectId) {
      setQuickCreateError('Customer Name, WhatsApp Number, Visit Date & Time and Project are required.');
      return;
    }

    // A channel-partner-submitted visit always sends via the super admin's
    // WhatsApp session -- if it isn't connected, don't save the visit at
    // all, since the verification code would never reach anyone.
    if (isChannelPartner) {
      const { data: waSession } = await supabase
        .from('whatsapp_session')
        .select('status, last_heartbeat_at')
        .eq('id', SWAPNIL_USER_ID)
        .maybeSingle();
      const fresh = waSession?.last_heartbeat_at
        ? Date.now() - new Date(waSession.last_heartbeat_at).getTime() < 20000
        : false;
      if (!fresh || waSession?.status !== 'open') {
        setQuickCreateError('Kindly ask the super admin (Swapnil) to log in to WhatsApp in order to send the message and add the site visit.');
        return;
      }
    }

    setQuickCreateError(null);
    setQuickCreateLoading(true);
    try {
      const verificationCode = Math.random().toString(36).slice(2, 8).toUpperCase();
      const { data: { user } } = await supabase.auth.getUser();

      // Normalise to a clean 10-digit Indian number: strip spaces, dashes,
      // +91 or 0 prefixes so the DB always holds the local format and the
      // gateway's toJid() can reliably prepend the country code.
      const normalizePhone = (p: string) => {
        let d = p.replace(/[^0-9]/g, '');
        if (d.startsWith('91') && d.length === 12) d = d.slice(2);
        if (d.startsWith('0') && d.length === 11) d = d.slice(1);
        return d;
      };
      const customerPhone = normalizePhone(quickCustomerMobile.trim());

      const { data: inserted, error: insertErr } = await supabase
        .from('quick_site_visits')
        .insert([{
          customer_name: quickCustomerName.trim(),
          customer_mobile: customerPhone,
          visit_at: visitDateTime.toISOString(),
          channel_partner_id: quickChannelPartnerId || null,
          project_id: quickProjectId,
          verification_code: verificationCode,
          sourcing_manager_name: quickSourcingManagerName.trim() || null,
          referenced_by: quickReferencedBy.trim() || null,
          status: 'active',
          created_by: user?.id || null,
        }])
        .select('id')
        .single();
      if (insertErr) throw insertErr;

      const cp = channelPartners.find(c => c.id === quickChannelPartnerId);
      const projectName = projectMap.get(quickProjectId) || 'the project';
      const visitDateLabel = formatDDMMYYYY(visitDateTime);

      // Exact template requested — identical text sent to both the
      // customer and the Channel Partner, merge fields filled in:
      // "Dear {customer name}, use code {code} with (91) {customer number}
      //  to preview {project} on {date}. Referred by {referenced_by}."
      // Referenced By is optional now, so that clause is only appended when
      // a name was actually entered.
      const referredByClause = quickReferencedBy.trim() ? ` Referred by ${quickReferencedBy.trim()}.` : '';
      const message = `Dear ${quickCustomerName.trim()}, use code ${verificationCode} with (91) ${customerPhone} to preview ${projectName} on ${visitDateLabel}.${referredByClause}`;

      const outboxRows: { to_phone: string; message: string }[] = [];
      outboxRows.push({ to_phone: customerPhone, message });
      if (cp?.mobile) {
        const cpPhone = normalizePhone(cp.mobile);
        outboxRows.push({ to_phone: cpPhone, message });
      }
      // Channel-partner submissions always send from the super admin's
      // number (already confirmed connected above); everyone else sends
      // from their own connected session as before.
      const outboxSenderId = isChannelPartner ? SWAPNIL_USER_ID : (user?.id || null);
      const { error: outboxErr } = await supabase.from('whatsapp_outbox').insert(
        outboxRows.map(r => ({ ...r, status: 'queued', quick_visit_id: inserted.id, created_by: outboxSenderId }))
      );
      if (outboxErr) {
        // Visit itself is already saved — a failed notification shouldn't
        // undo that, but the admin needs to know the code wasn't sent.
        reportQueryError('Site Visits: walk-in visit code WhatsApp send', outboxErr);
        setNotification({ type: 'error', message: 'Visit logged, but the WhatsApp code could not be queued: ' + outboxErr.message });
      } else {
        setNotification({ type: 'success', message: 'Walk-in visit logged. Verification code sent to the customer and Channel Partner.' });
      }

      setIsQuickCreateOpen(false);
      resetQuickForm();
      await fetchQuickVisits();
    } catch (err: any) {
      reportQueryError('Site Visits: walk-in visit create', err);
      setQuickCreateError(err.message || 'Failed to log the walk-in visit.');
    } finally {
      setQuickCreateLoading(false);
    }
  };

  // Fetch lookups (projects, profiles, leads, CPs)
  const fetchLookups = useCallback(async () => {
    try {
      const [projectsRes, profilesRes, leadsRes, cpRes] = await Promise.all([
        supabase.from('projects').select('id, project_name'),
        supabase.from('user_profiles').select('id, full_name'),
        supabase.from('leads').select('id, customer_name, mobile, email, project_id, owner_id, channel_partner_id'),
        supabase.from('channel_partners').select('id, name, cp_code, mobile, company_name').eq('status', 'active')
      ]);

      if (projectsRes.data) {
        setProjectMap(new Map(projectsRes.data.map(p => [p.id, p.project_name])));
      }
      if (profilesRes.data) {
        setProfileMap(new Map(profilesRes.data.map(u => [u.id, u.full_name])));
      }
      if (leadsRes.data) {
        setLeadsMap(new Map(leadsRes.data.map(l => [l.id, l as any])));
      }
      if (cpRes.data) {
        setChannelPartners(cpRes.data);
        setChannelPartnerMap(new Map(cpRes.data.map(c => [c.id, `${c.cp_code} - ${c.name}`])));
      }
    } catch (err) {
      reportQueryError('Site Visits: lookups', err);
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

      // Search -- customer name/mobile live on leads, not site_visits, so
      // match them via the full (unpaginated) leadsMap already loaded, then
      // filter by the resulting lead_id. Without this, search only ever
      // matched within the current page of results.
      if (searchQuery.trim()) {
        const term = searchQuery.trim().toLowerCase();
        const matchingLeadIds = Array.from(leadsMap.entries())
          .filter(([, l]) => l.customer_name?.toLowerCase().includes(term) || l.mobile?.includes(searchQuery.trim()))
          .map(([id]) => id);
        const orParts = [`remarks.ilike.%${term.replace(/[%,]/g, '')}%`];
        if (matchingLeadIds.length) orParts.push(`lead_id.in.(${matchingLeadIds.join(',')})`);
        query = query.or(orParts.join(','));
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
  }, [statusFilter, projectFilter, page, pageSize, searchQuery, leadsMap]);

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups]);

  useEffect(() => {
    fetchSiteVisits();
  }, [fetchSiteVisits]);

  useEffect(() => {
    fetchQuickVisits();
  }, [fetchQuickVisits]);

  // Sync refresh trigger
  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    await fetchLookups();
    await fetchSiteVisits();
    await fetchQuickVisits();
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

  const [deletingVisitId, setDeletingVisitId] = useState<string | null>(null);

  const handleDeleteVisit = async (visitId: string) => {
    if (!window.confirm('Delete this site visit? This cannot be undone.')) return;
    setDeletingVisitId(visitId);
    try {
      const { error } = await supabase.from('site_visits').delete().eq('id', visitId);
      if (error) throw error;
      setVisits(prev => prev.filter(v => v.id !== visitId));
      if (selectedVisit?.id === visitId) setSelectedVisit(null);
      setNotification({ type: 'success', message: 'Site visit deleted.' });
    } catch (err: any) {
      reportQueryError('Site Visits: delete', err);
      setNotification({ type: 'error', message: err.message || 'Failed to delete site visit.' });
    } finally {
      setDeletingVisitId(null);
    }
  };

  const handleDeleteQuickVisit = async (visitId: string) => {
    if (!window.confirm('Delete this walk-in visit? This cannot be undone.')) return;
    setDeletingVisitId(visitId);
    try {
      const { error } = await supabase.from('quick_site_visits').delete().eq('id', visitId);
      if (error) throw error;
      setQuickVisits(prev => prev.filter(v => v.id !== visitId));
      setNotification({ type: 'success', message: 'Walk-in visit deleted.' });
    } catch (err: any) {
      reportQueryError('Site Visits: delete walk-in visit', err);
      setNotification({ type: 'error', message: err.message || 'Failed to delete walk-in visit.' });
    } finally {
      setDeletingVisitId(null);
    }
  };

  // Search and project filter are both applied server-side in
  // fetchSiteVisits now, so `visits` is already the filtered set.
  const getFilteredVisits = () => {
    return visits.filter(v => {
      const matchesProject = projectFilter
        ? v.project_id === projectFilter
        : true;

      return matchesProject;
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
          <h2 className="text-2xl font-bold text-slate-900">{isChannelPartner ? 'Walk-in Visits' : 'Pre Tagging Directory'}</h2>
          <p className="text-slate-500 text-sm">
            {isChannelPartner ? 'Log walk-in visits from your customers and track their verification status.' : 'Schedule, manage, and log client site inspect visits.'}
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
            onClick={() => setIsQuickCreateOpen(true)}
            title="Log a walk-in visit not tied to any Lead — sends a verification code via WhatsApp"
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md shadow-emerald-600/10 hover:shadow-lg transition-all focus:outline-none"
          >
            + Log Walk-in Visit
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

      {/* TOOLBAR — the formal Site Visits directory below isn't relevant to
          a channel partner (it's the internal scheduled-visit workflow off
          leads); they only get the Walk-in Visits section. */}
      {!isChannelPartner && (
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
      )}

      {/* WALK-IN VISITS — standalone, no lead relation. Shows the
          verification code and live WhatsApp delivery status per visit. */}
      {quickVisits.length > 0 && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800">Walk-in Visits</h3>
            <p className="text-xxs text-slate-400 mt-0.5">Logged directly — not tied to any Lead. Auto-expires 24 hours after logging.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-100">
                  <th className="py-3 px-6">Customer</th>
                  <th className="py-3 px-6">Visit Time</th>
                  <th className="py-3 px-6">Project</th>
                  <th className="py-3 px-6">Channel Partner</th>
                  <th className="py-3 px-6">Code</th>
                  <th className="py-3 px-6">Message Status</th>
                  <th className="py-3 px-6">Status</th>
                  {canDelete && <th className="py-3 px-6 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quickVisits.map(v => {
                  const cp = channelPartners.find(c => c.id === v.channel_partner_id);
                  const msgStatus = summarizeMsgStatus(v.id);
                  return (
                    <tr key={v.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-6">
                        <div className="font-semibold text-slate-900">{v.customer_name}</div>
                        <div className="text-xs text-slate-500">{v.customer_mobile}</div>
                      </td>
                      <td className="py-3 px-6 text-slate-600">{formatDDMMYYYY(new Date(v.visit_at))} · {formatTime12h(new Date(v.visit_at))}</td>
                      <td className="py-3 px-6 text-slate-600">{projectMap.get(v.project_id) || 'N/A'}</td>
                      <td className="py-3 px-6 text-slate-600">{cp ? `${cp.cp_code} - ${cp.name}${cp.company_name ? ` (${cp.company_name})` : ''}` : 'N/A'}</td>
                      <td className="py-3 px-6">
                        <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg">{v.verification_code}</span>
                      </td>
                      <td className={`py-3 px-6 text-xs font-semibold ${msgStatus.color}`}>{msgStatus.label}</td>
                      <td className="py-3 px-6">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xxs font-semibold ${v.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {v.status === 'active' ? 'Active' : 'Expired'}
                        </span>
                      </td>
                      {canDelete && (
                        <td className="py-3 px-6 text-right">
                          <button
                            onClick={() => handleDeleteQuickVisit(v.id)}
                            disabled={deletingVisitId === v.id}
                            title="Delete (Super Admin only)"
                            className="inline-flex items-center justify-center p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 disabled:opacity-40"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TABLE DIRECTORY — formal scheduled visits off leads; not relevant
          to a channel partner, who only works with Walk-in Visits above. */}
      {!isChannelPartner && (
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
                              {(() => {
                                const lead = leadsMap.get(v.lead_id || '');
                                const canManage = canEditLead(role, user?.id, lead?.owner_id || null, null, null);
                                return canManage && v.status?.toLowerCase() === 'planned' && (
                                  <button
                                    onClick={() => handleUpdateStatus(v.id, 'completed')}
                                    disabled={updatingId === v.id}
                                    className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-emerald-50 border border-emerald-100 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                                  >
                                    {updatingId === v.id ? '...' : 'Complete'}
                                  </button>
                                );
                              })()}
                              
                              <button
                                onClick={() => setSelectedVisit(v)}
                                className="inline-flex items-center space-x-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>View</span>
                              </button>
                              {canDelete && (
                                <button
                                  onClick={() => handleDeleteVisit(v.id)}
                                  disabled={deletingVisitId === v.id}
                                  title="Delete (Super Admin only)"
                                  className="inline-flex items-center justify-center p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 disabled:opacity-40"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
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
      )}

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
                {(() => {
                  const lead = leadsMap.get(selectedVisit.lead_id || '');
                  const canManage = canEditLead(role, user?.id, lead?.owner_id || null, null, null);
                  return canManage && selectedVisit.status?.toLowerCase() === 'planned' && (
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
                  );
                })()}
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

      {/* LOG WALK-IN VISIT MODAL — standalone, no lead relation, open to
          every role. Duplicate customer numbers are explicitly allowed
          here (unlike Leads), per the client's requirement. */}
      {isQuickCreateOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setIsQuickCreateOpen(false); resetQuickForm(); }} />

          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-emerald-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">Log Walk-in Visit</span>
              <button type="button" onClick={() => { setIsQuickCreateOpen(false); resetQuickForm(); }} className="p-1 rounded-lg text-emerald-100 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleQuickCreateSubmit}>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {quickCreateError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-start space-x-2.5">
                    <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-medium leading-tight">{quickCreateError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Customer Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="John Doe"
                    value={quickCustomerName}
                    onChange={(e) => setQuickCustomerName(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-emerald-500 focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Customer WhatsApp Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 9876543210"
                    value={quickCustomerMobile}
                    onChange={(e) => setQuickCustomerMobile(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-emerald-500 focus:outline-none transition-all"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    This must be a working WhatsApp number — the verification code is sent here.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Site Visit Date &amp; Time *</label>
                  <div className="grid grid-cols-4 gap-2">
                    <input
                      type="date"
                      required
                      value={quickVisitDate}
                      onChange={(e) => setQuickVisitDate(e.target.value)}
                      className="col-span-2 block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                    <select
                      value={quickVisitHour}
                      onChange={(e) => setQuickVisitHour(e.target.value)}
                      className="block w-full px-2 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                        <option key={h} value={String(h)}>{String(h).padStart(2, '0')}</option>
                      ))}
                    </select>
                    <select
                      value={quickVisitAmPm}
                      onChange={(e) => setQuickVisitAmPm(e.target.value as 'AM' | 'PM')}
                      className="block w-full px-2 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                  <div className="mt-2">
                    <select
                      value={quickVisitMinute}
                      onChange={(e) => setQuickVisitMinute(e.target.value)}
                      className="block w-28 px-2 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map(m => (
                        <option key={m} value={m}>:{m}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {isChannelPartner ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Channel Partner</label>
                    <div className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-100 text-slate-500 text-sm">
                      {(() => {
                        const me = channelPartners.find(cp => cp.id === myCpId);
                        return me ? `${me.name}${me.company_name ? ` (${me.company_name})` : ''}` : 'You';
                      })()}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Channel Partner</label>
                    <select
                      value={quickChannelPartnerId}
                      onChange={(e) => setQuickChannelPartnerId(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      <option value="">Select Channel Partner... (optional)</option>
                      {channelPartners.map(cp => (
                        <option key={cp.id} value={cp.id}>{cp.cp_code} - {cp.name}{cp.company_name ? ` (${cp.company_name})` : ''}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Leave blank if this visit isn't from a Channel Partner — e.g. a personal referral. Their number is taken automatically from their Channel Partner record when selected.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Project *</label>
                  <select
                    required
                    value={quickProjectId}
                    onChange={(e) => setQuickProjectId(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                  >
                    <option value="">Select Project...</option>
                    {visibleProjectEntries.map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                  {role === 'channel_partner' && myCpProjectIds && myCpProjectIds.length === 0 && (
                    <p className="text-[10px] text-amber-600 mt-1">No projects are assigned to you yet — contact an admin.</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Sourcing Manager Name</label>
                  <select
                    value={quickSourcingManagerName}
                    onChange={(e) => setQuickSourcingManagerName(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-emerald-500 focus:outline-none transition-all"
                  >
                    <option value="">Select Sourcing Manager... (optional)</option>
                    {sourcingManagers.map(sm => (
                      <option key={sm.id} value={sm.name}>{sm.name}</option>
                    ))}
                  </select>
                </div>

                {isChannelPartner ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Referenced By</label>
                    <div className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-100 text-slate-500 text-sm">
                      {quickReferencedBy || 'You'}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Referenced By</label>
                    <input
                      type="text"
                      placeholder="Name of the person who referred this visit (optional)"
                      value={quickReferencedBy}
                      onChange={(e) => setQuickReferencedBy(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-emerald-500 focus:outline-none transition-all"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Appears in the WhatsApp message as "Referred by {'{'}name{'}'}" when filled in.</p>
                  </div>
                )}

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-xxs text-slate-500">
                  A unique verification code will be generated and sent via WhatsApp to the customer, and to the Channel Partner if one is selected. This visit stays <span className="font-semibold">active for 24 hours</span>, after which it automatically expires.
                </div>
              </div>

              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setIsQuickCreateOpen(false); resetQuickForm(); }}
                  disabled={quickCreateLoading}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors focus:outline-none disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={quickCreateLoading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/10 hover:shadow-lg disabled:opacity-50 transition-all focus:outline-none"
                >
                  {quickCreateLoading ? 'Logging & Sending Code...' : 'Log Visit & Send Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
