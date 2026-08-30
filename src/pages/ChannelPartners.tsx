import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { reportQueryError } from '../services/queryLogger';
import { useAuth } from '../hooks/useAuth';
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit,
  UserX,
  UserCheck,
  Plus,
  X,
  AlertCircle,
  Users,
  CheckCircle,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Send,
  Trash2
} from 'lucide-react';

interface ChannelPartner {
  id: string;
  cp_code: string | null;
  partner_code: string | null;
  partner_type: string | null;
  partner_name: string | null;
  name: string | null;
  company_name: string | null;
  contact_person: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  rera_registration_number: string | null;
  rera_number: string | null;
  valid_from: string | null;
  valid_to: string | null;
  rera_valid_from: string | null;
  rera_valid_to: string | null;
  pan_number: string | null;
  gst_number: string | null;
  status: string | null;
  notes: string | null;
  sourcing_manager: string | null;
  created_at: string;
}

interface Lead {
  id: string;
  channel_partner_id: string | null;
}

interface Booking {
  id: string;
  channel_partner_id: string | null;
  booking_amount: number | null;
  total_payable_amount: number | null;
  status: string | null;
}

interface Commission {
  id: string;
  channel_partner_id: string;
  commission_amount: number;
  status: string;
}

interface CPRequest {
  id: string;
  submitted_by: string | null;
  submitted_by_name: string | null;
  partner_name: string;
  company_name: string | null;
  contact_person: string | null;
  phone: string;
  whatsapp_number: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  rera_number: string | null;
  pan_number: string | null;
  gst_number: string | null;
  notes: string | null;
  project_ids: string[] | null;
  sourcing_manager: string | null;
  status: string;  // pending | approved | rejected
  rejection_reason: string | null;
  created_at: string;
}



// Cryptographically secure random password generator for newly provisioned accounts
function generateRandomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

// Helper functions to parse values stored in notes/city fields
const parseNotesField = (notes: string | null, label: string) => {
  if (!notes) return '';
  const lines = notes.split('\n');
  const foundLine = lines.find(line => line.startsWith(`${label}:`));
  if (foundLine) {
    return foundLine.substring(label.length + 1).trim();
  }
  return '';
};

const parseCityField = (cityVal: string | null) => {
  if (!cityVal) return { city: '', state: '', pincode: '' };
  // Format: City, State - Pincode
  const matchWithPincode = cityVal.match(/^([^,]+),\s*([^-]+)-\s*(\d+)$/);
  if (matchWithPincode) {
    return {
      city: matchWithPincode[1].trim(),
      state: matchWithPincode[2].trim(),
      pincode: matchWithPincode[3].trim()
    };
  }
  // Format: City, State
  const matchWithState = cityVal.match(/^([^,]+),\s*(.+)$/);
  if (matchWithState) {
    return {
      city: matchWithState[1].trim(),
      state: matchWithState[2].trim(),
      pincode: ''
    };
  }
  return { city: cityVal, state: '', pincode: '' };
};

