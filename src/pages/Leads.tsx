import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { canCreateLead, canEditLeadRecord, isSuperAdmin } from '../utils/permissions';
import { reportQueryError } from '../services/queryLogger';
import { supabase } from '../services/supabaseClient';
import {
  uploadWhatsAppAttachment,
  removeWhatsAppAttachment,
  formatBytes,
  type UploadedAttachment,
} from '../services/whatsappAttachments';
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  AlertCircle,
  Users,
  Calendar,
  Mail,
  Phone,
  PhoneCall,
  Bookmark,
  FileText,
  Play,
  Square,
  MapPin,
  MessageCircle,
  Send,
  Paperclip,
  Pencil,
  Trash2,
} from 'lucide-react';

interface Lead {
  id: string;
  customer_name: string | null;
  mobile: string | null;
  email: string | null;
  status: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
  project_id: string | null;
  owner_id: string | null;
  channel_partner_id: string | null;
  telecaller_id: string | null;
  sourcing_manager_id: string | null;
  bulk_upload_id: string | null;
}

export const Leads: React.FC = () => {
  // Query & state filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');

  // Pagination states
  const [page, setPage] = useState(0);
  const [pageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  // Data states
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamic filter option lists (populated from DB)
  const [projectMap, setProjectMap] = useState<Map<string, string>>(new Map());
  const [profileMap, setProfileMap] = useState<Map<string, string>>(new Map());
  const [sourcingManagerMap, setSourcingManagerMap] = useState<Map<string, string>>(new Map());
  const [telecallerMap, setTelecallerMap] = useState<Map<string, string>>(new Map());
  const [closingTeamMap, setClosingTeamMap] = useState<Map<string, string>>(new Map());
  const [uniqueStatuses, setUniqueStatuses] = useState<string[]>([]);
  const [uniqueSources, setUniqueSources] = useState<string[]>([]);

  // Selected lead for read-only detail view modal
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // Auth and Routing hooks
  const { user, role } = useAuth();
  const isChannelPartner = role === 'channel_partner';
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
  const [isLogCallOpen, setIsLogCallOpen] = useState(false);
  const [callOutcome, setCallOutcome] = useState('connected');
  const [callNotes, setCallNotes] = useState('');
  const [callSubmitting, setCallSubmitting] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

  // WhatsApp compose. Messages aren't sent from the browser — they're
  // queued into whatsapp_outbox, and the standalone Baileys gateway
  // (whatsapp-gateway/) picks them up and sends them from the connected
  // WhatsApp account, throttled. Same path the CP verification codes
  // already use, so there's one send pipeline, not two.
  const [waLead, setWaLead] = useState<Lead | null>(null);
  const [waMessage, setWaMessage] = useState('');
  const [waSubmitting, setWaSubmitting] = useState(false);
  const [waError, setWaError] = useState<string | null>(null);
  const [waSuccess, setWaSuccess] = useState(false);
  const [waGatewayOnline, setWaGatewayOnline] = useState<boolean | null>(null);
  const [waAttachment, setWaAttachment] = useState<UploadedAttachment | null>(null);
  const [waUploading, setWaUploading] = useState(false);
  const waFileInputRef = useRef<HTMLInputElement | null>(null);

  // Anti-fraud call timing: duration is measured by the app (Start Call /
  // End Call), never hand-typed, so a telecaller can't just enter a fake
  // number. GPS is captured best-effort when the call starts. Neither of
  // these proves the call actually happened over the phone — only a real
  // telephony/dialer integration can do that — but together they stop
  // casual fabrication and make bulk fake logging visible in Reports.
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [callEndedAt, setCallEndedAt] = useState<number | null>(null);
  const [callElapsedSec, setCallElapsedSec] = useState(0);
  const [callLocation, setCallLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [callLocationError, setCallLocationError] = useState<string | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Create Lead modal & notification states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Same modal doubles as the Edit form — editingLead is null while
  // creating, set to the lead being edited otherwise. There was previously
  // NO way to edit a lead's info at all after creation (confirmed: no
  // update call anywhere in this file touched anything but
  // last_contact_at). Source is the one field locked down once a lead
  // exists — enforced for real by enforce_lead_source_change_trigger on
  // the database, not just this UI check.
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const canEditSource = role === 'super_admin' || role === 'site_head';

  // Creation form fields
  const [customerName, setCustomerName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [selectedSource, setSelectedSource] = useState('walk_in');
  const [selectedStatus, setSelectedStatus] = useState('new');
  const [selectedChannelPartnerId, setSelectedChannelPartnerId] = useState('');
  const [notes, setNotes] = useState('');
  
  // New Lead fields
  const [visitType, setVisitType] = useState('Fresh');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [residenceAddress, setResidenceAddress] = useState('');
  const [profession, setProfession] = useState('');
  const [requirementDetails, setRequirementDetails] = useState('');
  const [budget, setBudget] = useState('');
  const [sourcingManagerId, setSourcingManagerId] = useState('');
  const [telecallerId, setTelecallerId] = useState('');
  const [nextFollowupAt, setNextFollowupAt] = useState('');

  // Channel partner list & lookup map
  const [channelPartners, setChannelPartners] = useState<{ id: string; name: string; partner_code: string }[]>([]);
  const [channelPartnerMap, setChannelPartnerMap] = useState<Map<string, string>>(new Map());

  // A channel partner adding their own lead: their own CP id and the
  // projects they're assigned to (channel_partner_projects), not every
  // project -- same scoping already used in BulkUploadModal/SiteVisits.
  const [myCpId, setMyCpId] = useState<string | null>(null);
  const [myCpProjectMap, setMyCpProjectMap] = useState<Map<string, string>>(new Map());

  // Fetch filter options (projects, profiles, unique statuses/sources)
  const fetchFilterOptions = useCallback(async () => {
    // 1. Load Projects from public.projects
    try {
      const { data, error: projectsError } = await supabase
        .from('projects')
        .select('id, project_name');
      
      if (projectsError) {
        console.error('Supabase Projects API Error:', projectsError.message, projectsError.details);
      } else if (data) {
        console.log(`Supabase Projects loaded: ${data.length} records`);
        setProjectMap(new Map(data.map(p => [p.id, p.project_name])));
      }
    } catch (err) {
      console.error('Unexpected Projects fetch exception:', err);
    }

    // 2. Load User Profiles and Roles for filtering Sourcing Managers / Telecallers
    try {
      const [profilesRes, rolesRes, userRolesRes] = await Promise.all([
        supabase.from('user_profiles').select('id, full_name'),
        supabase.from('roles').select('id, name'),
        supabase.from('user_roles').select('user_id, role_id')
      ]);
      
      if (profilesRes.error) {
        console.error('Supabase User Profiles API Error:', profilesRes.error.message);
      } else if (profilesRes.data) {
        console.log(`Supabase Profiles loaded: ${profilesRes.data.length} records`);
        const allProfiles = new Map(profilesRes.data.map(u => [u.id, u.full_name]));
        setProfileMap(allProfiles);
        
        if (rolesRes.data && userRolesRes.data) {
          const roleMap = new Map(rolesRes.data.map(r => [r.id, r.name]));
          const smMap = new Map<string, string>();
          const tcMap = new Map<string, string>();
          const cmMap = new Map<string, string>();

          userRolesRes.data.forEach(ur => {
            const rName = roleMap.get(ur.role_id);
            const pName = allProfiles.get(ur.user_id);
            if (rName && pName) {
              if (rName === 'sourcing_manager' || rName === 'sourcing_manager_tl') {
                smMap.set(ur.user_id, pName);
              }
              if (rName === 'telecaller' || rName === 'presales' || rName === 'presales_tl') {
                tcMap.set(ur.user_id, pName);
              }
              if (rName === 'closing_manager' || rName === 'closing_manager_tl' || rName === 'site_head') {
                cmMap.set(ur.user_id, pName);
              }
            }
          });
          setSourcingManagerMap(smMap);
          setTelecallerMap(tcMap);
          setClosingTeamMap(cmMap);
        }
      }
    } catch (err) {
      console.error('Unexpected Profiles fetch exception:', err);
    }

    // 3. Load unique statuses and sources from existing leads for filtering stubs
    try {
      const { data, error: leadsFieldsError } = await supabase
        .from('leads')
        .select('status, source');
      
      if (leadsFieldsError) {
        console.error('Supabase Leads fields API Error:', leadsFieldsError.message, leadsFieldsError.details);
      } else if (data) {
        const statuses = [...new Set(data.map(item => item.status).filter(Boolean))] as string[];
        const sources = [...new Set(data.map(item => item.source).filter(Boolean))] as string[];
        setUniqueStatuses(statuses);
        setUniqueSources(sources);
      }
    } catch (err) {
      console.error('Unexpected Leads fields fetch exception:', err);
    }

    // 4. Load Channel Partners from public.channel_partners
    try {
      const { data, error: cpError } = await supabase
        .from('channel_partners')
        .select('id, name, partner_code')
        .eq('status', 'active');
      
      if (cpError) {
        console.error('Supabase Channel Partners API Error:', cpError.message);
      } else if (data) {
        setChannelPartners(data);
        setChannelPartnerMap(new Map(data.map(c => [c.id, `${c.partner_code || ''} - ${c.name || ''}`])));
      }
    } catch (err) {
      console.error('Unexpected Channel Partners fetch exception:', err);
    }
  }, []);

  // Main lead fetch function
  const fetchLeads = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      let query = supabase
        .from('leads')
        .select('*', { count: 'exact' });

      // Apply Search
      if (searchQuery.trim()) {
        const term = searchQuery.trim();
        query = query.or(`customer_name.ilike.%${term}%,mobile.ilike.%${term}%,email.ilike.%${term}%`);
      }

      // Bulk-uploaded leads are a separate thing and stay out of the main
      // directory entirely -- viewing a specific batch's leads now happens
      // fully inside the Bulk Uploads page itself, not here.
      query = query.is('bulk_upload_id', null);

      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }
      if (projectFilter) {
        query = query.eq('project_id', projectFilter);
      }
      if (sourceFilter) {
        query = query.eq('source', sourceFilter);
      }
      if (ownerFilter) {
        query = query.eq('owner_id', ownerFilter);
      }

      // Apply Pagination
      const from = page * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to).order('created_at', { ascending: false });

      const { data, count, error: fetchError } = await query;

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      setLeads(data || []);
      setTotalCount(count || 0);
    } catch (err: any) {
      console.error('Error fetching leads:', err);
      setError(err.message || 'An unexpected error occurred while fetching leads.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [searchQuery, statusFilter, projectFilter, sourceFilter, ownerFilter, page, pageSize]);

  // Resolve the current user's employee record, needed to attribute call logs.
  useEffect(() => {
    if (!user) return;
    supabase
      .from('employees')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) reportQueryError('Leads: current employee lookup', error);
        else setCurrentEmployeeId(data?.id || null);
      });
  }, [user]);

  // Channel partner adding their own lead: resolve their own CP id, then
  // scope the Project dropdown to their channel_partner_projects assignments.
  // Also resolve the Sourcing Manager allocated to them (channel_partners.
  // sourcing_manager, set by super_admin/site_head on the CP record) so
  // their New Lead form's Sourcing Manager field can auto-fill instead of
  // being manually picked.
  const [myCpSourcingManagerId, setMyCpSourcingManagerId] = useState<string | null>(null);
  useEffect(() => {
    if (!isChannelPartner || !user?.id) return;
    supabase.from('channel_partners').select('id, sourcing_manager').eq('user_id', user.id).maybeSingle()
      .then(({ data: ownCp, error }) => {
        if (error) { reportQueryError('Leads: own channel partner lookup', error); return; }
        if (!ownCp) return;
        setMyCpId(ownCp.id);
        setMyCpSourcingManagerId(ownCp.sourcing_manager);
        supabase.from('channel_partner_projects').select('project_id, projects(project_name)').eq('channel_partner_id', ownCp.id)
          .then(({ data: assignments, error: assignErr }) => {
            if (assignErr) { reportQueryError('Leads: CP project assignments', assignErr); return; }
            const m = new Map<string, string>();
            (assignments || []).forEach((a: any) => {
              if (a.project_id) m.set(a.project_id, a.projects?.project_name || 'Unnamed Project');
            });
            setMyCpProjectMap(m);
          });
      });
  }, [isChannelPartner, user?.id]);

  // Load configuration and data
  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Trigger sync refetch
  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    await fetchFilterOptions();
    await fetchLeads();
  };

  const handleDeleteLead = async (lead: Lead) => {
    if (window.confirm(`Are you sure you want to permanently delete lead "${lead.customer_name}"?`)) {
      setLoading(true);
      try {
        const { data, error } = await supabase.from('leads').delete().eq('id', lead.id).select();
        if (error) throw error;
        
        if (!data || data.length === 0) {
          throw new Error('Permission denied. You do not have the required roles to delete this lead.');
        }

        setNotification({ type: 'success', message: 'Lead deleted successfully.' });
        fetchLeads();
      } catch (err: any) {
        setNotification({ type: 'error', message: err.message || 'Failed to delete lead' });
      } finally {
        setLoading(false);
      }
    }
  };

  const openLogCall = () => {
    setCallOutcome('connected');
    setCallNotes('');
    setCallError(null);
    setCallStartedAt(null);
    setCallEndedAt(null);
    setCallElapsedSec(0);
    setCallLocation(null);
    setCallLocationError(null);
    setIsLogCallOpen(true);
  };

  const openWhatsApp = async (lead: Lead) => {
    setWaLead(lead);
    setWaMessage(`Hi ${lead.customer_name || 'there'}, `);
    setWaError(null);
    setWaSuccess(false);
    setWaGatewayOnline(null);
    setWaAttachment(null);
    setWaUploading(false);

    // Surface up front whether the gateway is actually running, rather
    // than silently queueing a message that will sit unsent. The gateway
    // heartbeats into whatsapp_session every few seconds; a stale
    // heartbeat means the process isn't up. Same 20s staleness threshold
    // Settings.tsx uses.
    const { data } = await supabase
      .from('whatsapp_session')
      .select('status, last_heartbeat_at')
      .eq('id', 'default')
      .maybeSingle();
    const fresh = data?.last_heartbeat_at
      ? Date.now() - new Date(data.last_heartbeat_at).getTime() < 20000
      : false;
    setWaGatewayOnline(fresh && data?.status === 'open');
  };

  const handleWaFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so re-picking the same file still fires onChange.
    e.target.value = '';
    if (!file) return;

    setWaUploading(true);
    setWaError(null);
    try {
      // Replace rather than accumulate: WhatsApp sends one media item per
      // message, so a second pick supersedes the first. Clean up the
      // orphaned upload so it doesn't linger in storage unreferenced.
      const previous = waAttachment;
      const uploaded = await uploadWhatsAppAttachment(file);
      setWaAttachment(uploaded);
      if (previous) removeWhatsAppAttachment(previous.path);
    } catch (err: any) {
      setWaError(err.message || 'Failed to upload the attachment.');
    } finally {
      setWaUploading(false);
    }
  };

  const handleWaRemoveAttachment = async () => {
    const current = waAttachment;
    setWaAttachment(null);
    if (current) removeWhatsAppAttachment(current.path);
  };

  const handleWhatsAppSend = async () => {
    // Guard against a double-fire (fast double-click, or Enter landing on
    // an already-pressed button) queueing the same message twice. The
    // disabled attribute alone isn't enough — React sets it on the next
    // render, so a second click landing in the same tick still gets
    // through. Confirmed live: a rapid double-click produced two
    // whatsapp_outbox rows, i.e. the lead would have received the message
    // twice.
    if (waSubmitting || waSuccess) return;
    if (!waLead) return;
    const phone = (waLead.mobile || '').trim();
    if (!phone) {
      setWaError('This lead has no mobile number on record.');
      return;
    }
    // With an attachment the text becomes the caption and is optional —
    // sending a brochure with no covering note is legitimate.
    if (!waMessage.trim() && !waAttachment) {
      setWaError('Please type a message or attach a file to send.');
      return;
    }

    setWaSubmitting(true);
    setWaError(null);
    try {
      const { error } = await supabase.from('whatsapp_outbox').insert([{
        to_phone: phone,
        message: waMessage.trim(),
        lead_id: waLead.id,
        status: 'queued',
        created_by: user?.id || null,
        media_path: waAttachment?.path || null,
        media_type: waAttachment?.type || null,
        media_filename: waAttachment?.filename || null,
      }]);
      if (error) throw error;

      // Sending a WhatsApp message is a real touchpoint — reflect it on
      // the lead the same way logging a call does, so follow-up ordering
      // and the stale-lead views stay accurate.
      await supabase.from('leads').update({ last_contact_at: new Date().toISOString() }).eq('id', waLead.id);

      setWaSuccess(true);
      setWaMessage('');
      // Deliberately NOT deleting the uploaded file here — the queued row
      // still points at it and the gateway needs it at send time.
      setWaAttachment(null);
    } catch (err: any) {
      reportQueryError('Leads: WhatsApp send', err);
      setWaError(err.message || 'Failed to queue the WhatsApp message.');
    } finally {
      setWaSubmitting(false);
    }
  };

  // Stop the running interval (call ended, modal closed, or component unmounts).
  useEffect(() => {
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, []);

  const startCall = () => {
    const startedAt = Date.now();
    setCallStartedAt(startedAt);
    setCallEndedAt(null);
    setCallElapsedSec(0);
    callTimerRef.current = setInterval(() => {
      setCallElapsedSec(Math.round((Date.now() - startedAt) / 1000));
    }, 1000);

    // Best-effort GPS capture at call start — never blocks the call itself.
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCallLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setCallLocationError('Location unavailable (permission denied or not supported).'),
        { timeout: 8000 }
      );
    } else {
      setCallLocationError('Location not supported by this browser.');
    }
  };

  const endCall = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    setCallEndedAt(Date.now());
  };

  const handleLogCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !callStartedAt || !callEndedAt) return;
    setCallSubmitting(true);
    setCallError(null);
    try {
      const { error } = await supabase.from('call_logs').insert([{
        employee_id: currentEmployeeId,
        lead_id: selectedLead.id,
        channel_partner_id: selectedLead.channel_partner_id || null,
        direction: 'outbound',
        outcome: callOutcome,
        duration_seconds: Math.max(0, Math.round((callEndedAt - callStartedAt) / 1000)),
        notes: callNotes.trim() || null,
        called_at: new Date(callStartedAt).toISOString(),
        latitude: callLocation?.lat ?? null,
        longitude: callLocation?.lng ?? null,
        location_captured_at: callLocation ? new Date().toISOString() : null,
      }]);
      if (error) throw error;

      // Leave a corroborating trace on the lead itself, same as Followups
      // already does — a call that never touched last_contact_at is one of
      // the fraud signals flagged in Reports.
      await supabase.from('leads').update({ last_contact_at: new Date().toISOString() }).eq('id', selectedLead.id);

      setNotification({ type: 'success', message: 'Call logged.' });
      setIsLogCallOpen(false);
    } catch (err: any) {
      setCallError(err.message || 'Failed to log call.');
    } finally {
      setCallSubmitting(false);
    }
  };

  // Reset page when filters change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setPage(0);
  };

  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<string>>) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    setter(e.target.value);
    setPage(0);
  };

  // URL query parameter detector to open creation modal. Guarded by the
  // same role check as the "+ New Lead" button itself -- without this,
  // /leads?new=true (e.g. Dashboard's own "+ New Lead" button, or just
  // typing the URL) would open the create modal for every role regardless
  // of whether the button was even shown to them.
  const hasCreateAccess = canCreateLead(role);
  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      if (hasCreateAccess) {
        if (isChannelPartner) {
          setSelectedSource('channel_partner');
          setSelectedChannelPartnerId(myCpId || '');
          setSourcingManagerId(myCpSourcingManagerId || '');
        }
        setIsCreateOpen(true);
      }
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, hasCreateAccess, isChannelPartner, myCpId, myCpSourcingManagerId]);

  // Alert auto-dismiss timer
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Helper to generate the next unique lead number based on existing database values
  const generateLeadNumber = (maxLeadNumber: string | null): string => {
    if (!maxLeadNumber) {
      return 'LD-10001'; // Default start sequence
    }

    // Try to parse prefix and numeric sequence (e.g. LD-10042)
    const match = maxLeadNumber.match(/^([a-zA-Z\-_]*?)(\d+)$/);
    if (match) {
      const prefix = match[1];
      const numStr = match[2];
      const nextNum = parseInt(numStr, 10) + 1;
      const paddedNum = String(nextNum).padStart(numStr.length, '0');
      return `${prefix}${paddedNum}`;
    }

    // If format is non-standard, return a timestamp-based string
    return `LD-${Date.now()}`;
  };

  // Populates the shared create/edit form's state from an existing lead
  // and opens it in edit mode.
  const openEditLead = (lead: Lead) => {
    setEditingLead(lead);
    setCustomerName(lead.customer_name || '');
    setMobile(lead.mobile || '');
    setEmail((lead as any).email || '');
    setSelectedProjectId(lead.project_id || '');
    setSelectedOwnerId(lead.owner_id || '');
    setSelectedSource(lead.source || 'walk_in');
    setSelectedStatus(lead.status || 'new');
    setSelectedChannelPartnerId(lead.channel_partner_id || '');
    setNotes(lead.notes || '');
    setVisitType((lead as any).visit_type || 'Fresh');
    setVisitDate((lead as any).visit_date || new Date().toISOString().split('T')[0]);
    setResidenceAddress((lead as any).residence_address || '');
    setProfession((lead as any).occupation || '');
    setRequirementDetails((lead as any).configuration || '');
    setBudget((lead as any).budget || '');
    setSourcingManagerId((lead as any).sourcing_manager_id || '');
    setTelecallerId((lead as any).telecaller_id || '');
    setNextFollowupAt((lead as any).next_followup_at ? (lead as any).next_followup_at.slice(0, 16) : '');
    setCreateError(null);
    setIsCreateOpen(true);
  };

  // Form submission logic — inserts a new lead, or updates the one being
  // edited. Source is included in the update payload regardless of
  // canEditSource: if it's unchanged the DB trigger never fires (it only
  // checks when NEW.source IS DISTINCT FROM OLD.source), and if a
  // non-privileged user's control was disabled it will already equal the
  // original value, so this can't be used to sneak a change through — the
  // trigger is the real enforcement either way.
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setCreateError('Customer Name is required.');
      return;
    }
    if (!mobile.trim()) {
      setCreateError('Mobile Number is required.');
      return;
    }
    if (!selectedProjectId) {
      setCreateError('Please select a project.');
      return;
    }
    if (isChannelPartner ? !myCpSourcingManagerId : !sourcingManagerId) {
      setCreateError(isChannelPartner
        ? 'No Sourcing Manager is allocated to you yet — contact an admin.'
        : 'Please select a Sourcing Manager.');
      return;
    }

    setCreateError(null);
    setCreateLoading(true);

    try {
      const sharedFields = {
        customer_name: customerName.trim(),
        mobile: mobile.trim(),
        email: email.trim() || null,
        project_id: selectedProjectId || null,
        // Included even when the source control is disabled for this
        // user — it's just their unchanged original value in that case,
        // so it triggers no actual change and the DB trigger stays quiet.
        // A non-privileged user attempting to bypass the disabled control
        // via devtools would still be rejected by
        // enforce_lead_source_change_trigger regardless of what this sends.
        source: selectedSource || null,
        owner_id: selectedOwnerId || null,
        status: selectedStatus || 'new',
        notes: notes.trim() || null,
        channel_partner_id: selectedChannelPartnerId || null,
        visit_type: visitType,
        visit_date: visitDate || null,
        residence_address: residenceAddress.trim() || null,
        occupation: profession || null,
        configuration: requirementDetails || null,
        budget: budget.trim() || null,
        sourcing_manager_id: sourcingManagerId || null,
        telecaller_id: telecallerId || null,
        next_followup_at: nextFollowupAt ? new Date(nextFollowupAt).toISOString() : null,
      };

      let insertedLead: { id: string } | null = null;

      if (editingLead) {
        const { error: updateError } = await supabase
          .from('leads')
          .update(sharedFields)
          .eq('id', editingLead.id);
        if (updateError) throw new Error(updateError.message);
      } else {
        // 1. Fetch the current highest lead_number from Supabase
        const { data: maxLeadData, error: maxLeadError } = await supabase
          .from('leads')
          .select('lead_number')
          .order('lead_number', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (maxLeadError) {
          reportQueryError('Leads: next lead number', maxLeadError);
        }

        // 2. Generate the next lead number
        const nextLeadNumber = generateLeadNumber(maxLeadData?.lead_number || null);

        // 3. Insert record supplying generated lead_number and selected project UUID
        const { data, error: insertError } = await supabase
          .from('leads')
          .insert([{ ...sharedFields, lead_number: nextLeadNumber, created_by: user?.id || null }])
          .select('id')
          .single();

        if (insertError) throw new Error(insertError.message);
        insertedLead = data;
      }

      // Channel Partner lead claim: 45-day window + verification code.
      // Non-fatal if this fails — the lead itself is already saved; the CP
      // attribution/commission tracking is a secondary record. Only on
      // creation — editing an existing lead's CP attribution afterward
      // doesn't re-trigger a new claim/verification code.
      if (!editingLead && selectedChannelPartnerId && insertedLead?.id) {
        const verificationCode = Math.random().toString(36).slice(2, 8).toUpperCase();
        const claimExpiresAt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
        const { data: claimRow, error: claimErr } = await supabase
          .from('cp_leads')
          .insert([{
            cp_id: selectedChannelPartnerId,
            lead_id: insertedLead.id,
            project_id: selectedProjectId || null,
            status: 'pending',
            claim_expires_at: claimExpiresAt,
            verification_code: verificationCode,
          }])
          .select('id')
          .single();
        if (claimErr) {
          reportQueryError('Leads: channel partner claim record', claimErr);
        } else if (mobile.trim()) {
          // Send the verification code to the CLIENT (the lead), not the
          // CP — they show it at site visit to confirm the referral. Enqueued
          // into whatsapp_outbox; the standalone gateway (whatsapp-gateway/)
          // picks it up and sends it, throttled.
          const { error: outboxErr } = await supabase
            .from('whatsapp_outbox')
            .insert([{
              to_phone: mobile.trim(),
              message: `Thank you for your interest! Your reference code is ${verificationCode}. Please share this code with our team during your site visit.`,
              lead_id: insertedLead.id,
              cp_lead_id: claimRow?.id || null,
              status: 'queued',
            }]);
          if (outboxErr) {
            reportQueryError('Leads: verification code WhatsApp send', outboxErr);
          }
        }
      }

      // Close modal & clear input fields
      const wasEditing = !!editingLead;
      closeCreateModal();

      // Refresh list
      setPage(0);
      await fetchLeads();

      setNotification({
        type: 'success',
        message: wasEditing ? 'Lead updated successfully!' : 'New lead record created successfully!'
      });
    } catch (err: any) {
      console.error('Detailed Supabase Lead creation error:', err);
      // Clean up PostgreSQL constraint errors for the user
      if (err.message && err.message.toLowerCase().includes('violates not-null constraint')) {
        setCreateError('Database Insertion Denied: Please make sure a valid Project is selected and all other required fields are filled out.');
      } else if (err.message && err.message.toLowerCase().includes('already exists for this project')) {
        // Raised by prevent_duplicate_lead_phone_trigger — dedup is
        // project-scoped, so the same number is fine on a different
        // project. Strip the internal lead id before showing it.
        setCreateError('A lead with this mobile number already exists for this project. The same number can still be added under a different project.');
      } else if (err.message && err.message.toLowerCase().includes('only super admin or site head can change')) {
        // Raised by enforce_lead_source_change_trigger.
        setCreateError('Only Super Admin or Site Head can change a lead\'s source once it has been added.');
      } else {
        setCreateError(err.message || 'Database connection error occurred while inserting lead.');
      }
    } finally {
      setCreateLoading(false);
    }
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setEditingLead(null);
    setCreateError(null);
    setCustomerName('');
    setMobile('');
    setEmail('');
    setSelectedProjectId('');
    setSelectedOwnerId('');
    setSelectedSource('walk_in');
    setSelectedStatus('new');
    setSelectedChannelPartnerId('');
    setNotes('');
    setVisitType('Fresh');
    setVisitDate(new Date().toISOString().split('T')[0]);
    setResidenceAddress('');
    setProfession('');
    setRequirementDetails('');
    setBudget('');
    setSourcingManagerId('');
    setTelecallerId('');
    setNextFollowupAt('');
  };

  // Pagination bounds
  const startRange = page * pageSize + 1;
  const endRange = Math.min((page + 1) * pageSize, totalCount);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Leads Directory</h2>
          <p className="text-slate-500 text-sm">View, search, filter, and audit live CRM lead entries.</p>
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
          
          {hasCreateAccess && (
            <button
              onClick={() => {
                if (isChannelPartner) {
                  setSelectedSource('channel_partner');
                  setSelectedChannelPartnerId(myCpId || '');
                  setSourcingManagerId(myCpSourcingManagerId || '');
                }
                setIsCreateOpen(true);
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md shadow-indigo-600/10 hover:shadow-lg transition-all focus:outline-none"
            >
              + New Lead
            </button>
          )}
        </div>
      </div>

      {/* Success/Error Notification toast */}
      {notification && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200 shadow-sm">
          <div className="flex items-center space-x-2.5">
            <svg className="h-5 w-5 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-semibold">{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600 focus:outline-none">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Database Error State Display */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-4 flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-sm">Database Fetch Error</h4>
            <p className="text-xs text-rose-700 mt-0.5">
              {error}. Please check your connection parameters or Supabase database table schema.
            </p>
          </div>
        </div>
      )}

      {/* FILTER & SEARCH TOOLBAR */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Search Input */}
          <div className="relative md:col-span-2">
            <Search className="absolute inset-y-0 left-3 h-4 w-4 text-slate-400 self-center top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by customer name, mobile, email..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
            />
          </div>

          {/* Project Filter */}
          <div>
            <select
              value={projectFilter}
              onChange={handleFilterChange(setProjectFilter)}
              className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all w-full"
            >
              <option value="">All Projects</option>
              {Array.from(projectMap.entries()).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={handleFilterChange(setStatusFilter)}
              className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all w-full"
            >
              <option value="">All Statuses</option>
              {uniqueStatuses.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          {/* Source Filter */}
          <div>
            <select
              value={sourceFilter}
              onChange={handleFilterChange(setSourceFilter)}
              className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all w-full"
            >
              <option value="">All Sources</option>
              {uniqueSources.map(source => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Second Row Filters: Sourcing Manager */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2">
            <select
              value={ownerFilter}
              onChange={handleFilterChange(setOwnerFilter)}
              className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all w-full"
            >
              <option value="">All Sourcing Managers</option>
              {Array.from(profileMap.entries()).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* LEADS TABLE CONTAINER */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col">
        {loading ? (
          <div className="py-24 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-100 border-t-indigo-600 mx-auto mb-4"></div>
            <p className="text-slate-500 font-medium">Fetching secure leads...</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3.5 px-6">Lead Name</th>
                    <th className="py-3.5 px-6">Phone</th>
                    <th className="py-3.5 px-6">Project</th>
                    <th className="py-3.5 px-6">Lead Source</th>
                    <th className="py-3.5 px-6">Sourcing Manager</th>
                    <th className="py-3.5 px-6">Allocated To</th>
                    <th className="py-3.5 px-6">Status</th>
                    <th className="py-3.5 px-6">Created Date</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leads.length > 0 ? (
                    leads.map((lead) => (
                      <React.Fragment key={lead.id}>
                      <tr className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-6 font-semibold text-slate-900">{lead.customer_name || 'Unnamed Client'}</td>
                        <td className="py-4 px-6 text-sm text-slate-600">{lead.mobile || 'N/A'}</td>
                        <td className="py-4 px-6 text-sm text-slate-600">
                          {projectMap.get(lead.project_id || '') || 'N/A'}
                        </td>
                        <td className="py-4 px-6 text-sm text-slate-600">
                          <span className="capitalize">{lead.source || 'N/A'}</span>
                          {lead.channel_partner_id && (
                            <span className="block text-xs font-semibold text-indigo-600 mt-0.5">
                              {channelPartnerMap.get(lead.channel_partner_id) || 'CP'}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-sm text-slate-600">
                          {profileMap.get(lead.sourcing_manager_id || '') || 'N/A'}
                        </td>
                        <td className="py-4 px-6 text-sm text-slate-600">
                          {profileMap.get(lead.owner_id || '') || 'N/A'}
                        </td>
                        <td className="py-4 px-6">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            lead.status?.toLowerCase() === 'booking_done' ? 'bg-emerald-50 text-emerald-700' :
                            (lead.status?.toLowerCase() === 'lost' || lead.status?.toLowerCase() === 'junk') ? 'bg-rose-50 text-rose-700' :
                            (lead.status?.toLowerCase() === 'site_visit_planned' || lead.status?.toLowerCase() === 'site_visit_done') ? 'bg-amber-50 text-amber-700' :
                            'bg-indigo-50 text-indigo-700'
                          }`}>
                            {lead.status || 'new'}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-xs text-slate-400">
                          {new Date(lead.created_at).toLocaleDateString('en-IN')}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <a
                              href={lead.mobile ? `tel:${lead.mobile}` : undefined}
                              title={lead.mobile ? 'Call directly' : 'No mobile number on record'}
                              className={`inline-flex items-center justify-center p-1.5 border border-slate-200 rounded-lg transition-colors focus:outline-none ${lead.mobile ? 'text-blue-600 hover:bg-blue-50 hover:border-blue-200' : 'opacity-40 cursor-not-allowed text-slate-400'}`}
                            >
                              <Phone className="h-3.5 w-3.5" />
                            </a>
                            <button
                              onClick={() => openWhatsApp(lead)}
                              disabled={!lead.mobile}
                              title={lead.mobile ? 'Send WhatsApp message' : 'No mobile number on record'}
                              className="inline-flex items-center justify-center p-1.5 border border-slate-200 rounded-lg text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200 transition-colors focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </button>
                            {canEditLeadRecord(role) && (
                              <button
                                onClick={() => openEditLead(lead)}
                                title="Edit lead"
                                className="inline-flex items-center justify-center p-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors focus:outline-none"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {isSuperAdmin(role) && (
                              <button
                                onClick={() => handleDeleteLead(lead)}
                                title="Delete lead"
                                className="inline-flex items-center justify-center p-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-red-600 transition-colors focus:outline-none"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedLead(lead)}
                              className="inline-flex items-center space-x-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors focus:outline-none"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>View</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-20 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center space-y-3">
                          <div className="bg-slate-50 p-4 rounded-full text-slate-300">
                            <Users className="h-8 w-8" />
                          </div>
                          <p className="text-slate-500 font-semibold text-sm">No Leads Found</p>
                          <p className="text-xs max-w-sm text-slate-400">
                            No records in the public.leads table fit your active filters or search terms.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalCount > 0 && (
              <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">
                  Showing <span className="font-semibold text-slate-800">{startRange}</span> to{' '}
                  <span className="font-semibold text-slate-800">{endRange}</span> of{' '}
                  <span className="font-semibold text-slate-800">{totalCount}</span> leads
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setPage(prev => Math.max(prev - 1, 0))}
                    disabled={page === 0}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="h-4.5 w-4.5" />
                  </button>
                  <span className="text-xs font-semibold text-slate-700">
                    Page {page + 1} of {Math.ceil(totalCount / pageSize)}
                  </span>
                  <button
                    onClick={() => setPage(prev => prev + 1)}
                    disabled={(page + 1) * pageSize >= totalCount}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="h-4.5 w-4.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* READ-ONLY VIEW DETAIL MODAL */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setSelectedLead(null)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Users className="h-5 w-5 text-indigo-400" />
                <span className="font-bold tracking-tight">Lead Audit Details</span>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              <div className="space-y-4">
                <h4 className="text-lg font-bold text-slate-900">
                  {selectedLead.customer_name || 'Unnamed Client'}
                </h4>
                <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
                  Status: {selectedLead.status || 'new'}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-5">
                {/* Contact phone */}
                <div className="flex items-start space-x-2.5 text-slate-700">
                  <Phone className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                  <div>
                    <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Mobile Number</span>
                    <span className="text-sm font-semibold">{selectedLead.mobile || 'N/A'}</span>
                  </div>
                </div>

                {/* Email address */}
                <div className="flex items-start space-x-2.5 text-slate-700">
                  <Mail className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                  <div>
                    <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Email Address</span>
                    <span className="text-sm font-semibold break-all">{selectedLead.email || 'N/A'}</span>
                  </div>
                </div>

                {/* Project */}
                <div className="flex items-start space-x-2.5 text-slate-700">
                  <Bookmark className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                  <div>
                    <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Associated Project</span>
                    <span className="text-sm font-semibold">
                      {projectMap.get(selectedLead.project_id || '') || 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Sourcing Manager */}
                <div className="flex items-start space-x-2.5 text-slate-700">
                  <Users className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                  <div>
                    <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Sourcing Manager</span>
                    <span className="text-sm font-semibold">
                      {profileMap.get((selectedLead as any).sourcing_manager_id || '') || 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Allocated To (Closing Manager) */}
                <div className="flex items-start space-x-2.5 text-slate-700">
                  <Users className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                  <div>
                    <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Allocated To</span>
                    <span className="text-sm font-semibold">
                      {profileMap.get(selectedLead.owner_id || '') || 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Lead Source */}
                <div className="flex items-start space-x-2.5 text-slate-700">
                  <FileText className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                  <div>
                    <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Lead Source</span>
                    <span className="text-sm font-semibold capitalize">{selectedLead.source || 'N/A'}</span>
                  </div>
                </div>

                {/* Channel Partner */}
                {selectedLead.channel_partner_id && (
                  <div className="flex items-start space-x-2.5 text-slate-700">
                    <Users className="h-4 w-4 text-indigo-500 mt-1 flex-shrink-0" />
                    <div>
                      <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Channel Partner Attribution</span>
                      <span className="text-sm font-semibold text-indigo-600">
                        {channelPartnerMap.get(selectedLead.channel_partner_id) || 'N/A'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Created Date */}
                <div className="flex items-start space-x-2.5 text-slate-700">
                  <Calendar className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                  <div>
                    <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Created Date</span>
                    <span className="text-sm font-semibold">
                      {new Date(selectedLead.created_at).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="border-t border-slate-100 pt-5">
                <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider mb-2">Audit Notes / Comments</span>
                <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-sm text-slate-700 leading-relaxed max-h-[150px] overflow-y-auto">
                  {selectedLead.notes || 'No audit notes available for this lead.'}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-2 border-t border-slate-100">
              {canEditLeadRecord(role) && (
                <button
                  onClick={() => { openEditLead(selectedLead); setSelectedLead(null); }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-sm transition-all focus:outline-none"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
              )}
              <button
                onClick={() => openWhatsApp(selectedLead)}
                disabled={!selectedLead.mobile}
                title={selectedLead.mobile ? 'Send WhatsApp message' : 'No mobile number on record'}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </button>
              <button
                onClick={openLogCall}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all focus:outline-none"
              >
                <PhoneCall className="h-3.5 w-3.5" /> Log Call
              </button>
              <button
                onClick={() => setSelectedLead(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition-all focus:outline-none"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

        {waLead && (
          <div className="fixed inset-0 z-[70] overflow-y-auto flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !waSubmitting && setWaLead(null)} />
            <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="bg-emerald-600 text-white px-6 py-4 flex items-center justify-between">
                <span className="font-bold tracking-tight flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" /> Send WhatsApp Message
                </span>
                <button onClick={() => !waSubmitting && setWaLead(null)} className="p-1 rounded-lg text-emerald-200 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                  <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Sending To</span>
                  <span className="text-sm font-semibold text-slate-800">
                    {waLead.customer_name || 'Unnamed Client'} — {waLead.mobile || 'No number'}
                  </span>
                </div>

                {waGatewayOnline === false && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>
                      WhatsApp isn't connected right now, so this message will sit in the queue until it is.
                      Connect it under <strong>Settings → WhatsApp Connection</strong>.
                    </span>
                  </div>
                )}

                {waSuccess ? (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4 text-sm">
                    Message queued. It will be delivered from the connected WhatsApp account shortly.
                  </div>
                ) : (
                  <div>
                    <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Message</label>
                    <textarea
                      value={waMessage}
                      onChange={(e) => setWaMessage(e.target.value)}
                      rows={5}
                      placeholder="Type the message you want to send..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">{waMessage.trim().length} characters</p>

                    {/* Attachment */}
                    <div className="mt-3">
                      <input
                        ref={waFileInputRef}
                        type="file"
                        className="hidden"
                        onChange={handleWaFilePick}
                      />
                      {waAttachment ? (
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                          <Paperclip className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-slate-700 truncate">{waAttachment.filename}</div>
                            <div className="text-[10px] text-slate-400 capitalize">
                              {waAttachment.type} · {formatBytes(waAttachment.sizeBytes)}
                            </div>
                          </div>
                          <button
                            onClick={handleWaRemoveAttachment}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex-shrink-0"
                            title="Remove attachment"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => waFileInputRef.current?.click()}
                          disabled={waUploading}
                          className="flex items-center gap-1.5 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs font-semibold text-slate-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors disabled:opacity-50 w-full justify-center"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          {waUploading ? 'Uploading...' : 'Attach a file (image, PDF, video…)'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {waError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg px-3 py-2">{waError}</div>
                )}
              </div>

              <div className="bg-slate-50 px-6 py-4 flex justify-end gap-2 border-t border-slate-100">
                <button
                  onClick={() => setWaLead(null)}
                  disabled={waSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl disabled:opacity-50"
                >
                  {waSuccess ? 'Close' : 'Cancel'}
                </button>
                {!waSuccess && (
                  <button
                    onClick={handleWhatsAppSend}
                    disabled={waSubmitting || waUploading || (!waMessage.trim() && !waAttachment)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="h-3.5 w-3.5" /> {waSubmitting ? 'Sending...' : 'Send Message'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {isLogCallOpen && (
          <div className="fixed inset-0 z-[70] overflow-y-auto flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !callSubmitting && setIsLogCallOpen(false)} />
            <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
                <span className="font-bold tracking-tight">Log Call</span>
                <button onClick={() => !callSubmitting && setIsLogCallOpen(false)} className="p-1 rounded-lg text-indigo-200 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleLogCall}>
                <div className="p-6 space-y-4">
                  {callError && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-800 px-3 py-2 rounded-lg text-xs">{callError}</div>
                  )}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Outcome</label>
                    <select
                      value={callOutcome}
                      onChange={(e) => setCallOutcome(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    >
                      <option value="connected">Connected</option>
                      <option value="not_reachable">Not Reachable</option>
                      <option value="busy">Busy</option>
                      <option value="switched_off">Switched Off</option>
                      <option value="call_back_later">Call Back Later</option>
                      <option value="wrong_number">Wrong Number</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Call Timer</label>
                    <div className="rounded-lg border border-slate-200 px-3 py-3 flex items-center justify-between bg-slate-50">
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-mono font-bold ${callStartedAt && !callEndedAt ? 'text-indigo-600' : 'text-slate-700'}`}>
                          {String(Math.floor(callElapsedSec / 60)).padStart(2, '0')}:{String(callElapsedSec % 60).padStart(2, '0')}
                        </span>
                        {callStartedAt && !callEndedAt && (
                          <span className="flex items-center gap-1 text-xxs font-semibold text-indigo-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" /> Live
                          </span>
                        )}
                        {callEndedAt && (
                          <span className="text-xxs font-semibold text-emerald-600">Call ended</span>
                        )}
                      </div>
                      {!callStartedAt ? (
                        <button
                          type="button"
                          onClick={startCall}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold"
                        >
                          <Play className="h-3.5 w-3.5" /> Start Call
                        </button>
                      ) : !callEndedAt ? (
                        <button
                          type="button"
                          onClick={endCall}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold"
                        >
                          <Square className="h-3.5 w-3.5" /> End Call
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={startCall}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-white rounded-lg text-xs font-semibold"
                        >
                          <Play className="h-3.5 w-3.5" /> Redo
                        </button>
                      )}
                    </div>
                    <p className="text-xxs text-slate-400 mt-1.5">Duration is timed automatically and can't be typed in — this keeps the call log honest.</p>
                    <div className="flex items-center gap-1 mt-1.5 text-xxs">
                      <MapPin className="h-3 w-3 text-slate-400 flex-shrink-0" />
                      {callLocation ? (
                        <span className="text-emerald-600 font-medium">Location captured</span>
                      ) : callLocationError ? (
                        <span className="text-amber-600">{callLocationError}</span>
                      ) : (
                        <span className="text-slate-400">Location will be captured when you start the call.</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Notes</label>
                    <textarea
                      value={callNotes}
                      onChange={(e) => setCallNotes(e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>
                </div>
                <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsLogCallOpen(false)}
                    disabled={callSubmitting}
                    className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-100 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={callSubmitting || !callStartedAt || !callEndedAt}
                    title={!callStartedAt || !callEndedAt ? 'Start and end the call timer first' : undefined}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm disabled:opacity-50"
                  >
                    {callSubmitting ? 'Saving...' : 'Save Call Log'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      {/* CREATE LEAD MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={closeCreateModal} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-5xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">{editingLead ? 'Edit Lead' : 'Create New Lead'}</span>
              <button
                type="button"
                onClick={closeCreateModal}
                className="p-1 rounded-lg text-indigo-200 hover:text-white hover:bg-indigo-700 focus:outline-none transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateSubmit}>
              <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                {createError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-start space-x-2.5">
                    <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-medium leading-tight">{createError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                  {/* COLUMN 1: LEAD & CUSTOMER */}
                  <div className="space-y-4">
                    <h4 className="font-bold text-xs text-indigo-600 border-b border-slate-100 pb-1.5 uppercase tracking-wider">Lead & Customer</h4>
                    
                    {/* Fresh / Re Visit */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Fresh / Re Visit *</label>
                      <select
                        required
                        value={visitType}
                        onChange={(e) => setVisitType(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                      >
                        <option value="Fresh">Fresh</option>
                        <option value="Re Visit">Re Visit</option>
                      </select>
                    </div>

                    {/* Date */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Date *</label>
                      <input
                        type="date"
                        required
                        value={visitDate}
                        onChange={(e) => setVisitDate(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                      />
                    </div>

                    {/* Customer Name */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Customer Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="John Doe"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
                      />
                    </div>

                    {/* Mobile Number */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Mobile Number *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 9876543210"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
                      />
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Email</label>
                      <input
                        type="email"
                        placeholder="john@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
                      />
                    </div>

                    {/* Residence Address */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Residence Address *</label>
                      <textarea
                        required
                        placeholder="Full residential address..."
                        rows={2}
                        value={residenceAddress}
                        onChange={(e) => setResidenceAddress(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all resize-none"
                      />
                    </div>
                  </div>

                  {/* COLUMN 2: REQUIREMENTS & SOURCE */}
                  <div className="space-y-4">
                    <h4 className="font-bold text-xs text-indigo-600 border-b border-slate-100 pb-1.5 uppercase tracking-wider">Requirement & Source</h4>

                    {/* Profession */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Profession *</label>
                      <select
                        required
                        value={profession}
                        onChange={(e) => setProfession(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                      >
                        <option value="">Select Profession...</option>
                        <option value="Salaried">Salaried</option>
                        <option value="Self Employed">Self Employed</option>
                        <option value="Business Owner">Business Owner</option>
                        <option value="Professional (Doctor/Engineer/CA)">Professional (Doctor/Engineer/CA)</option>
                        <option value="Retired">Retired</option>
                        <option value="Homemaker">Homemaker</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    {/* Project */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Project *</label>
                      <select
                        required
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                      >
                        <option value="">Select Project...</option>
                        {(isChannelPartner ? myCpProjectMap : projectMap).size === 0 ? (
                          <option value="" disabled>No projects available</option>
                        ) : (
                          Array.from((isChannelPartner ? myCpProjectMap : projectMap).entries()).map(([id, name]) => (
                            <option key={id} value={id}>{name}</option>
                          ))
                        )}
                      </select>
                    </div>

                    {/* Details Of Requirement */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Details Of Requirement *</label>
                      <select
                        required
                        value={requirementDetails}
                        onChange={(e) => setRequirementDetails(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                      >
                        <option value="">Select Requirement...</option>
                        <option value="1 BHK Apartment">1 BHK Apartment</option>
                        <option value="2 BHK Apartment">2 BHK Apartment</option>
                        <option value="3 BHK Apartment">3 BHK Apartment</option>
                        <option value="4 BHK Apartment">4 BHK Apartment</option>
                        <option value="Penthouse">Penthouse</option>
                        <option value="Villa">Villa</option>
                        <option value="Plot">Plot</option>
                        <option value="Commercial Office">Commercial Office</option>
                        <option value="Commercial Shop">Commercial Shop</option>
                      </select>
                    </div>

                    {/* Budget */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Budget *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 50 Lakhs"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
                      />
                    </div>

                    {/* Source Of Inquiry — free to set at creation; once
                        the lead exists, only Super Admin / Site Head can
                        change it (enforced for real by
                        enforce_lead_source_change_trigger on the DB —
                        disabling the control here is just UX, not the
                        actual boundary). */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Source Of Inquiry *</label>
                      <select
                        required
                        disabled={isChannelPartner || (!!editingLead && !canEditSource)}
                        value={selectedSource}
                        onChange={(e) => {
                          setSelectedSource(e.target.value);
                          // Don't let a stale CP attribution silently ride
                          // along once the field hiding above hides it from view.
                          if (e.target.value !== 'channel_partner') setSelectedChannelPartnerId('');
                        }}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <option value="">Select Source...</option>
                        <option value="digital">Digital Marketing</option>
                        <option value="walk_in">Walk-in</option>
                        <option value="referral">Referral</option>
                        <option value="channel_partner">Channel Partner</option>
                        <option value="direct">Direct</option>
                        <option value="newspaper">Newspaper Ad</option>
                        <option value="hoarding">Banner/Hoarding</option>
                        <option value="calling">Calling</option>
                      </select>
                      {editingLead && !canEditSource && (
                        <p className="text-[10px] text-amber-600 mt-1">Only Super Admin or Site Head can change the source of an existing lead.</p>
                      )}
                    </div>
                  </div>

                  {/* COLUMN 3: FOLLOW-UP & ALLOCATION */}
                  <div className="space-y-4">
                    <h4 className="font-bold text-xs text-indigo-600 border-b border-slate-100 pb-1.5 uppercase tracking-wider">Follow-up & Allocation</h4>

                    {/* Sourcing Manager is required for everyone, including
                        a channel partner -- but a CP doesn't pick one, it's
                        auto-filled from the Sourcing Manager allocated to
                        them on their Channel Partner record (super_admin/
                        site_head assign that during onboarding or later). */}
                    {isChannelPartner ? (
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Sourcing Manager *</label>
                        <div className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-100 text-slate-500 text-sm">
                          {sourcingManagerMap.get(myCpSourcingManagerId || '') || 'Not allocated yet'}
                        </div>
                        {!myCpSourcingManagerId && (
                          <p className="text-[10px] text-amber-600 mt-1">No Sourcing Manager is allocated to you yet — contact an admin before adding a lead.</p>
                        )}
                      </div>
                    ) : (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Sourcing Manager *</label>
                      <select
                        required
                        value={sourcingManagerId}
                        onChange={(e) => setSourcingManagerId(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                      >
                        <option value="">Select Sourcing Manager...</option>
                        {Array.from(sourcingManagerMap.entries()).map(([id, name]) => (
                          <option key={id} value={id}>{name}</option>
                        ))}
                      </select>
                    </div>
                    )}

                    {/* Presales (Telecaller), Allocated To, Status and
                        Follow-up Date are internal staff allocation fields
                        -- a channel partner adding their own lead has no
                        one to assign here; admin staff triage and allocate
                        it after it lands. */}
                    {!isChannelPartner && (
                      <>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Presales (Telecaller)</label>
                      <select
                        value={telecallerId}
                        onChange={(e) => setTelecallerId(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                      >
                        <option value="">Select Presales (Telecaller)...</option>
                        {Array.from(telecallerMap.entries()).map(([id, name]) => (
                          <option key={id} value={id}>{name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Allocated To *</label>
                      <select
                        required
                        value={selectedOwnerId}
                        onChange={(e) => setSelectedOwnerId(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                      >
                        <option value="">Select Owner...</option>
                        {Array.from(closingTeamMap.entries()).map(([id, name]) => (
                          <option key={id} value={id}>{name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Status *</label>
                      <select
                        required
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                      >
                        {/* Values must match the DB's lead_status enum exactly
                            (new, contacted, interested, hot, site_visit_planned,
                            site_visit_done, negotiation, booking_done,
                            not_reachable, call_back_later, lost, junk) --
                            'visit_scheduled'/'booked' here previously didn't
                            exist in that enum, so saving either one always
                            failed with a Postgres enum error. */}
                        <option value="new">New Lead</option>
                        <option value="contacted">Contacted</option>
                        <option value="interested">Interested</option>
                        <option value="hot">Hot</option>
                        <option value="site_visit_planned">Visit Scheduled</option>
                        <option value="site_visit_done">Visit Done</option>
                        <option value="negotiation">Negotiation</option>
                        <option value="booking_done">Booked</option>
                        <option value="not_reachable">Not Reachable</option>
                        <option value="call_back_later">Call Back Later</option>
                        <option value="lost">Lost</option>
                        <option value="junk">Junk</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Follow-up Date</label>
                      <input
                        type="date"
                        value={nextFollowupAt}
                        onChange={(e) => setNextFollowupAt(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-850 text-sm focus:bg-white focus:outline-none transition-all"
                      />
                    </div>
                      </>
                    )}

                    {/* Channel Partner Select — only relevant, and only
                        shown, when Source Of Inquiry is Channel Partner.
                        Locked to their own record when a CP is adding
                        their own lead (source is force-set above). */}
                    {selectedSource === 'channel_partner' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Channel Partner *</label>
                        <select
                          required
                          disabled={isChannelPartner}
                          value={selectedChannelPartnerId}
                          onChange={(e) => setSelectedChannelPartnerId(e.target.value)}
                          className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <option value="">Select Channel Partner...</option>
                          {channelPartners.map(cp => (
                            <option key={cp.id} value={cp.id}>
                              {cp.partner_code || ''} - {cp.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Remark Textarea (Full Width) */}
                <div className="text-left">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Remark</label>
                  <textarea
                    placeholder="Provide any additional follow-up remark or notes..."
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-850 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all resize-none"
                  />
                </div>
              </div>

              {/* Form Footer */}
              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/10 hover:shadow-lg disabled:opacity-50 transition-all focus:outline-none"
                >
                  {createLoading ? (editingLead ? 'Saving...' : 'Inserting...') : (editingLead ? 'Save Changes' : 'Create Lead')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
