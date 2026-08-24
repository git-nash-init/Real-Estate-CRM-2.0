import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { reportQueryError } from '../services/queryLogger';
import { supabase } from '../services/supabaseClient';
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
  FileText
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
  const [uniqueStatuses, setUniqueStatuses] = useState<string[]>([]);
  const [uniqueSources, setUniqueSources] = useState<string[]>([]);

  // Selected lead for read-only detail view modal
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // Auth and Routing hooks
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
  const [isLogCallOpen, setIsLogCallOpen] = useState(false);
  const [callOutcome, setCallOutcome] = useState('connected');
  const [callDuration, setCallDuration] = useState('');
  const [callNotes, setCallNotes] = useState('');
  const [callSubmitting, setCallSubmitting] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

  // Create Lead modal & notification states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

    // 2. Load Sourcing Managers from public.user_profiles
    try {
      const { data, error: profilesError } = await supabase
        .from('user_profiles')
        .select('id, full_name');
      
      if (profilesError) {
        console.error('Supabase User Profiles API Error:', profilesError.message, profilesError.details);
      } else if (data) {
        console.log(`Supabase Profiles loaded: ${data.length} records`);
        setProfileMap(new Map(data.map(u => [u.id, u.full_name])));
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

      // Apply Filters
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

  const openLogCall = () => {
    setCallOutcome('connected');
    setCallDuration('');
    setCallNotes('');
    setCallError(null);
    setIsLogCallOpen(true);
  };

  const handleLogCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;
    setCallSubmitting(true);
    setCallError(null);
    try {
      const { error } = await supabase.from('call_logs').insert([{
        employee_id: currentEmployeeId,
        lead_id: selectedLead.id,
        channel_partner_id: selectedLead.channel_partner_id || null,
        direction: 'outbound',
        outcome: callOutcome,
        duration_seconds: callDuration ? Number(callDuration) : null,
        notes: callNotes.trim() || null,
      }]);
      if (error) throw error;
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

  // URL query parameter detector to open creation modal
  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      setIsCreateOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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

  // Form submission logic to insert lead into Supabase
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

    setCreateError(null);
    setCreateLoading(true);

    try {
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

      // Debugging logs to verify UUID configurations and values before database submission
      console.log('--- Submitting Lead Insert ---');
      console.log('project_id (selectedProjectId):', selectedProjectId);
      console.log('project_name:', projectMap.get(selectedProjectId) || 'None');
      console.log('owner_id (sourcing manager):', selectedOwnerId || 'None');
      console.log('owner_name:', profileMap.get(selectedOwnerId) || 'None');
      console.log('created_by:', user?.id || 'None');
      console.log('lead_number:', nextLeadNumber);
      console.log('------------------------------');

      // 3. Insert record supplying generated lead_number and selected project UUID
      const { data: insertedLead, error: insertError } = await supabase
        .from('leads')
        .insert([
          {
            lead_number: nextLeadNumber,
            customer_name: customerName.trim(),
            mobile: mobile.trim(),
            email: email.trim() || null,
            project_id: selectedProjectId || null,
            source: selectedSource || null,
            owner_id: selectedOwnerId || null,
            status: selectedStatus || 'new',
            notes: notes.trim() || null,
            channel_partner_id: selectedChannelPartnerId || null,
            created_by: user?.id || null,
            visit_type: visitType,
            visit_date: visitDate || null,
            residence_address: residenceAddress.trim() || null,
            occupation: profession || null,
            configuration: requirementDetails || null,
            budget: budget.trim() || null,
            sourcing_manager_id: sourcingManagerId || null,
            telecaller_id: telecallerId || null,
            next_followup_at: nextFollowupAt ? new Date(nextFollowupAt).toISOString() : null
          }
        ])
        .select('id')
        .single();

      if (insertError) {
        throw new Error(insertError.message);
      }

      // Channel Partner lead claim: 45-day window + verification code.
      // Non-fatal if this fails — the lead itself is already saved; the CP
      // attribution/commission tracking is a secondary record.
      if (selectedChannelPartnerId && insertedLead?.id) {
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
      setIsCreateOpen(false);
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

      // Refresh list
      setPage(0);
      await fetchLeads();

      setNotification({
        type: 'success',
        message: 'New lead record created successfully!'
      });
    } catch (err: any) {
      console.error('Detailed Supabase Lead creation error:', err);
      // Clean up PostgreSQL constraint errors for the user
      if (err.message && err.message.toLowerCase().includes('violates not-null constraint')) {
        setCreateError('Database Insertion Denied: Please make sure a valid Project is selected and all other required fields are filled out.');
      } else if (err.message && err.message.toLowerCase().includes('already exists in the system')) {
        // Raised by the prevent_duplicate_lead_phone_trigger DB trigger —
        // strip the internal lead id before showing it to the user.
        setCreateError('A lead with this mobile number already exists in the system. Duplicate submissions are not allowed.');
      } else {
        setCreateError(err.message || 'Database connection error occurred while inserting lead.');
      }
    } finally {
      setCreateLoading(false);
    }
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
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
          <button
            onClick={() => setIsCreateOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md shadow-indigo-600/10 hover:shadow-lg transition-all focus:outline-none"
          >
            + New Lead
          </button>
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
                    <th className="py-3.5 px-6">Status</th>
                    <th className="py-3.5 px-6">Created Date</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leads.length > 0 ? (
                    leads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors">
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
                          {profileMap.get(lead.owner_id || '') || 'N/A'}
                        </td>
                        <td className="py-4 px-6">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            lead.status?.toLowerCase() === 'booked' ? 'bg-emerald-50 text-emerald-700' :
                            lead.status?.toLowerCase() === 'lost' ? 'bg-rose-50 text-rose-700' :
                            lead.status?.toLowerCase() === 'visit_scheduled' ? 'bg-amber-50 text-amber-700' :
                            'bg-indigo-50 text-indigo-700'
                          }`}>
                            {lead.status || 'new'}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-xs text-slate-400">
                          {new Date(lead.created_at).toLocaleDateString('en-IN')}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <button
                            onClick={() => setSelectedLead(lead)}
                            className="inline-flex items-center space-x-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors focus:outline-none"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>View</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-20 text-center text-slate-400">
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
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Duration (seconds)</label>
                    <input
                      type="number"
                      min={0}
                      value={callDuration}
                      onChange={(e) => setCallDuration(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
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
                    disabled={callSubmitting}
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
              <span className="font-bold tracking-tight">Create New Lead</span>
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
                        {projectMap.size === 0 ? (
                          <option value="" disabled>No projects available</option>
                        ) : (
                          Array.from(projectMap.entries()).map(([id, name]) => (
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

                    {/* Source Of Inquiry */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Source Of Inquiry *</label>
                      <select
                        required
                        value={selectedSource}
                        onChange={(e) => setSelectedSource(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
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
                    </div>
                  </div>

                  {/* COLUMN 3: FOLLOW-UP & ALLOCATION */}
                  <div className="space-y-4">
                    <h4 className="font-bold text-xs text-indigo-600 border-b border-slate-100 pb-1.5 uppercase tracking-wider">Follow-up & Allocation</h4>

                    {/* Sourcing Manager */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Sourcing Manager</label>
                      <select
                        value={sourcingManagerId}
                        onChange={(e) => setSourcingManagerId(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                      >
                        <option value="">Select Sourcing Manager...</option>
                        {Array.from(profileMap.entries()).map(([id, name]) => (
                          <option key={id} value={id}>{name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Telecaller */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Telecaller</label>
                      <select
                        value={telecallerId}
                        onChange={(e) => setTelecallerId(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                      >
                        <option value="">Select Telecaller...</option>
                        {Array.from(profileMap.entries()).map(([id, name]) => (
                          <option key={id} value={id}>{name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Allocated To */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Allocated To *</label>
                      <select
                        required
                        value={selectedOwnerId}
                        onChange={(e) => setSelectedOwnerId(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                      >
                        <option value="">Select Owner...</option>
                        {Array.from(profileMap.entries()).map(([id, name]) => (
                          <option key={id} value={id}>{name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Status */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Status *</label>
                      <select
                        required
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                      >
                        <option value="new">New Lead</option>
                        <option value="contacted">Contacted</option>
                        <option value="visit_scheduled">Visit Scheduled</option>
                        <option value="booked">Booked</option>
                        <option value="lost">Lost</option>
                      </select>
                    </div>

                    {/* Follow-up Date */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Follow-up Date</label>
                      <input
                        type="date"
                        value={nextFollowupAt}
                        onChange={(e) => setNextFollowupAt(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-850 text-sm focus:bg-white focus:outline-none transition-all"
                      />
                    </div>

                    {/* Channel Partner Select */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Channel Partner</label>
                      <select
                        value={selectedChannelPartnerId}
                        onChange={(e) => setSelectedChannelPartnerId(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                      >
                        <option value="">Select Channel Partner (Optional)...</option>
                        {channelPartners.map(cp => (
                          <option key={cp.id} value={cp.id}>
                            {cp.partner_code || ''} - {cp.name}
                          </option>
                        ))}
                      </select>
                    </div>
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
                  {createLoading ? 'Inserting...' : 'Create Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