export const ChannelPartners: React.FC = () => {
  const navigate = useNavigate();
  const { role, user, assignedProjects } = useAuth();
  const isSuperAdmin = role === 'super_admin';

  // All logged-in users can submit a CP request.
  // Only super_admin / site_head can approve them and directly edit existing partners.
  const canApprove = role === 'super_admin' || role === 'site_head';

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  // Pagination state
  const [page, setPage] = useState(0);
  const [pageSize] = useState(10);

  // Data states
  const [partners, setPartners] = useState<ChannelPartner[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [projectsMap, setProjectsMap] = useState<Map<string, string>>(new Map());
  const [partnerProjectsList, setPartnerProjectsList] = useState<{ channel_partner_id: string; project_id: string }[]>([]);
  const [sourcingManagers, setSourcingManagers] = useState<{ id: string; name: string }[]>([]);
  const sourcingManagerMap = new Map(sourcingManagers.map(sm => [sm.id, sm.name]));
  const [cpRequests, setCpRequests] = useState<CPRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal open states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<ChannelPartner | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [newCPCredentials, setNewCPCredentials] = useState<{
    name: string;
    email: string;
    password: string;
    cpCode: string;
    phone: string;
    whatsappSentTo: string | null;
  } | null>(null);
  const [cpWaSending, setCpWaSending] = useState(false);
  const [cpWaSent, setCpWaSent] = useState(false);
  // Reject modal
  const [rejectingRequest, setRejectingRequest] = useState<CPRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null); // id being processed

  // Deactivation confirmation modal states
  const [confirmToggleCp, setConfirmToggleCp] = useState<ChannelPartner | null>(null);

  // Form Field states
  const [partnerName, setPartnerName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappNum, setWhatsappNum] = useState('');        // NEW: separate WA number
  const [sameAsPhone, setSameAsPhone] = useState(true);     // toggle: use phone as WA
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [reraNumber, setReraNumber] = useState('');
  const [reraValidFrom, setReraValidFrom] = useState('');
  const [reraValidTo, setReraValidTo] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [status, setStatus] = useState('active');
  const [notes, setNotes] = useState('');
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [formSourcingManagerId, setFormSourcingManagerId] = useState('');

  // Fetch all master and override mappings
  const fetchData = useCallback(async () => {
    setError(null);
    setLoading(true);

    // 1. Fetch channel partners
    try {
      const { data, error: cpErr } = await supabase
        .from('channel_partners')
        .select('*')
        .order('created_at', { ascending: false });

      if (cpErr) {
        console.error("CHANNEL PARTNER LOAD ERROR", {
          message: cpErr.message,
          details: cpErr.details,
          hint: cpErr.hint,
          code: cpErr.code
        });
        throw cpErr;
      }
      setPartners(data || []);
    } catch (err: any) {
      console.error('Failed to query channel_partners table:', err);
      setError(`Failed to load channel partners: [${err.code || 'DB_ERROR'}] ${err.message || 'Database connection error'}`);
      setLoading(false);
      return;
    }

    // 2. Fetch Leads reference (independent catch)
    try {
      const { data, error: leadErr } = await supabase
        .from('leads')
        .select('id, channel_partner_id');
      if (leadErr) {
        reportQueryError('Channel Partners: Leads referral link', leadErr);
      } else {
        setLeads(data || []);
      }
    } catch (err) {
      reportQueryError('Channel Partners: Leads referral link', err);
    }

    // 3. Fetch Bookings reference (independent catch)
    try {
      const { data, error: bookingErr } = await supabase
        .from('bookings')
        .select('id, channel_partner_id, booking_amount, total_payable_amount, status');
      if (bookingErr) {
        reportQueryError('Channel Partners: Bookings referral link', bookingErr);
      } else {
        setBookings(data || []);
      }
    } catch (err) {
      reportQueryError('Channel Partners: Bookings referral link', err);
    }

    // 4. Fetch Referral Fees (independent catch)
    // FIX: 'commission_obligations' does not exist in the live database —
    // this was the source of the reported 'no obligation' error on this
    // page. The real, populated table is 'cp_commissions' (see AUDIT.md).
    // Column aliased back to channel_partner_id so nothing downstream needs
    // to change.
    try {
      const { data, error: commErr } = await supabase
        .from('cp_commissions')
        .select('id, channel_partner_id:cp_id, commission_amount, status');
      if (commErr) {
        reportQueryError('Channel Partner referral fees (list)', commErr);
      } else {
        setCommissions(data || []);
      }
    } catch (err) {
      reportQueryError('Channel Partner referral fees (list)', err);
    }

    // 5. Fetch Projects (independent catch)
    try {
      const { data, error: projErr } = await supabase
        .from('projects')
        .select('id, project_name')
        .eq('status', 'active');
      if (projErr) {
        reportQueryError('Channel Partners: Projects list', projErr);
      } else {
        setProjectsMap(new Map(data?.map(p => [p.id, p.project_name]) || []));
      }
    } catch (err) {
      reportQueryError('Channel Partners: Projects list', err);
    }

    // 6. Fetch Channel Partner Project mappings (independent catch)
    try {
      const { data, error: cpProjErr } = await supabase
        .from('channel_partner_projects')
        .select('channel_partner_id, project_id');
      if (cpProjErr) {
        reportQueryError('Channel Partners: project mappings', cpProjErr);
      } else {
        setPartnerProjectsList(data || []);
      }
    } catch (err) {
      reportQueryError('Channel Partners: project mappings', err);
    }

    // 7. Fetch Sourcing Managers (for the "allocate a Sourcing Manager"
    // field on the onboarding/edit form)
    try {
      const { data: roleRows } = await supabase.from('roles').select('id, name').in('name', ['sourcing_manager', 'sourcing_manager_tl']);
      const roleIds = (roleRows || []).map(r => r.id);
      if (roleIds.length > 0) {
        const { data: userRoles } = await supabase.from('user_roles').select('user_id').in('role_id', roleIds);
        const userIds = [...new Set((userRoles || []).map(ur => ur.user_id))];
        if (userIds.length > 0) {
          const { data: profiles } = await supabase.from('user_profiles').select('id, full_name').in('id', userIds);
          setSourcingManagers((profiles || []).map(p => ({ id: p.id, name: p.full_name || 'Unnamed' })));
        }
      }
    } catch (err) {
      reportQueryError('Channel Partners: sourcing managers list', err);
    }

    setLoading(false);
    setSyncing(false);
  }, []);

  // Fetch pending CP requests (for super_admin / site_head)
  const fetchRequests = useCallback(async () => {
    if (!canApprove) return;
    setRequestsLoading(true);
    try {
      const { data, error: reqErr } = await supabase
        .from('channel_partner_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (reqErr) {
        reportQueryError('CP Requests: fetch', reqErr);
      } else {
        let filtered = data || [];
        if (role === 'site_head') {
          filtered = filtered.filter((r: CPRequest) => {
            if (!r.project_ids || r.project_ids.length === 0) return false;
            return r.project_ids.some(pid => assignedProjects.includes(pid));
          });
        }
        setCpRequests(filtered);
      }
    } catch (err) {
      reportQueryError('CP Requests: fetch', err);
    } finally {
      setRequestsLoading(false);
    }
  }, [canApprove, role, assignedProjects]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Sync refresh trigger
  const handleSync = async () => {
    setSyncing(true);
    await fetchData();
    await fetchRequests();
  };

  // Toast timer
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Generate CP Code automatically
  const generateCPCode = (maxCode: string | null): string => {
    if (!maxCode) return 'CP-0001';
    const match = maxCode.match(/CP-(\d+)/);
    if (match) {
      const nextNum = parseInt(match[1], 10) + 1;
      return `CP-${String(nextNum).padStart(4, '0')}`;
    }
    return `CP-${Date.now()}`;
  };

  // Status Activation Toggle
  
  const handleDeleteCP = async (cpId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this Channel Partner?')) return;
    try {
      const { error } = await supabase.from('channel_partners').delete().eq('id', cpId);
      if (error) throw error;
      setNotification({ type: 'success', message: 'Channel Partner deleted permanently.' });
      fetchData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to delete channel partner.' });
    }
  };

  const handleToggleStatus = async (cp: ChannelPartner) => {
    const nextStatus = cp.status === 'active' ? 'inactive' : 'active';
    try {
      const { error: updateErr } = await supabase
        .from('channel_partners')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', cp.id);

      if (updateErr) throw updateErr;

      setPartners(prev => prev.map(p => p.id === cp.id ? { ...p, status: nextStatus } : p));
      setNotification({
        type: 'success',
        message: `Channel Partner ${cp.cp_code || cp.partner_code} status is now ${nextStatus}.`
      });
      setConfirmToggleCp(null);
    } catch (err: any) {
      console.error('Status toggling failed:', err);
      setNotification({ type: 'error', message: err.message || 'Failed to update partner status.' });
    }
  };

  // Helper: notify all super_admin + site_head users about a new CP request
  const notifyAdminsOfRequest = async (reqName: string) => {
    try {
      // Find all super_admin and site_head user IDs
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id, roles!inner(name)')
        .in('roles.name', ['super_admin', 'site_head']);

      if (!adminRoles || adminRoles.length === 0) return;

      const notifRows = adminRoles.map((r: any) => ({
        user_id: r.user_id,
        notification_type: 'cp_request',
        title: '🤝 New CP Request Submitted',
        message: `A request to register "${reqName}" as a Channel Partner is awaiting your approval.`,
        related_entity: 'channel_partner_requests',
        is_read: false,
        created_at: new Date().toISOString(),
      }));

      const { error: notifErr } = await supabase.from('notifications').insert(notifRows);
      if (notifErr) reportQueryError('CP Request: notify admins', notifErr);
    } catch (err) {
      console.warn('Failed to notify admins of CP request:', err);
    }
  };

  // Helper: normalise phone to WhatsApp-safe format (no +91 duplication)
  const toWaPhone = (raw: string): string => {
    const digits = raw.replace(/[^0-9]/g, '');
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return digits;
    if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
    return digits;
  };

  // Approve a pending CP request: create auth account + CP record
  const approveRequest = async (req: CPRequest) => {
    setApprovalLoading(req.id);
    try {
      // 1. Generate credentials
      const targetEmail = req.email?.trim() || `${req.phone.trim().slice(-10)}@partner.opalproperties.com`;
      const generatedPassword = generateRandomPassword();
      const { data: maxCP } = await supabase
        .from('channel_partners')
        .select('cp_code')
        .order('cp_code', { ascending: false })
        .limit(1)
        .maybeSingle();
      const generatedCode = generateCPCode(maxCP?.cp_code || null);

      // 2. Provision auth account
      let newUserId: string | null = null;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (accessToken) {
          const { data: fnData, error: fnError } = await supabase.functions.invoke('create-employee-account', {
            body: { email: targetEmail, password: generatedPassword, full_name: req.partner_name },
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!fnError && fnData?.id) {
            newUserId = fnData.id;
            const { data: cpRole } = await supabase.from('roles').select('id').eq('name', 'channel_partner').maybeSingle();
            if (cpRole?.id && newUserId) {
              await supabase.from('user_roles').insert({ user_id: newUserId, role_id: cpRole.id });
            }
          }
        }
      } catch (authErr) {
        console.warn('CP auth creation failed/skipped:', authErr);
      }

      // 3. Build CP payload and insert
      const formattedCity = req.pincode?.trim()
        ? `${req.city?.trim() || ''}, ${req.state?.trim() || ''} - ${req.pincode.trim()}`
        : req.state?.trim() ? `${req.city?.trim() || ''}, ${req.state.trim()}` : req.city?.trim() || null;

      const cpPayload: any = {
        name: req.partner_name,
        company_name: req.company_name || null,
        mobile: req.phone,
        whatsapp_number: req.whatsapp_number || req.phone,
        email: req.email?.trim() || null,
        address: req.address || null,
        city: formattedCity,
        rera_number: req.rera_number || null,
        pan_number: req.pan_number || null,
        gst_number: req.gst_number || null,
        status: 'active',
        notes: req.notes || null,
        sourcing_manager: req.sourcing_manager || null,
        cp_code: generatedCode,
        partner_code: generatedCode,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (newUserId) cpPayload.user_id = newUserId;

      const { data: newCP, error: createErr } = await supabase
        .from('channel_partners').insert([cpPayload]).select().single();
      if (createErr) throw createErr;

      // 4. Assign projects
      if (newCP && req.project_ids && req.project_ids.length > 0) {
        await supabase.from('channel_partner_projects').insert(
          req.project_ids.map(pid => ({ channel_partner_id: newCP.id, project_id: pid }))
        );
      }

      // 5. Mark request approved
      await supabase.from('channel_partner_requests')
        .update({ status: 'approved', reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', req.id);

      // 6. Auto-queue WhatsApp welcome message
      const waTarget = req.whatsapp_number || req.phone;
      if (waTarget) {
        const waPhone = toWaPhone(waTarget);
        const portalUrl = `${window.location.origin}/login`;
        let welcomeMsg = `🎉 *Welcome to Opal Properties Channel Partner Network!*\n\nDear ${req.partner_name},\nYour Channel Partner registration request has been approved!\n\n📋 *Partner Code:* ${generatedCode}\n👤 *Role:* Channel Partner`;
        welcomeMsg += `\n\n🔑 *Portal Login Credentials:*\n• Email: ${targetEmail}\n• Temporary Password: ${generatedPassword}\n🌐 *Login Portal:* ${portalUrl}\n\nPlease log in and update your password upon your first access.`;
        await supabase.from('whatsapp_outbox').insert([{ to_phone: waPhone, message: welcomeMsg, status: 'queued', created_by: user?.id || null }]);
      }

      // 7. Show credentials modal
      setNewCPCredentials({
        name: req.partner_name,
        email: targetEmail,
        password: generatedPassword,
        cpCode: generatedCode,
        phone: req.phone,
        whatsappSentTo: waTarget || null,
      });

      // 8. Refresh
      await fetchRequests();
      await fetchData();
      setNotification({ type: 'success', message: `${req.partner_name} approved and registered as Channel Partner!` });
    } catch (err: any) {
      console.error('CP approval error:', err);
      setNotification({ type: 'error', message: err.message || 'Failed to approve request.' });
    } finally {
      setApprovalLoading(null);
    }
  };

  // Reject a pending CP request
  const rejectRequest = async () => {
    if (!rejectingRequest) return;
    try {
      await supabase.from('channel_partner_requests')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason || 'No reason provided.',
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', rejectingRequest.id);
      setRejectingRequest(null);
      setRejectionReason('');
      await fetchRequests();
      setNotification({ type: 'success', message: 'Request rejected.' });
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to reject.' });
    }
  };

  // Submit Partner — now saves as a REQUEST (for all users) or directly edits (for admins editing existing)
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerName.trim()) {
      setFormError('Partner Name is required.');
      return;
    }
    if (!phone.trim()) {
      setFormError('Phone is required.');
      return;
    }
    // Indian mobile pattern validator (supports 10 digits with optional +91 prefix)
    if (!/^(?:\+91|0)?[6-9]\d{9}$/.test(phone.trim())) {
      setFormError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (email.trim() && !/\S+@\S+\.\S+/.test(email)) {
      setFormError('Please provide a valid email format.');
      return;
    }
    if (reraValidFrom && reraValidTo && new Date(reraValidTo) < new Date(reraValidFrom)) {
      setFormError('Valid To date cannot be earlier than Valid From date.');
      return;
    }

    setFormError(null);
    setFormLoading(true);

    try {
      // === EDITING AN EXISTING PARTNER (admin only, direct update) ===
      if (editingPartner) {
        const partnerId = editingPartner.id;
        const dupeCheck = partners.filter(p => p.id !== partnerId);
        if (dupeCheck.some(p => p.mobile === phone.trim())) {
          throw new Error('A partner with this phone number is already registered.');
        }
        if (email.trim() && dupeCheck.some(p => p.email?.toLowerCase() === email.trim().toLowerCase())) {
          throw new Error('A partner with this email is already registered.');
        }

        const formattedCity = pincode.trim()
          ? `${city.trim()}, ${state.trim()} - ${pincode.trim()}`
          : (state.trim() ? `${city.trim()}, ${state.trim()}` : city.trim() || null);
        const formattedNotes = [
          companyName.trim() ? `Company: ${companyName.trim()}` : null,
          contactPerson.trim() ? `Contact: ${contactPerson.trim()}` : null,
          reraValidFrom ? `ValidFrom: ${reraValidFrom}` : null,
          reraValidTo ? `ValidTo: ${reraValidTo}` : null,
          notes.trim() ? `Notes: ${notes.trim()}` : null
        ].filter(Boolean).join('\n');

        const payload: any = {
          name: partnerName.trim(),
          // Written to the real column now, not just embedded in notes as
          // "Company: X" -- that embedding never actually reached
          // company_name, which is why every existing partner's firm name
          // was blank everywhere it's displayed despite being entered here.
          company_name: companyName.trim() || null,
          mobile: phone.trim(),
          whatsapp_number: sameAsPhone ? phone.trim() : (whatsappNum.trim() || phone.trim()),
          email: email.trim() || null,
          address: address.trim() || null,
          city: formattedCity,
          rera_number: reraNumber.trim() || null,
          gst_number: gstNumber.trim() || null,
          status: status,
          notes: formattedNotes || null,
          updated_at: new Date().toISOString()
        };
        // Sourcing manager reassignment is restricted to super_admin/site_head --
        // enforced for real by a DB trigger (enforce_cp_sourcing_manager_change),
        // this just avoids sending a no-op change attempt from other roles.
        if (canApprove) {
          payload.sourcing_manager = formSourcingManagerId || null;
        }

        const { error: editErr } = await supabase.from('channel_partners').update(payload).eq('id', partnerId);
        if (editErr) throw editErr;

        // Sync project mappings
        await supabase.from('channel_partner_projects').delete().eq('channel_partner_id', partnerId);
        if (selectedProjects.length > 0) {
          await supabase.from('channel_partner_projects').insert(
            selectedProjects.map(projId => ({ channel_partner_id: partnerId, project_id: projId }))
          );
        }

        setNotification({ type: 'success', message: 'Channel Partner details updated successfully!' });
        setIsCreateOpen(false);
        setEditingPartner(null);
        resetFormFields();
        await fetchData();
        return;
      }

      // === SUBMITTING A NEW REQUEST (all users) ===
      const requestPayload = {
        submitted_by: user?.id || null,
        submitted_by_name: user?.email || null,
        partner_name: partnerName.trim(),
        company_name: companyName.trim() || null,
        contact_person: contactPerson.trim() || null,
        phone: phone.trim(),
        whatsapp_number: sameAsPhone ? phone.trim() : (whatsappNum.trim() || phone.trim()),
        email: email.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        pincode: pincode.trim() || null,
        rera_number: reraNumber.trim() || null,
        pan_number: panNumber.trim() || null,
        gst_number: gstNumber.trim() || null,
        notes: notes.trim() || null,
        project_ids: selectedProjects.length > 0 ? selectedProjects : null,
        sourcing_manager: formSourcingManagerId || null,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: reqErr } = await supabase.from('channel_partner_requests').insert([requestPayload]);
      if (reqErr) throw reqErr;

      // Notify all super_admin + site_head users
      await notifyAdminsOfRequest(partnerName.trim());

      setNotification({ type: 'success', message: `Request for "${partnerName.trim()}" submitted! Awaiting admin approval.` });
      setIsCreateOpen(false);
      resetFormFields();
    } catch (err: any) {
      console.error('Channel Partner form error:', err);
      if (err.message && /already registered to channel partner/i.test(err.message)) {
        setFormError(err.message.replace(/\s*\(id [0-9a-f-]+\)/i, ''));
      } else {
        setFormError(err.message || 'An error occurred while saving.');
      }
    } finally {
      setFormLoading(false);
    }
  };

  const resetFormFields = () => {
    setPartnerName('');
    setCompanyName('');
    setContactPerson('');
    setPhone('');
    setWhatsappNum('');
    setSameAsPhone(true);
    setEmail('');
    setAddress('');
    setCity('');
    setState('');
    setPincode('');
    setReraNumber('');
    setReraValidFrom('');
    setReraValidTo('');
    setPanNumber('');
    setGstNumber('');
    setStatus('active');
    setNotes('');
    setSelectedProjects([]);
    setFormSourcingManagerId('');
  };

  const openEditModal = (cp: ChannelPartner) => {
    setEditingPartner(cp);
    setPartnerName(cp.name || '');
    setCompanyName(parseNotesField(cp.notes, 'Company') || cp.company_name || '');
    setContactPerson(parseNotesField(cp.notes, 'Contact') || cp.contact_person || '');
    setPhone(cp.phone || cp.mobile || '');
    const waStored = (cp as any).whatsapp_number || '';
    setWhatsappNum(waStored);
    setSameAsPhone(!waStored || waStored === (cp.phone || cp.mobile || ''));
    setEmail(cp.email || '');
    setAddress(cp.address || '');
    
    const parsedCity = parseCityField(cp.city);
    setCity(parsedCity.city || cp.city || '');
    setState(parsedCity.state || cp.state || '');
    setPincode(parsedCity.pincode || cp.pincode || '');

    setReraNumber(cp.rera_registration_number || cp.rera_number || '');
    setReraValidFrom(parseNotesField(cp.notes, 'ValidFrom') || cp.rera_valid_from || cp.valid_from || '');
    setReraValidTo(parseNotesField(cp.notes, 'ValidTo') || cp.rera_valid_to || cp.valid_to || '');
    setPanNumber(cp.pan_number || '');
    setGstNumber(cp.gst_number || '');
    setStatus(cp.status || 'active');
    const notesMatch = cp.notes?.match(/Notes:\s*([\s\S]*)/);
    setNotes(notesMatch ? notesMatch[1].trim() : cp.notes || '');

    const assigned = partnerProjectsList
      .filter(p => p.channel_partner_id === cp.id)
      .map(p => p.project_id);
    setSelectedProjects(assigned);
    setFormSourcingManagerId(cp.sourcing_manager || '');

    setIsCreateOpen(true);
  };

  // Filter CP records in memory
  const getFilteredPartners = () => {
    return partners.filter(p => {
      const code = p.cp_code || p.partner_code || '';
      const nameVal = p.name || '';
      const phoneVal = p.phone || p.mobile || '';

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = nameVal.toLowerCase().includes(query);
        const matchCompany = p.company_name?.toLowerCase().includes(query);
        const matchCode = code.toLowerCase().includes(query);
        const matchPhone = phoneVal.toLowerCase().includes(query);
        const matchEmail = p.email?.toLowerCase().includes(query);
        const matchRera = p.rera_number?.toLowerCase().includes(query);
        if (!matchName && !matchCompany && !matchCode && !matchPhone && !matchEmail && !matchRera) {
          return false;
        }
      }

      if (statusFilter && p.status !== statusFilter) return false;
      if (projectFilter) {
        const assigned = partnerProjectsList.some(
          pj => pj.channel_partner_id === p.id && pj.project_id === projectFilter
        );
        if (!assigned) return false;
      }

      return true;
    });
  };

  const filteredPartners = getFilteredPartners();
  const totalFilteredCount = filteredPartners.length;
  const startRange = totalFilteredCount > 0 ? page * pageSize + 1 : 0;
  const endRange = Math.min((page + 1) * pageSize, totalFilteredCount);
  const paginatedPartners = filteredPartners.slice(page * pageSize, (page + 1) * pageSize);

  // Compute live stats metrics
  const totalPartners = partners.length;
  const activePartners = partners.filter(p => p.status === 'active' || p.status === 'ACTIVE').length;
  const inactivePartners = partners.filter(p => p.status === 'inactive' || p.status === 'INACTIVE' || p.status === 'suspended').length;

  const totalCPLeads = leads.filter(l => l.channel_partner_id !== null).length;
  const totalCPBookingsList = bookings.filter(b => b.channel_partner_id !== null && b.status?.toLowerCase() === 'confirmed');
  const totalCPBookings = totalCPBookingsList.length;

  const totalSalesValue = totalCPBookingsList.reduce((sum, b) => {
    const val = b.total_payable_amount !== null && b.total_payable_amount !== undefined ? b.total_payable_amount : (b.booking_amount || 0);
    return sum + val;
  }, 0);

  const totalCommission = commissions.reduce((sum, c) => sum + (c.commission_amount || 0), 0);
  const pendingCommission = commissions
    .filter(c => {
      const s = c.status?.toLowerCase();
      return s === 'pending' || s === 'approved' || s === 'payable' || s === 'partially_paid';
    })
    .reduce((sum, c) => sum + (c.commission_amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* ALERTS */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border flex items-center space-x-2.5 transition-all animate-in fade-in slide-in-from-top-4 duration-200 ${
          notification.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <CheckCircle className={`h-5 w-5 ${notification.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`} />
          <span className="text-sm font-semibold">{notification.message}</span>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-start space-x-2.5 mb-6">
          <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <span className="text-sm font-semibold leading-tight">{error}</span>
        </div>
      )}

      {/* HEADER ACTION BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Channel Partners</h2>
          <p className="text-slate-500 text-xs mt-1">Manage channel partners, referrals, bookings and referral fees.</p>
        </div>
        <div className="flex items-center space-x-2 flex-wrap">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-semibold shadow-sm transition-all focus:outline-none"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync Data'}</span>
          </button>
          {/* All logged-in users can submit a request */}
          <button
            onClick={() => { resetFormFields(); setEditingPartner(null); setIsCreateOpen(true); }}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/10 hover:shadow-lg transition-all focus:outline-none"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{canApprove ? 'New Channel Partner' : 'Request Channel Partner'}</span>
          </button>
        </div>
      </div>

      {/* KPI METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4 mb-6">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Total Partners</span>
          <span className="block text-lg font-extrabold text-slate-950 mt-1">{totalPartners}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Active</span>
          <span className="block text-lg font-extrabold text-emerald-600 mt-1">{activePartners}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Inactive</span>
          <span className="block text-lg font-extrabold text-slate-500 mt-1">{inactivePartners}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Total Leads</span>
          <span className="block text-lg font-extrabold text-indigo-600 mt-1">{totalCPLeads}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Total Bookings</span>
          <span className="block text-lg font-extrabold text-indigo-700 mt-1">{totalCPBookings}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Sales Value</span>
          <span className="block text-md font-bold text-slate-950 mt-1 truncate">₹{totalSalesValue.toLocaleString('en-IN')}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Total Referral Fee</span>
          <span className="block text-md font-bold text-emerald-600 mt-1 truncate">₹{totalCommission.toLocaleString('en-IN')}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Pending Comm.</span>
          <span className="block text-md font-bold text-amber-500 mt-1 truncate">₹{pendingCommission.toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* PENDING REQUESTS PANEL — visible to super_admin and site_head only */}
      {canApprove && (
        <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-amber-50 px-5 py-3 border-b border-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="font-bold text-sm text-amber-800">Pending Channel Partner Requests</span>
              {cpRequests.length > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{cpRequests.length}</span>
              )}
            </div>
            <button onClick={fetchRequests} className="text-amber-600 hover:text-amber-800 text-xs font-semibold">
              {requestsLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          {requestsLoading ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading requests...</div>
          ) : cpRequests.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 italic">No pending requests. All clear!</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {cpRequests.map(req => (
                <div key={req.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-900">{req.partner_name}</p>
                    <p className="text-xs text-slate-500">
                      {req.company_name ? `${req.company_name} · ` : ''}
                      📞 {req.phone}
                      {req.whatsapp_number && req.whatsapp_number !== req.phone ? ` · 📲 WA: ${req.whatsapp_number}` : ''}
                      {req.email ? ` · ${req.email}` : ''}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Submitted by {req.submitted_by_name || 'unknown'} · {new Date(req.created_at).toLocaleString('en-IN')}
                    </p>
                    {req.notes && <p className="text-xs text-slate-500 italic mt-1">"{req.notes}"</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      disabled={approvalLoading === req.id}
                      onClick={() => approveRequest(req)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold disabled:opacity-60 transition-all"
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                      {approvalLoading === req.id ? 'Approving...' : 'Approve'}
                    </button>
                    <button
                      disabled={approvalLoading === req.id}
                      onClick={() => { setRejectingRequest(req); setRejectionReason(''); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-lg text-xs font-bold disabled:opacity-60 transition-all"
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SEARCH AND FILTERS */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative md:col-span-2">
            <Search className="absolute inset-y-0 left-3 h-4 w-4 text-slate-400 self-center top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, company, code, phone, email, RERA..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all text-slate-800"
            />
          </div>
          <div>
            <select
              value={projectFilter}
              onChange={(e) => { setProjectFilter(e.target.value); setPage(0); }}
              className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all w-full"
            >
              <option value="">All Projects</option>
              {Array.from(projectsMap.entries()).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
              className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all w-full"
            >
              <option value="">All Statuses</option>
              <option value="active">ACTIVE</option>
              <option value="inactive">INACTIVE</option>
            </select>
          </div>
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col">
        {loading ? (
          <div className="py-24 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-100 border-t-indigo-600 mx-auto mb-4"></div>
            <p className="text-slate-500 font-medium">Fetching Channel Partners...</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3.5 px-6">CP Code</th>
                    <th className="py-3.5 px-6">Partner Name</th>
                    <th className="py-3.5 px-6">Company</th>
                    <th className="py-3.5 px-6">Phone</th>
                    <th className="py-3.5 px-6">Email</th>
                    <th className="py-3.5 px-6">RERA Number</th>
                    <th className="py-3.5 px-6">Referral Fee Structure</th>
                    <th className="py-3.5 px-6">Sourcing Manager</th>
                    <th className="py-3.5 px-6">Status</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedPartners.length > 0 ? (
                    paginatedPartners.map((cp) => {
                      const code = cp.cp_code || cp.partner_code || '—';
                      const name = cp.name || '—';
                      const phoneVal = cp.phone || cp.mobile || '—';
                      const companyVal = parseNotesField(cp.notes, 'Company') || '—';
                      const commLabel = 'Project Specific';

                      return (
                        <tr key={cp.id} className="hover:bg-slate-50/50 transition-colors text-sm">
                          <td className="py-4 px-6 font-bold text-slate-900">{code}</td>
                          <td className="py-4 px-6 font-semibold text-slate-800">{name}</td>
                          <td className="py-4 px-6 text-slate-600">{companyVal}</td>
                          <td className="py-4 px-6 text-slate-650">{phoneVal}</td>
                          <td className="py-4 px-6 text-slate-600 text-xs truncate max-w-[150px]">{cp.email || '—'}</td>
                          <td className="py-4 px-6 text-slate-600 font-mono text-xs">{cp.rera_number || '—'}</td>
                          <td className="py-4 px-6 text-slate-700 font-semibold text-xs">{commLabel}</td>
                          <td className="py-4 px-6 text-slate-600 text-xs">{sourcingManagerMap.get(cp.sourcing_manager || '') || '—'}</td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xxs font-bold uppercase tracking-wider ${
                              cp.status === 'active' || cp.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 
                              'bg-slate-100 text-slate-500'
                            }`}>
                              {cp.status || 'active'}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              <button
                                onClick={() => navigate(`/channel-partners/${cp.id}`)}
                                title="View details"
                                className="p-1 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-all"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => openEditModal(cp)}
                                title="Edit Partner"
                                className="p-1 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-all"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                              {isSuperAdmin && (
                                <button
                                  onClick={() => setConfirmToggleCp(cp)}
                                  title={cp.status === 'active' || cp.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                                  className={`p-1 border border-slate-200 rounded-lg transition-all ${
                                    cp.status === 'active' || cp.status === 'ACTIVE'
                                      ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-100'
                                      : 'text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-100'
                                  }`}
                                >
                                  {cp.status === 'active' || cp.status === 'ACTIVE' ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                                </button>
                              )}
                            {isSuperAdmin && (
                                <button
                                  onClick={() => handleDeleteCP(cp.id)}
                                  className="p-1 border border-slate-200 rounded-lg text-rose-500 hover:bg-rose-50 hover:border-rose-100 transition-all"
                                  title="Delete Channel Partner Permanently"
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
                      <td colSpan={10} className="py-20 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center space-y-3">
                          <div className="bg-slate-50 p-4 rounded-full text-slate-300">
                            <Users className="h-8 w-8" />
                          </div>
                          <p className="text-slate-500 font-semibold text-sm">No Channel Partners Registered</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* PAGINATION */}
            {totalFilteredCount > 0 && (
              <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">
                  Showing <span className="font-semibold text-slate-800">{startRange}</span> to{' '}
                  <span className="font-semibold text-slate-800">{endRange}</span> of{' '}
                  <span className="font-semibold text-slate-800">{totalFilteredCount}</span> partners
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setPage(prev => Math.max(prev - 1, 0))}
                    disabled={page === 0}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus:outline-none disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs font-semibold text-slate-700">
                    Page {page + 1} of {Math.ceil(totalFilteredCount / pageSize)}
                  </span>
                  <button
                    onClick={() => setPage(prev => prev + 1)}
                    disabled={(page + 1) * pageSize >= totalFilteredCount}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus:outline-none disabled:opacity-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* CONFIRMATION MODAL */}
      {confirmToggleCp && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setConfirmToggleCp(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-sm w-full overflow-hidden p-6 animate-in fade-in zoom-in-95 duration-150 text-left">
            <h3 className="text-base font-bold text-slate-900 mb-2">
              Confirm Status Transition
            </h3>
            <p className="text-xs text-slate-600 mb-5">
              Are you sure you want to transition the status of Channel Partner <strong>{confirmToggleCp.name}</strong> to{' '}
              <strong className="text-indigo-650">{confirmToggleCp.status === 'active' || confirmToggleCp.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'}</strong>?
            </p>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setConfirmToggleCp(null)}
                className="px-3.5 py-1.5 border border-slate-250 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleToggleStatus(confirmToggleCp)}
                className="px-3.5 py-1.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT REQUEST MODAL */}
      {rejectingRequest && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setRejectingRequest(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-sm w-full overflow-hidden p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-slate-900 mb-2">Reject CP Request</h3>
            <p className="text-xs text-slate-600 mb-3">
              Rejecting <strong>{rejectingRequest.partner_name}</strong>. Optionally provide a reason:
            </p>
            <textarea
              rows={3}
              placeholder="Reason for rejection (optional)..."
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-700 bg-slate-50 focus:outline-none mb-4"
            />
            <div className="flex justify-end space-x-2">
              <button onClick={() => setRejectingRequest(null)} className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold">Cancel</button>
              <button onClick={rejectRequest} className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold">Confirm Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE & EDIT MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsCreateOpen(false)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">
                {editingPartner
                  ? `Edit Channel Partner: ${editingPartner.cp_code || editingPartner.partner_code}`
                  : canApprove ? 'Register New Channel Partner' : '🤝 Request to Add Channel Partner'}
              </span>
              <button type="button" onClick={() => setIsCreateOpen(false)} className="p-1 rounded-lg text-indigo-200 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>
            {!editingPartner && !canApprove && (
              <div className="bg-amber-50 border-b border-amber-200 px-5 py-2.5 text-xs text-amber-800">
                ℹ️ Your request will be sent to the admin for approval. Once approved, portal credentials will be generated and sent to the partner's WhatsApp.
              </div>
            )}

            <form onSubmit={handleFormSubmit}>
              <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto text-left">
                {formError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-start space-x-2.5">
                    <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-semibold leading-tight">{formError}</span>
                  </div>
                )}

                {/* PARTNER INFORMATION */}
                <div>
                  <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-3">Partner Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Partner Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="Rajesh Kumar / Elite Realty"
                        value={partnerName}
                        onChange={(e) => setPartnerName(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Company Name</label>
                      <input
                        type="text"
                        placeholder="Elite Brokerages Pvt Ltd"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Phone Number *</label>
                      <input
                        type="text"
                        required
                        placeholder="9999999999"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                      />
                    </div>
                    {/* WhatsApp Number — same or separate */}
                    <div className="md:col-span-2">
                      <div className="flex items-center gap-3 mb-2">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">WhatsApp Number</label>
                        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sameAsPhone}
                            onChange={e => { setSameAsPhone(e.target.checked); if (e.target.checked) setWhatsappNum(''); }}
                            className="rounded text-emerald-600"
                          />
                          Same as phone number
                        </label>
                      </div>
                      {!sameAsPhone && (
                        <input
                          type="text"
                          placeholder="9999999999 (if different from phone)"
                          value={whatsappNum}
                          onChange={e => setWhatsappNum(e.target.value)}
                          className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                        />
                      )}
                      {sameAsPhone && (
                        <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-medium">
                          📲 WhatsApp will be sent to: <strong>{phone || 'enter phone above'}</strong>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Email Address *</label>
                      <input
                        type="email"
                        required
                        placeholder="partner@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Address</label>
                      <input
                        type="text"
                        placeholder="Office address details"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2 md:col-span-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">City</label>
                        <input
                          type="text"
                          placeholder="Mumbai"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">State</label>
                        <input
                          type="text"
                          placeholder="Maharashtra"
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                          className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Pincode</label>
                        <input
                          type="text"
                          placeholder="400001"
                          value={pincode}
                          onChange={(e) => setPincode(e.target.value)}
                          className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* REGULATORY INFORMATION */}
                <div>
                  <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-3">Regulatory Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">RERA Registration Number</label>
                      <input
                        type="text"
                        placeholder="RERA Number"
                        value={reraNumber}
                        onChange={(e) => setReraNumber(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-850 text-sm focus:bg-white focus:outline-none transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Valid From</label>
                        <input
                          type="date"
                          value={reraValidFrom}
                          onChange={(e) => setReraValidFrom(e.target.value)}
                          className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Valid To</label>
                        <input
                          type="date"
                          value={reraValidTo}
                          onChange={(e) => setReraValidTo(e.target.value)}
                          className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">PAN Card</label>
                      <input
                        type="text"
                        placeholder="PAN Card Number"
                        value={panNumber}
                        onChange={(e) => setPanNumber(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">GST Number</label>
                      <input
                        type="text"
                        placeholder="GSTIN"
                        value={gstNumber}
                        onChange={(e) => setGstNumber(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>


                {/* PROJECTS ASSIGNMENT */}
                <div>
                  <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-3">Project Mapping / Permissions Overrides</h4>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-h-[150px] overflow-y-auto space-y-2">
                    {Array.from(projectsMap.entries()).map(([id, name]) => {
                      const isChecked = selectedProjects.includes(id);
                      return (
                        <label key={id} className="flex items-center space-x-2.5 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedProjects(prev => [...prev, id]);
                              } else {
                                setSelectedProjects(prev => prev.filter(pId => pId !== id));
                              }
                            }}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>{name}</span>
                        </label>
                      );
                    })}
                    {projectsMap.size === 0 && (
                      <p className="text-slate-400 text-xxs font-medium italic">No active projects available.</p>
                    )}
                  </div>
                </div>

                {/* SOURCING MANAGER ALLOCATION -- who this Channel Partner
                    is assigned to. This is what a CP's own leads auto-fill
                    their Sourcing Manager field from, so reassigning it
                    here takes effect immediately, and is restricted to
                    super_admin/site_head for real by a DB trigger, not just
                    the disabled attribute below. */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Allocated Sourcing Manager</label>
                  <select
                    value={formSourcingManagerId}
                    disabled={!canApprove}
                    onChange={(e) => setFormSourcingManagerId(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="">Select Sourcing Manager...</option>
                    {sourcingManagers.map(sm => (
                      <option key={sm.id} value={sm.id}>{sm.name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {canApprove
                      ? 'This Sourcing Manager auto-fills whenever this partner adds a lead.'
                      : 'Only Super Admin or Site Head can allocate a Sourcing Manager.'}
                  </p>
                </div>

                {/* STATUS & NOTES */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Status *</label>
                    <select
                      required
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      <option value="active">ACTIVE</option>
                      <option value="inactive">INACTIVE</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Internal Notes</label>
                    <textarea
                      placeholder="Special contracts or background notes..."
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/10 hover:shadow-lg disabled:opacity-50 transition-all focus:outline-none"
                >
                  {formLoading ? 'Saving...' : editingPartner ? 'Update Partner' : canApprove ? 'Register Partner' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CHANNEL PARTNER CREDENTIALS MODAL */}
      {newCPCredentials && (
        <div className="fixed inset-0 z-[60] overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-emerald-600 text-white px-6 py-4 flex items-center gap-3">
              <span className="text-xl">🎉</span>
              <span className="font-bold tracking-tight">Channel Partner Registered & Account Created</span>
            </div>
            <div className="p-6 space-y-4">
              {newCPCredentials.whatsappSentTo && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 text-xs flex items-center space-x-2">
                  <span className="text-base">📲</span>
                  <div>
                    <strong>Auto-Sent:</strong> Welcome message with credentials was automatically queued to{' '}
                    <strong>+{toWaPhone(newCPCredentials.whatsappSentTo)}</strong>.
                  </div>
                </div>
              )}
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs">
                These login credentials were automatically generated for <strong>{newCPCredentials.name}</strong> ({newCPCredentials.cpCode}). Please save them now.
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Partner Code</label>
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono font-bold text-indigo-700">
                  {newCPCredentials.cpCode}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Login Username / Email</label>
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 break-all">
                  {newCPCredentials.email}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Temporary Password</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-800">
                    {newCPCredentials.password}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(`Partner Code: ${newCPCredentials!.cpCode}\nEmail: ${newCPCredentials!.email}\nPassword: ${newCPCredentials!.password}`)}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex-shrink-0"
                  >
                    Copy All
                  </button>
                </div>
              </div>

              {/* Manual Send on WhatsApp */}
              {newCPCredentials.whatsappSentTo && (
                <div className="border-t border-slate-100 pt-3">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Re-send via WhatsApp</label>
                  {cpWaSent ? (
                    <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-xs font-semibold">
                      <span>✅</span> Credentials re-sent to WhatsApp!
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={cpWaSending}
                      onClick={async () => {
                        if (!newCPCredentials) return;
                        setCpWaSending(true);
                        try {
                          const waPhone = toWaPhone(newCPCredentials.whatsappSentTo || newCPCredentials.phone);
                          const portalUrl = `${window.location.origin}/login`;
                          const msg = `📋 *Channel Partner Login Credentials*\n\n• Partner Code: ${newCPCredentials.cpCode}\n• Email: ${newCPCredentials.email}\n• Password: ${newCPCredentials.password}\n🌐 Portal: ${portalUrl}\n\nPlease log in and update your password upon first access.`;
                          await supabase.from('whatsapp_outbox').insert([{ to_phone: waPhone, message: msg, status: 'queued', created_by: user?.id || null }]);
                          setCpWaSent(true);
                        } catch (err) {
                          console.error('CP manual WhatsApp re-send failed:', err);
                        } finally {
                          setCpWaSending(false);
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold transition-all"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {cpWaSending ? 'Sending...' : 'Send Credentials on WhatsApp'}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-100">
              <button
                onClick={() => { setNewCPCredentials(null); setCpWaSent(false); setCpWaSending(false); }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm"
              >
                I've Saved This — Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
