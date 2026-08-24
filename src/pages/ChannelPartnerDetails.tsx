import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import {
  ArrowLeft,
  RefreshCw,
  Users,
  CheckCircle,
  DollarSign,
  AlertCircle,
  Plus,
  X
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
  commission_type: string | null;
  commission_value: number | null;
  commission_basis: string | null;
  default_commission_rate: number | null;
  default_commission_amount: number | null;
  status: string | null;
  notes: string | null;
  created_at: string;
}

interface Project {
  id: string;
  project_name: string;
}

interface Lead {
  id: string;
  customer_name: string | null;
  mobile: string | null;
  email: string | null;
  status: string | null;
  source: string | null;
  created_at: string;
  project_id: string | null;
}

interface SiteVisit {
  id: string;
  scheduled_at: string | null;
  status: string | null;
  remarks: string | null;
  lead_id: string | null;
  project_id: string | null;
}

interface Booking {
  id: string;
  booking_number: string | null;
  customer_name: string | null;
  booking_amount: number | null;
  consideration_amount: number | null;
  total_payable_amount: number | null;
  status: string | null;
  booking_date: string | null;
  project_id: string | null;
  tower_id: string | null;
  inventory_id: string | null;
}

interface Commission {
  id: string;
  cp_id: string;
  booking_id: string;
  commission_percentage: number;
  commission_amount: number;
  payable_amount: number;
  paid_amount: number;
  pending_amount: number;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  payout_date: string | null;
  payout_reference: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

interface CommissionPayment {
  id: string;
  commission_id: string;
  amount: number;
  payment_date: string;
  payment_mode: string;
  reference_number: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
}

interface CommissionStructure {
  id: string;
  cp_id: string;
  project_id: string | null;
  structure_type: string;
  commission_percentage: number | null;
  fixed_amount: number | null;
  slab_min: number | null;
  slab_max: number | null;
  effective_from: string;
  effective_to: string | null;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}


export const ChannelPartnerDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAuthorized = role === 'super_admin' || role === 'project_admin';

  const [partner, setPartner] = useState<ChannelPartner | null>(null);
  const [projectsMap, setProjectsMap] = useState<Map<string, string>>(new Map());
  const [towersMap, setTowersMap] = useState<Map<string, string>>(new Map());
  const [unitsMap, setUnitsMap] = useState<Map<string, string>>(new Map());
  const [assignedProjectIds, setAssignedProjectIds] = useState<string[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);

  // Tab selections
  const [activeTab, setActiveTab] = useState<'overview' | 'leads' | 'visits' | 'bookings' | 'commission' | 'payouts' | 'projects' | 'structure'>('overview');

  // Related lists
  const [leadsList, setLeadsList] = useState<Lead[]>([]);
  const [siteVisitsList, setSiteVisitsList] = useState<SiteVisit[]>([]);
  const [bookingsList, setBookingsList] = useState<Booking[]>([]);
  const [commissionsList, setCommissionsList] = useState<Commission[]>([]);
  const [paymentsList, setPaymentsList] = useState<CommissionPayment[]>([]);
  const [structuresList, setStructuresList] = useState<CommissionStructure[]>([]);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Payout modal states
  const [isPayoutOpen, setIsPayoutOpen] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [selectedCommissionId, setSelectedCommissionId] = useState('');
  const [payoutAmountInput, setPayoutAmountInput] = useState('');
  const [paymentMode, setPaymentMode] = useState('BANK_TRANSFER');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [payoutNotes, setPayoutNotes] = useState('');
  const [payoutDate, setPayoutDate] = useState(new Date().toISOString().split('T')[0]);

  // Approval modal states
  const [selectedApproveComm, setSelectedApproveComm] = useState<any | null>(null);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [approvedAmountInput, setApprovedAmountInput] = useState('');
  const [approvalRemarksInput, setApprovalRemarksInput] = useState('');
  const [isRejectMode, setIsRejectMode] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(false);

  // Commission Structure Modal States
  const [isStructOpen, setIsStructOpen] = useState(false);
  const [structProjectId, setStructProjectId] = useState('');
  const [structType, setStructType] = useState('PERCENTAGE'); // PERCENTAGE, FIXED, SLAB
  const [structPercentage, setStructPercentage] = useState('');
  const [structFixedAmount, setStructFixedAmount] = useState('');
  const [structSlabMin, setStructSlabMin] = useState('');
  const [structSlabMax, setStructSlabMax] = useState('');
  const [structEffectiveFrom, setStructEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [structEffectiveTo, setStructEffectiveTo] = useState('');
  const [structStatus, setStructStatus] = useState('active'); // active, inactive
  const [structNotes, setStructNotes] = useState('');
  const [structLoading, setStructLoading] = useState(false);
  const [structError, setStructError] = useState<string | null>(null);

  // Manual Commission Obligation Modal States
  const [isManualCommOpen, setIsManualCommOpen] = useState(false);
  const [manualBookingId, setManualBookingId] = useState('');
  const [manualProjectId, setManualProjectId] = useState('');
  const [manualTowerId, setManualTowerId] = useState('');
  const [manualUnitId, setManualUnitId] = useState('');
  const [manualSaleValue, setManualSaleValue] = useState(0);
  const [manualStructureId, setManualStructureId] = useState('');
  const [manualStructureType, setManualStructureType] = useState('PERCENTAGE');
  const [manualCommissionRate, setManualCommissionRate] = useState('');
  const [manualCommissionAmt, setManualCommissionAmt] = useState('');
  const [manualPayableAmt, setManualPayableAmt] = useState('');
  const [manualRemarks, setManualRemarks] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // Fetch full partner detail data
  const fetchPartnerDetails = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);

    // 1. Fetch channel partner profile
    try {
      const { data, error: cpErr } = await supabase
        .from('channel_partners')
        .select('*')
        .eq('id', id)
        .single();

      if (cpErr) {
        console.error("CHANNEL PARTNER PROFILE LOAD ERROR", {
          message: cpErr.message,
          details: cpErr.details,
          hint: cpErr.hint,
          code: cpErr.code
        });
        throw cpErr;
      }
      setPartner(data);
    } catch (err: any) {
      console.error('Failed to query channel_partners table:', err);
      setError(`Failed to load channel partner details: [${err.code || 'DB_ERROR'}] ${err.message || 'Database connection error'}`);
      setLoading(false);
      return;
    }

    // 2. Fetch Projects (independent catch)
    try {
      const { data, error: projErr } = await supabase
        .from('projects')
        .select('id, project_name');
      if (projErr) {
        console.warn('Projects list query warning:', projErr.message);
      } else {
        setAllProjects(data || []);
        setProjectsMap(new Map(data?.map(p => [p.id, p.project_name]) || []));
      }
    } catch (err) {
      console.warn('Projects query exception:', err);
    }

    // Fetch Towers
    try {
      const { data, error: towerErr } = await supabase
        .from('towers')
        .select('id, tower_name');
      if (!towerErr && data) {
        setTowersMap(new Map(data.map(t => [t.id, t.tower_name || ''])));
      }
    } catch (err) {
      console.warn('Towers query exception:', err);
    }

    // Fetch Units
    try {
      const { data, error: unitErr } = await supabase
        .from('project_inventory')
        .select('id, unit_number');
      if (!unitErr && data) {
        setUnitsMap(new Map(data.map(u => [u.id, u.unit_number || ''])));
      }
    } catch (err) {
      console.warn('Units query exception:', err);
    }

    // 3. Fetch cp projects overrides
    try {
      const { data, error: cpProjErr } = await supabase
        .from('channel_partner_projects')
        .select('project_id')
        .eq('channel_partner_id', id);
      if (cpProjErr) {
        console.warn('Channel partner projects link query warning:', cpProjErr.message);
      } else {
        setAssignedProjectIds(data?.map(p => p.project_id) || []);
      }
    } catch (err) {
      console.warn('Channel partner projects overrides exception:', err);
    }

    let cpLeadIds: string[] = [];

    // 4. Fetch leads attributed
    try {
      const { data, error: leadErr } = await supabase
        .from('leads')
        .select('*')
        .eq('channel_partner_id', id)
        .order('created_at', { ascending: false });
      if (leadErr) {
        console.warn('Leads query warning (leads.channel_partner_id column may be missing):', leadErr.message);
      } else {
        setLeadsList(data || []);
        cpLeadIds = data?.map(l => l.id) || [];
      }
    } catch (err) {
      console.warn('Leads query exception:', err);
    }

    // 5. Fetch site visits attributed
    try {
      if (cpLeadIds.length > 0) {
        const { data, error: visitErr } = await supabase
          .from('site_visits')
          .select('*')
          .in('lead_id', cpLeadIds)
          .order('scheduled_at', { ascending: false });
        if (visitErr) {
          console.warn('Site visits query warning:', visitErr.message);
        } else {
          setSiteVisitsList(data || []);
        }
      } else {
        setSiteVisitsList([]);
      }
    } catch (err) {
      console.warn('Site visits query exception:', err);
    }

    // 6. Fetch bookings attributed
    try {
      const { data, error: bookingErr } = await supabase
        .from('bookings')
        .select('*')
        .eq('channel_partner_id', id)
        .order('booking_date', { ascending: false });
      if (bookingErr) {
        console.warn('Bookings query warning (bookings.channel_partner_id column may be missing):', bookingErr.message);
      } else {
        setBookingsList(data || []);
      }
    } catch (err) {
      console.warn('Bookings query exception:', err);
    }

    // 7. Fetch commissions snapshot (cp_commissions)
    let fetchedCommIds: string[] = [];
    try {
      const { data, error: commErr } = await supabase
        .from('cp_commissions')
        .select('*')
        .eq('cp_id', id)
        .order('created_at', { ascending: false });
      if (commErr) {
        console.warn('Commissions table query warning:', commErr.message);
      } else {
        setCommissionsList(data || []);
        fetchedCommIds = (data || []).map(c => c.id);
      }
    } catch (err) {
      console.warn('Commissions query exception:', err);
    }

    // 8. Fetch payments disbursements (cp_commission_payouts)
    try {
      if (fetchedCommIds.length > 0) {
        const { data, error: payErr } = await supabase
          .from('cp_commission_payouts')
          .select('*')
          .in('commission_id', fetchedCommIds)
          .order('payment_date', { ascending: false });
        if (payErr) {
          console.warn('Commission payments query warning:', payErr.message);
        } else {
          setPaymentsList(data || []);
        }
      } else {
        setPaymentsList([]);
      }
    } catch (err) {
      console.warn('Commission payments query exception:', err);
    }

    // 9. Fetch commission structures
    try {
      const { data, error: structErr } = await supabase
        .from('commission_structures')
        .select('*')
        .eq('cp_id', id)
        .order('effective_from', { ascending: false });
      if (structErr) {
        console.warn('Commission structures query warning:', structErr.message);
      } else {
        setStructuresList(data || []);
      }
    } catch (err) {
      console.warn('Commission structures query exception:', err);
    }

    setLoading(false);
    setSyncing(false);
  }, [id]);

  useEffect(() => {
    fetchPartnerDetails();
  }, [fetchPartnerDetails]);

  // Toast timer
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleSync = async () => {
    setSyncing(true);
    await fetchPartnerDetails();
  };

  // Commission Approval / Rejection Actions
  const handleApproveAction = async (approvedAmt: number, remarksText: string) => {
    if (!selectedApproveComm) return;
    if (approvedAmt < 0) {
      setNotification({ type: 'error', message: 'Approved amount cannot be negative.' });
      return;
    }
    if (approvedAmt > selectedApproveComm.commission_amount) {
      setNotification({ type: 'error', message: 'Approved amount cannot exceed commission amount.' });
      return;
    }
    setApprovalLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id || null;

      const pendingAmt = Math.max(0, approvedAmt - (selectedApproveComm.paid_amount || 0));
      const nextStatus = pendingAmt === 0 && approvedAmt > 0 ? 'paid' : (selectedApproveComm.paid_amount > 0 ? 'partially_paid' : 'approved');

      const { error } = await supabase
        .from('cp_commissions')
        .update({
          status: nextStatus,
          payable_amount: approvedAmt,
          pending_amount: pendingAmt,
          approved_by: userId,
          approved_at: new Date().toISOString(),
          remarks: remarksText.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedApproveComm.id);

      if (error) throw error;

      setCommissionsList(prev =>
        prev.map(c =>
          c.id === selectedApproveComm.id
            ? {
                ...c,
                status: nextStatus,
                payable_amount: approvedAmt,
                pending_amount: pendingAmt,
                approved_by: userId,
                approved_at: new Date().toISOString(),
                remarks: remarksText.trim() || null
              }
            : c
        )
      );

      setNotification({
        type: 'success',
        message: `Commission obligation approved successfully for ₹${approvedAmt.toLocaleString('en-IN')}.`
      });
      setIsApproveOpen(false);
      setSelectedApproveComm(null);
    } catch (err: any) {
      console.error('Commission approval error:', err);
      setNotification({ type: 'error', message: err.message || 'Failed to approve commission.' });
    } finally {
      setApprovalLoading(false);
    }
  };

  const handleRejectAction = async (reason: string) => {
    if (!selectedApproveComm) return;
    if (!reason.trim()) {
      setNotification({ type: 'error', message: 'Rejection reason is mandatory.' });
      return;
    }
    setApprovalLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id || null;

      const { error } = await supabase
        .from('cp_commissions')
        .update({
          status: 'cancelled',
          payable_amount: 0,
          pending_amount: 0,
          remarks: reason.trim(),
          approved_by: userId,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedApproveComm.id);

      if (error) throw error;

      setCommissionsList(prev =>
        prev.map(c =>
          c.id === selectedApproveComm.id
            ? {
                ...c,
                status: 'REJECTED',
                payable_amount: 0,
                pending_amount: 0,
                remarks: reason.trim(),
                approved_by: userId,
                approved_at: new Date().toISOString()
              }
            : c
        )
      );

      setNotification({
        type: 'success',
        message: 'Commission obligation has been successfully rejected.'
      });
      setIsApproveOpen(false);
      setSelectedApproveComm(null);
    } catch (err: any) {
      console.error('Commission rejection error:', err);
      setNotification({ type: 'error', message: err.message || 'Failed to reject commission.' });
    } finally {
      setApprovalLoading(false);
    }
  };

  // Junction project mapping updates
  const handleToggleProject = async (projId: string, checked: boolean) => {
    if (!id) return;
    try {
      if (checked) {
        const { error: insertErr } = await supabase
          .from('channel_partner_projects')
          .insert([{ 
            channel_partner_id: id, 
            project_id: projId
          }]);
        if (insertErr) throw insertErr;
        setAssignedProjectIds(prev => [...prev, projId]);
      } else {
        const { error: deleteErr } = await supabase
          .from('channel_partner_projects')
          .delete()
          .eq('channel_partner_id', id)
          .eq('project_id', projId);
        if (deleteErr) throw deleteErr;
        setAssignedProjectIds(prev => prev.filter(pId => pId !== projId));
      }
      setNotification({ type: 'success', message: 'Project assignment updated.' });
    } catch (err: any) {
      console.error('Junction update failed:', err);
      setNotification({ type: 'error', message: err.message || 'Failed to update project assignment.' });
    }
  };

  // Record payout submission
  const handlePayoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCommissionId) {
      setPayoutError('Please select an approved commission obligation.');
      return;
    }
    const amt = parseFloat(payoutAmountInput) || 0;
    if (amt <= 0) {
      setPayoutError('Payment amount must be greater than zero.');
      return;
    }

    setPayoutError(null);
    setPayoutLoading(true);

    try {
      const selectedComm = commissionsList.find(c => c.id === selectedCommissionId);
      if (!selectedComm) throw new Error('Selected commission record not found.');

      const outstanding = selectedComm.pending_amount ?? selectedComm.commission_amount;
      if (amt > outstanding) {
        throw new Error(`Payment exceeds the remaining outstanding commission balance of ₹${outstanding.toLocaleString('en-IN')}. Overpayment is denied.`);
      }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id || null;

      // 1. Insert payout record into cp_commission_payouts
      const { error: payErr } = await supabase
        .from('cp_commission_payouts')
        .insert([
          {
            commission_id: selectedCommissionId,
            amount: amt,
            payment_date: payoutDate || new Date().toISOString().split('T')[0],
            payment_mode: paymentMode,
            reference_number: referenceNumber.trim() || null,
            notes: payoutNotes.trim() || null,
            recorded_by: userId
          }
        ]);

      if (payErr) throw payErr;

      // 2. Calculate new paid amount, pending amount and status
      const totalPaid = (selectedComm.paid_amount || 0) + amt;
      const payableAmt = selectedComm.payable_amount ?? selectedComm.commission_amount;
      const nextPending = Math.max(0, payableAmt - totalPaid);
      const nextCommStatus = totalPaid >= payableAmt ? 'paid' : 'partially_paid';

      // 3. Update cp_commissions
      const { error: commUpdateErr } = await supabase
        .from('cp_commissions')
        .update({
          status: nextCommStatus,
          paid_amount: totalPaid,
          pending_amount: nextPending,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedCommissionId);

      if (commUpdateErr) throw commUpdateErr;

      setNotification({
        type: 'success',
        message: `Commission payout of ₹${amt.toLocaleString('en-IN')} successfully logged!`
      });

      setIsPayoutOpen(false);
      setSelectedCommissionId('');
      setPayoutAmountInput('');
      setReferenceNumber('');
      setPayoutNotes('');
      await fetchPartnerDetails();
    } catch (err: any) {
      console.error('Payout failed:', err);
      setPayoutError(err.message || 'Failed to record commission payout.');
    } finally {
      setPayoutLoading(false);
    }
  };

  // Create Commission Structure submission
  const handleCreateStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    setStructLoading(true);
    setStructError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id || null;

      // 1. Check for overlapping active structures
      if (structStatus === 'active') {
        const query = supabase
          .from('commission_structures')
          .select('id')
          .eq('cp_id', id)
          .eq('status', 'active');
        if (structProjectId) {
          query.eq('project_id', structProjectId);
        } else {
          query.is('project_id', null);
        }
        const { data: overlapData, error: checkErr } = await query;
        if (checkErr) throw checkErr;
        if (overlapData && overlapData.length > 0) {
          throw new Error('An active commission structure already exists for this Project configuration. Please set the existing one to Inactive first.');
        }
      }

      // 2. Insert structure
      const { error: insertErr } = await supabase
        .from('commission_structures')
        .insert([
          {
            cp_id: id,
            project_id: structProjectId || null,
            structure_type: structType,
            commission_percentage: structType === 'PERCENTAGE' || structType === 'SLAB' ? parseFloat(structPercentage) || 0 : null,
            fixed_amount: structType === 'FIXED' ? parseFloat(structFixedAmount) || 0 : null,
            slab_min: structType === 'SLAB' ? parseFloat(structSlabMin) || 0 : null,
            slab_max: structType === 'SLAB' ? parseFloat(structSlabMax) || 0 : null,
            effective_from: structEffectiveFrom,
            effective_to: structEffectiveTo || null,
            status: structStatus,
            notes: structNotes.trim() || null,
            created_by: userId
          }
        ]);

      if (insertErr) throw insertErr;

      setNotification({ type: 'success', message: 'Commission structure created successfully!' });
      setIsStructOpen(false);
      setStructProjectId('');
      setStructType('PERCENTAGE');
      setStructPercentage('');
      setStructFixedAmount('');
      setStructSlabMin('');
      setStructSlabMax('');
      setStructEffectiveFrom(new Date().toISOString().split('T')[0]);
      setStructEffectiveTo('');
      setStructStatus('active');
      setStructNotes('');
      await fetchPartnerDetails();
    } catch (err: any) {
      console.error('Failed to create commission structure:', err);
      setStructError(err.message || 'Failed to create commission structure.');
    } finally {
      setStructLoading(false);
    }
  };

  // Booking selection onChange handler for manual commission
  const handleManualBookingChange = async (bookingId: string) => {
    setManualBookingId(bookingId);
    if (!bookingId) {
      setManualProjectId('');
      setManualTowerId('');
      setManualUnitId('');
      setManualSaleValue(0);
      return;
    }

    const booking = bookingsList.find(b => b.id === bookingId);
    if (booking) {
      setManualProjectId(booking.project_id || '');
      setManualTowerId(booking.tower_id || '');
      setManualUnitId(booking.inventory_id || '');
      
      const saleVal = booking.consideration_amount || booking.booking_amount || 0;
      setManualSaleValue(saleVal);

      // Auto-load commission structure active for this CP + Project
      const matchingStruct = structuresList.find(
        s => s.status === 'active' && 
        (s.project_id === booking.project_id || s.project_id === null)
      );

      if (matchingStruct) {
        setManualStructureId(matchingStruct.id);
        setManualStructureType(matchingStruct.structure_type);
        
        let calculatedRate = 0;
        let calculatedAmt = 0;

        if (matchingStruct.structure_type === 'PERCENTAGE') {
          calculatedRate = matchingStruct.commission_percentage || 0;
          calculatedAmt = (saleVal * calculatedRate) / 100;
        } else if (matchingStruct.structure_type === 'FIXED') {
          calculatedAmt = matchingStruct.fixed_amount || 0;
        } else if (matchingStruct.structure_type === 'SLAB') {
          calculatedRate = matchingStruct.commission_percentage || 0;
          calculatedAmt = (saleVal * calculatedRate) / 100;
        }

        setManualCommissionRate(calculatedRate.toString());
        setManualCommissionAmt(calculatedAmt.toString());
        setManualPayableAmt(calculatedAmt.toString());
      } else {
        setManualStructureId('');
        setManualCommissionRate('0');
        setManualCommissionAmt('0');
        setManualPayableAmt('0');
      }
    }
  };

  // Create Manual Commission Obligation submission
  const handleCreateManualCommission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBookingId) {
      setManualError('Please select a booking.');
      return;
    }
    const commAmt = parseFloat(manualCommissionAmt) || 0;
    const payAmt = parseFloat(manualPayableAmt) || 0;

    if (commAmt < 0 || payAmt < 0) {
      setManualError('Amounts cannot be negative.');
      return;
    }

    setManualLoading(true);
    setManualError(null);

    try {
      // 1. Check for duplicates using booking_id
      const { data: existingComm, error: checkErr } = await supabase
        .from('cp_commissions')
        .select('id')
        .eq('booking_id', manualBookingId)
        .maybeSingle();

      if (checkErr) throw checkErr;
      if (existingComm) {
        throw new Error('This booking already has a commission obligation. Duplicate creation is blocked.');
      }

      // 2. Insert into cp_commissions
      const { error: insertErr } = await supabase
        .from('cp_commissions')
        .insert([
          {
            cp_id: id,
            booking_id: manualBookingId,
            commission_percentage: parseFloat(manualCommissionRate) || 0,
            commission_amount: commAmt,
            payable_amount: payAmt,
            paid_amount: 0,
            pending_amount: payAmt,
            status: 'pending',
            remarks: manualRemarks.trim() || null
          }
        ]);

      if (insertErr) throw insertErr;

      setNotification({ type: 'success', message: 'Manual commission obligation recorded successfully!' });
      setIsManualCommOpen(false);
      setManualBookingId('');
      setManualProjectId('');
      setManualTowerId('');
      setManualUnitId('');
      setManualSaleValue(0);
      setManualStructureId('');
      setManualStructureType('PERCENTAGE');
      setManualCommissionRate('');
      setManualCommissionAmt('');
      setManualPayableAmt('');
      setManualRemarks('');
      await fetchPartnerDetails();
    } catch (err: any) {
      console.error('Failed to create manual commission:', err);
      setManualError(err.message || 'Failed to record manual commission obligation.');
    } finally {
      setManualLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-100 border-t-indigo-600 mx-auto mb-4"></div>
        <p className="text-slate-500 font-medium">Loading Channel Partner profile...</p>
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center text-slate-500">
        <AlertCircle className="h-10 w-10 text-rose-500 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-800">Channel Partner Not Found</h3>
        <p className="text-xs text-slate-400 mt-1">This partner profile may have been deactivated or suspended.</p>
        <button onClick={() => navigate('/channel-partners')} className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold">
          Back to Directory
        </button>
      </div>
    );
  }

  // Perform KPI calculations with fallbacks
  const totalLeads = leadsList.length;
  const siteVisits = siteVisitsList.length;
  
  // Attributed confirmed bookings
  const confirmedBookingsList = bookingsList.filter(b => b.status?.toLowerCase() === 'confirmed');
  const bookingsCount = confirmedBookingsList.length;
  
  // Attributed cancelled bookings
  const cancelledBookingsList = bookingsList.filter(b => b.status?.toLowerCase() === 'cancelled');
  const cancelledCount = cancelledBookingsList.length;

  const salesValue = confirmedBookingsList.reduce((sum, b) => {
    return sum + (b.total_payable_amount !== null && b.total_payable_amount !== undefined ? b.total_payable_amount : (b.booking_amount || 0));
  }, 0);

  const totalCommission = commissionsList
    .filter(c => {
      const s = c.status?.toLowerCase();
      return s !== 'cancelled' && s !== 'rejected';
    })
    .reduce((sum, c) => sum + (c.commission_amount || 0), 0);
  const pendingApprovalComm = commissionsList
    .filter(c => c.status?.toLowerCase() === 'pending')
    .reduce((sum, c) => sum + (c.commission_amount || 0), 0);
  const approvedPayableComm = commissionsList
    .filter(c => {
      const s = c.status?.toLowerCase();
      return s === 'approved' || s === 'partially_paid';
    })
    .reduce((sum, c) => sum + (c.payable_amount || 0), 0);
  const commissionPaid = commissionsList
    .reduce((sum, c) => sum + (c.paid_amount || 0), 0);
  const outstandingComm = commissionsList
    .filter(c => {
      const s = c.status?.toLowerCase();
      return s === 'approved' || s === 'partially_paid';
    })
    .reduce((sum, c) => sum + (c.pending_amount || 0), 0);

  const code = partner.cp_code || partner.partner_code || '—';
  const name = partner.name || '—';
  const phoneVal = partner.phone || partner.mobile || '—';
  const companyVal = partner.company_name || '—';
  const validFromVal = partner.rera_valid_from || partner.valid_from || '—';
  const validToVal = partner.rera_valid_to || partner.valid_to || '—';
  const commissionVal = partner.default_commission_rate || partner.commission_value || 0;

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
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-start space-x-2.5 mb-6 animate-in fade-in">
          <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <span className="text-sm font-semibold leading-tight">{error}</span>
        </div>
      )}

      {/* BACK NAVIGATION */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/channel-partners')}
          className="inline-flex items-center space-x-1 text-xs font-semibold text-slate-600 hover:text-indigo-600 transition-colors focus:outline-none"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Directory</span>
        </button>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-semibold shadow-sm transition-all focus:outline-none"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          <span>Sync Profile</span>
        </button>
      </div>

      {/* PROFILE CARD */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-start justify-between gap-6 text-left">
        <div className="flex items-start space-x-4">
          <div className="bg-indigo-50 text-indigo-700 p-4 rounded-2xl flex-shrink-0">
            <Users className="h-8 w-8" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2">
              <span className="bg-slate-100 text-slate-800 text-xxs font-bold uppercase tracking-wider px-2 py-0.5 rounded">
                {code}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xxs font-bold uppercase tracking-wider ${
                partner.status === 'active' || partner.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {partner.status}
              </span>
            </div>
            <h3 className="text-xl font-bold text-slate-900 leading-tight">{name}</h3>
            <p className="text-slate-500 text-xs font-medium">
              {companyVal ? `${companyVal} — ` : ''}{partner.partner_type || 'CHANNEL PARTNER'}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600 text-xs pt-1.5">
              <span>📞 {phoneVal}</span>
              <span>✉️ {partner.email || 'No Email'}</span>
              <span>🏠 {partner.rera_number ? `RERA: ${partner.rera_number}` : 'No RERA'}</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 md:w-80 space-y-2.5 text-xs text-slate-700">
          <h4 className="text-xxs font-bold text-slate-400 uppercase tracking-wider">Commission settings</h4>
          <div className="flex justify-between">
            <span className="text-slate-500">Commission Structure:</span>
            <span className="font-semibold text-slate-800">
              {partner.commission_type === 'PERCENTAGE' 
                ? `${commissionVal}%` 
                : partner.commission_type === 'FIXED'
                ? `₹${(partner.default_commission_amount || partner.commission_value || 0).toLocaleString('en-IN')}`
                : 'Slab Structure'}
            </span>
          </div>
          <div className="border-t border-slate-200 pt-2 flex justify-between font-semibold">
            <span className="text-slate-800">Commissions Earned:</span>
            <span className="text-indigo-650 font-bold">₹{totalCommission.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>

      {/* KPI METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-center">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Total Leads</span>
          <span className="block text-lg font-extrabold text-slate-900 mt-1">{totalLeads}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-center">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Site Visits</span>
          <span className="block text-lg font-extrabold text-slate-900 mt-1">{siteVisits}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-center">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Bookings</span>
          <span className="block text-lg font-extrabold text-slate-900 mt-1">{bookingsCount}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-center">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Cancelled</span>
          <span className="block text-lg font-extrabold text-rose-600 mt-1">{cancelledCount}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-center col-span-2 sm:col-span-1">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Sales Value</span>
          <span className="block text-sm font-bold text-slate-900 mt-1.5 truncate">₹{salesValue.toLocaleString('en-IN')}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-center">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Conversion %</span>
          <span className="block text-lg font-extrabold text-indigo-600 mt-1">
            {totalLeads > 0 ? ((bookingsCount / totalLeads) * 100).toFixed(1) : '0.0'}%
          </span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-center">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Total Comm.</span>
          <span className="block text-sm font-bold text-slate-900 mt-1.5 truncate">₹{totalCommission.toLocaleString('en-IN')}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-center">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Pending Appr.</span>
          <span className="block text-sm font-bold text-amber-500 mt-1.5 truncate">₹{pendingApprovalComm.toLocaleString('en-IN')}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-center">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Appr/Payable</span>
          <span className="block text-sm font-bold text-indigo-600 mt-1.5 truncate">₹{approvedPayableComm.toLocaleString('en-IN')}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-center">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Paid Comm.</span>
          <span className="block text-sm font-bold text-emerald-650 mt-1.5 truncate">₹{commissionPaid.toLocaleString('en-IN')}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-center">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Outstanding</span>
          <span className="block text-sm font-bold text-rose-600 mt-1.5 truncate">₹{outstandingComm.toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* TABS SELECTOR */}
      <div className="border-b border-slate-200 flex flex-wrap gap-2">
        {(['overview', 'leads', 'visits', 'bookings', 'commission', 'payouts', 'projects', 'structure'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 border-b-2 font-semibold text-xs uppercase tracking-wider transition-colors ${
              activeTab === tab 
                ? 'border-indigo-600 text-indigo-600' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab === 'commission' 
              ? 'Commission' 
              : tab === 'visits' 
              ? 'Site Visits' 
              : tab === 'payouts' 
              ? 'Payouts' 
              : tab === 'structure' 
              ? 'Commission Structure' 
              : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* TABS CONTAINER */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6 text-left">
            <div>
              <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-3">Partner Contact & Location</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-slate-700">
                <div>
                  <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Contact Person</span>
                  <span className="font-semibold text-slate-800">{partner.contact_person || '—'}</span>
                </div>
                <div>
                  <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Registered Address</span>
                  <span className="font-semibold text-slate-800">
                    {partner.address ? `${partner.address}, ${partner.city || ''}, ${partner.state || ''} - ${partner.pincode || ''}` : '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-150 pt-5">
              <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-3">Regulatory & Tax Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-slate-700">
                <div>
                  <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">RERA Registration</span>
                  <span className="font-semibold text-slate-800">{partner.rera_number || '—'}</span>
                </div>
                <div>
                  <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">RERA Validity Period</span>
                  <span className="font-semibold text-slate-800 text-xs">
                    {validFromVal !== '—' ? `${validFromVal} to ${validToVal}` : '—'}
                  </span>
                </div>
                <div>
                  <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">PAN Number</span>
                  <span className="font-semibold text-slate-800 font-mono">{partner.pan_number || '—'}</span>
                </div>
                <div>
                  <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">GST Number</span>
                  <span className="font-semibold text-slate-800 font-mono">{partner.gst_number || '—'}</span>
                </div>
              </div>
            </div>


            <div className="border-t border-slate-150 pt-5">
              <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2">Internal Biographies / Notes</h4>
              <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-sm text-slate-700 leading-relaxed max-h-[150px] overflow-y-auto">
                {partner.notes || 'No notes mapped.'}
              </div>
            </div>
          </div>
        )}

        {/* LEADS TAB */}
        {activeTab === 'leads' && (
          <div className="overflow-x-auto text-left">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-2.5 px-4">Lead Name</th>
                  <th className="py-2.5 px-4">Phone</th>
                  <th className="py-2.5 px-4">Email</th>
                  <th className="py-2.5 px-4">Project Focus</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Created Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leadsList.length > 0 ? (
                  leadsList.map(l => (
                    <tr key={l.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-semibold text-slate-900">{l.customer_name}</td>
                      <td className="py-3 px-4 text-slate-600">{l.mobile || '—'}</td>
                      <td className="py-3 px-4 text-slate-600 text-xs">{l.email || '—'}</td>
                      <td className="py-3 px-4 text-slate-650">{projectsMap.get(l.project_id || '') || 'N/A'}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xxs font-semibold ${
                          l.status === 'booked' ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'
                        }`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-xs">{new Date(l.created_at).toLocaleDateString('en-IN')}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400 italic">No leads registered from this channel partner.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* SITE VISITS TAB */}
        {activeTab === 'visits' && (
          <div className="overflow-x-auto text-left">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-2.5 px-4">Scheduled At</th>
                  <th className="py-2.5 px-4">Project</th>
                  <th className="py-2.5 px-4">Remarks</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {siteVisitsList.length > 0 ? (
                  siteVisitsList.map(v => (
                    <tr key={v.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 text-slate-800 font-semibold">
                        {v.scheduled_at ? new Date(v.scheduled_at).toLocaleString('en-IN') : '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-650">{projectsMap.get(v.project_id || '') || 'N/A'}</td>
                      <td className="py-3 px-4 text-slate-600 text-xs truncate max-w-[250px]">{v.remarks || '—'}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xxs font-bold uppercase ${
                          v.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {v.status || 'Scheduled'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-slate-400 italic">No site visits logged for this channel partner.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* BOOKINGS TAB */}
        {activeTab === 'bookings' && (
          <div className="overflow-x-auto text-left">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-2.5 px-4">Booking #</th>
                  <th className="py-2.5 px-4">Customer Name</th>
                  <th className="py-2.5 px-4">Project</th>
                  <th className="py-2.5 px-4">Base Amount</th>
                  <th className="py-2.5 px-4">Total Payable</th>
                  <th className="py-2.5 px-4">Booking Date</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bookingsList.length > 0 ? (
                  bookingsList.map(b => (
                    <tr key={b.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800 text-xs">{b.booking_number || 'N/A'}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{b.customer_name}</td>
                      <td className="py-3 px-4 text-slate-600">{projectsMap.get(b.project_id || '') || 'N/A'}</td>
                      <td className="py-3 px-4 text-slate-700">₹{(b.consideration_amount || b.booking_amount || 0).toLocaleString('en-IN')}</td>
                      <td className="py-3 px-4 font-extrabold text-indigo-700">₹{(b.total_payable_amount || b.booking_amount || 0).toLocaleString('en-IN')}</td>
                      <td className="py-3 px-4 text-slate-500 text-xs">{b.booking_date ? new Date(b.booking_date).toLocaleDateString('en-IN') : '—'}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xxs font-bold uppercase tracking-wider ${
                          b.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400 italic">No bookings attributed to this channel partner.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* COMMISSION LEDGER TAB */}
        {activeTab === 'commission' && (
          <div className="space-y-4 text-left">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-xs font-bold text-indigo-650 uppercase tracking-wider">Commission ledger</h4>
              {isAuthorized && (
                <button
                  onClick={() => {
                    setIsManualCommOpen(true);
                    setManualBookingId('');
                    setManualProjectId('');
                    setManualTowerId('');
                    setManualUnitId('');
                    setManualSaleValue(0);
                    setManualStructureId('');
                    setManualCommissionRate('0');
                    setManualCommissionAmt('0');
                    setManualPayableAmt('0');
                    setManualRemarks('');
                    setManualError(null);
                  }}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all focus:outline-none"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>+ Add Commission</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-2.5 px-4">Booking #</th>
                    <th className="py-2.5 px-4">Project</th>
                    <th className="py-2.5 px-4">Tower</th>
                    <th className="py-2.5 px-4">Unit</th>
                    <th className="py-2.5 px-4">Sale Value</th>
                    <th className="py-2.5 px-4">Structure</th>
                    <th className="py-2.5 px-4">Rate</th>
                    <th className="py-2.5 px-4">Comm Amt</th>
                    <th className="py-2.5 px-4">Approved Amt</th>
                    <th className="py-2.5 px-4">Paid Amt</th>
                    <th className="py-2.5 px-4">Outstanding</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {commissionsList.length > 0 ? (
                    commissionsList.map(c => {
                      const booking = bookingsList.find(b => b.id === c.booking_id);
                      const bookingNum = booking?.booking_number || 'N/A';
                      const projName = booking ? projectsMap.get(booking.project_id || '') : 'N/A';
                      const towerName = booking ? towersMap.get(booking.tower_id || '') : 'N/A';
                      const unitNumber = booking ? unitsMap.get(booking.inventory_id || '') : 'N/A';
                      const saleValue = booking ? (booking.consideration_amount || booking.booking_amount || 0) : 0;
                      const structure = c.commission_percentage > 0 ? 'PERCENTAGE' : 'FIXED';
                      const rate = c.commission_percentage > 0 ? `${c.commission_percentage}%` : '—';

                      return (
                        <tr key={c.id} className="hover:bg-slate-50/50">
                          <td className="py-3 px-4 font-mono font-bold text-slate-800 text-xs">{bookingNum}</td>
                          <td className="py-3 px-4 text-slate-650 truncate max-w-[120px]">{projName}</td>
                          <td className="py-3 px-4 text-slate-650 truncate max-w-[100px]">{towerName}</td>
                          <td className="py-3 px-4 text-slate-700 font-medium">{unitNumber}</td>
                          <td className="py-3 px-4 text-slate-700 font-mono text-xs">₹{saleValue.toLocaleString('en-IN')}</td>
                          <td className="py-3 px-4 text-slate-600 text-xs">{structure}</td>
                          <td className="py-3 px-4 text-slate-700 font-mono text-xs">{rate}</td>
                          <td className="py-3 px-4 font-bold text-indigo-700 font-mono text-xs">₹{(c.commission_amount || 0).toLocaleString('en-IN')}</td>
                          <td className="py-3 px-4 text-slate-700 font-mono text-xs">₹{(c.payable_amount || 0).toLocaleString('en-IN')}</td>
                          <td className="py-3 px-4 text-emerald-700 font-mono text-xs">₹{(c.paid_amount || 0).toLocaleString('en-IN')}</td>
                          <td className="py-3 px-4 text-rose-700 font-mono text-xs">₹{(c.pending_amount || 0).toLocaleString('en-IN')}</td>
                          <td className="py-3 px-4">
                            {(() => {
                              const statusLower = c.status?.toLowerCase();
                              return (
                                <>
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xxs font-bold uppercase tracking-wider ${
                                    statusLower === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                                    statusLower === 'partially_paid' ? 'bg-blue-50 text-blue-700' :
                                    statusLower === 'approved' ? 'bg-indigo-50 text-indigo-700' :
                                    statusLower === 'pending' ? 'bg-amber-50 text-amber-800' :
                                    (statusLower === 'rejected' || statusLower === 'cancelled') ? 'bg-rose-50 text-rose-800' :
                                    'bg-slate-100 text-slate-500'
                                  }`}>
                                    {c.status}
                                  </span>
                                  {(statusLower === 'rejected' || statusLower === 'cancelled') && c.remarks && (
                                    <span className="block text-[10px] text-rose-600 mt-1 italic max-w-[120px] truncate" title={c.remarks}>
                                      Reason: {c.remarks}
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {(() => {
                              const statusLower = c.status?.toLowerCase();
                              return (
                                <>
                                  {statusLower === 'pending' && isAuthorized && (
                                    <button
                                      onClick={() => {
                                        setSelectedApproveComm(c);
                                        setApprovedAmountInput(c.commission_amount.toString());
                                        setRejectionReason('');
                                        setApprovalRemarksInput('');
                                        setIsRejectMode(false);
                                        setIsApproveOpen(true);
                                      }}
                                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xxs font-bold shadow transition-all focus:outline-none"
                                    >
                                      Approve/Reject
                                    </button>
                                  )}
                                  {(statusLower === 'approved' || statusLower === 'partially_paid') && (c.pending_amount || 0) > 0 && isAuthorized && (
                                    <button
                                      onClick={() => {
                                        setSelectedCommissionId(c.id);
                                        setPayoutAmountInput((c.pending_amount || 0).toString());
                                        setPayoutDate(new Date().toISOString().split('T')[0]);
                                        setPaymentMode('BANK_TRANSFER');
                                        setReferenceNumber('');
                                        setPayoutNotes('');
                                        setIsPayoutOpen(true);
                                      }}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xxs font-bold shadow transition-all focus:outline-none"
                                    >
                                      Pay Commission
                                    </button>
                                  )}
                                  {statusLower === 'paid' && (
                                    <span className="text-emerald-600 text-xxs font-extrabold uppercase">Paid</span>
                                  )}
                                  {statusLower === 'rejected' && (
                                    <span className="text-rose-600 text-xxs font-extrabold uppercase">Rejected</span>
                                  )}
                                  {statusLower === 'cancelled' && (
                                    <span className="text-slate-500 text-xxs font-extrabold uppercase">Cancelled</span>
                                  )}
                                </>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={13} className="py-10 text-center text-slate-400 italic">No commission obligations recorded.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PAYOUTS TAB */}
        {activeTab === 'payouts' && (
          <div className="space-y-4 text-left">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold text-indigo-650 uppercase tracking-wider">Payout ledger</h4>
              {isAuthorized && (
                <button
                  onClick={() => { setSelectedCommissionId(''); setPayoutAmountInput(''); setPayoutDate(new Date().toISOString().split('T')[0]); setIsPayoutOpen(true); }}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all focus:outline-none"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>+ Record Commission Payout</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-2.5 px-4">Booking</th>
                    <th className="py-2.5 px-4">Project</th>
                    <th className="py-2.5 px-4">Disbursed Amount</th>
                    <th className="py-2.5 px-4">Payment Date</th>
                    <th className="py-2.5 px-4">Payment Mode</th>
                    <th className="py-2.5 px-4">Reference Number</th>
                    <th className="py-2.5 px-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paymentsList.length > 0 ? (
                    paymentsList.map(p => {
                      const comm = commissionsList.find(c => c.id === p.commission_id);
                      const booking = comm ? bookingsList.find(b => b.id === comm.booking_id) : null;
                      const projName = booking ? projectsMap.get(booking.project_id || '') : 'N/A';

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/50">
                          <td className="py-3 px-4 font-mono text-slate-600 text-xs">{booking?.booking_number || 'N/A'}</td>
                          <td className="py-3 px-4 text-slate-650">{projName}</td>
                          <td className="py-3 px-4 font-extrabold text-emerald-600">₹{(p.amount || 0).toLocaleString('en-IN')}</td>
                          <td className="py-3 px-4 text-slate-600 text-xs">{new Date(p.payment_date).toLocaleDateString('en-IN')}</td>
                          <td className="py-3 px-4 text-slate-600 text-xs font-semibold">{p.payment_mode}</td>
                          <td className="py-3 px-4 text-slate-500 font-mono text-xs truncate max-w-[120px]">{p.reference_number || '—'}</td>
                          <td className="py-3 px-4 text-slate-600 text-xs max-w-[150px] truncate" title={p.notes || ''}>{p.notes || '—'}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400 italic">No commission payouts logged.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PROJECTS TAB */}
        {activeTab === 'projects' && (
          <div className="space-y-4 text-left">
            <h4 className="text-xs font-bold text-indigo-655 uppercase tracking-wider mb-2">Authorize Projects Overrides</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {allProjects.map(proj => {
                const isAssigned = assignedProjectIds.includes(proj.id);
                return (
                  <label key={proj.id} className="flex items-center space-x-3 bg-slate-50 border border-slate-200 rounded-xl p-4 cursor-pointer hover:bg-slate-100/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={isAssigned}
                      onChange={(e) => handleToggleProject(proj.id, e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-semibold text-slate-800 text-xs">{proj.project_name}</span>
                  </label>
                );
              })}
              {allProjects.length === 0 && (
                <p className="text-slate-400 text-xs italic col-span-3">No active project records exist.</p>
              )}
            </div>
          </div>
        )}

        {/* COMMISSION STRUCTURE TAB */}
        {activeTab === 'structure' && (
          <div className="space-y-4 text-left">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-xs font-bold text-indigo-650 uppercase tracking-wider">Commission Structures</h4>
              {isAuthorized && (
                <button
                  onClick={() => {
                    setIsStructOpen(true);
                    setStructProjectId('');
                    setStructType('PERCENTAGE');
                    setStructPercentage('');
                    setStructFixedAmount('');
                    setStructSlabMin('');
                    setStructSlabMax('');
                    setStructEffectiveFrom(new Date().toISOString().split('T')[0]);
                    setStructEffectiveTo('');
                    setStructStatus('active');
                    setStructNotes('');
                    setStructError(null);
                  }}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all focus:outline-none"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>+ Add Commission Structure</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-2.5 px-4">Project</th>
                    <th className="py-2.5 px-4">Structure Type</th>
                    <th className="py-2.5 px-4">Percentage</th>
                    <th className="py-2.5 px-4">Fixed Amount</th>
                    <th className="py-2.5 px-4">Slab Range</th>
                    <th className="py-2.5 px-4">Effective Date</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {structuresList.length > 0 ? (
                    structuresList.map(s => {
                      const projName = s.project_id ? projectsMap.get(s.project_id) : 'General (All Projects)';
                      return (
                        <tr key={s.id} className="hover:bg-slate-50/50">
                          <td className="py-3 px-4 font-semibold text-slate-800 text-xs">{projName}</td>
                          <td className="py-3 px-4 text-slate-655 font-mono text-xs">{s.structure_type}</td>
                          <td className="py-3 px-4 text-slate-700 font-mono text-xs">{s.commission_percentage !== null ? `${s.commission_percentage}%` : '—'}</td>
                          <td className="py-3 px-4 text-slate-700 font-mono text-xs">
                            {s.fixed_amount !== null ? `₹${s.fixed_amount.toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td className="py-3 px-4 text-slate-700 font-mono text-xs">
                            {s.slab_min !== null || s.slab_max !== null 
                              ? `₹${(s.slab_min || 0).toLocaleString('en-IN')} - ₹${(s.slab_max || 0).toLocaleString('en-IN')}` 
                              : '—'}
                          </td>
                          <td className="py-3 px-4 text-slate-600 text-xs font-mono">
                            {new Date(s.effective_from).toLocaleDateString('en-IN')} {s.effective_to ? `to ${new Date(s.effective_to).toLocaleDateString('en-IN')}` : 'onwards'}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xxs font-bold uppercase tracking-wider ${
                              s.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {s.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-500 text-xs max-w-[150px] truncate" title={s.notes || ''}>{s.notes || '—'}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400 italic">No commission structures assigned.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* RECORD DISBURSEMENT MODAL */}
      {isPayoutOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsPayoutOpen(false)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-left">
            <div className="bg-emerald-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">Record Commission Payout</span>
              <button type="button" onClick={() => setIsPayoutOpen(false)} className="p-1 rounded-lg text-emerald-100 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handlePayoutSubmit}>
              <div className="p-6 space-y-4">
                {payoutError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-start space-x-2.5">
                    <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-semibold leading-tight">{payoutError}</span>
                  </div>
                )}

                 <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Select Approved Commission *</label>
                  <select
                    required
                    value={selectedCommissionId}
                    onChange={(e) => {
                      setSelectedCommissionId(e.target.value);
                      const comm = commissionsList.find(c => c.id === e.target.value);
                      if (comm) {
                        const balance = comm.pending_amount ?? comm.payable_amount ?? comm.commission_amount;
                        setPayoutAmountInput(balance.toString());
                      } else {
                        setPayoutAmountInput('');
                      }
                    }}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                  >
                    <option value="">Select commission obligation...</option>
                    {commissionsList
                      .filter(c => {
                        const statusLower = c.status?.toLowerCase();
                        return statusLower === 'approved' || statusLower === 'partially_paid';
                      })
                      .map(c => {
                        const booking = bookingsList.find(b => b.id === c.booking_id);
                        const bookingNum = booking?.booking_number || 'N/A';
                        const customerNameVal = booking?.customer_name || 'N/A';
                        const unitNo = booking ? unitsMap.get(booking.inventory_id || '') : 'N/A';
                        const balance = c.pending_amount ?? c.payable_amount ?? c.commission_amount;

                        return (
                          <option key={c.id} value={c.id} disabled={balance <= 0}>
                            {code} - {name} \| {bookingNum} \| {customerNameVal} \| Unit {unitNo} \| Payable: ₹{balance.toLocaleString('en-IN')}
                          </option>
                        );
                      })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Payment Amount (₹) *</label>
                  <div className="relative">
                    <DollarSign className="absolute inset-y-0 left-3 h-4.5 w-4.5 text-slate-400 self-center top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="e.g. 20000"
                      value={payoutAmountInput}
                      onChange={(e) => setPayoutAmountInput(e.target.value)}
                      className="block w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Payment Date *</label>
                    <input
                      type="date"
                      required
                      value={payoutDate}
                      onChange={(e) => setPayoutDate(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Payment Mode *</label>
                    <select
                      value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      <option value="BANK_TRANSFER">BANK TRANSFER</option>
                      <option value="NEFT">NEFT</option>
                      <option value="RTGS">RTGS</option>
                      <option value="UPI">UPI</option>
                      <option value="CHEQUE">CHEQUE</option>
                      <option value="CASH">CASH</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Reference Number</label>
                  <input
                    type="text"
                    placeholder="Txn ID / Cheque #"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-850 text-sm focus:bg-white focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Notes</label>
                  <textarea
                    placeholder="Log comments, cheque clearances details, etc."
                    rows={2}
                    value={payoutNotes}
                    onChange={(e) => setPayoutNotes(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPayoutOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={payoutLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow disabled:opacity-50 transition-all focus:outline-none"
                >
                  {payoutLoading ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COMMISSION APPROVAL MODAL */}
      {isApproveOpen && selectedApproveComm && (() => {
        const booking = bookingsList.find(b => b.id === selectedApproveComm.booking_id);
        const bookingNum = booking?.booking_number || 'N/A';
        const customerName = booking?.customer_name || 'N/A';
        const projName = booking ? projectsMap.get(booking.project_id || '') : 'N/A';
        const towerName = booking ? towersMap.get(booking.tower_id || '') : 'N/A';
        const unitNo = booking ? unitsMap.get(booking.inventory_id || '') : 'N/A';
        const saleValue = booking ? (booking.consideration_amount || booking.booking_amount || 0) : 0;
        const structure = selectedApproveComm.commission_percentage > 0 ? 'PERCENTAGE' : 'FIXED';
        const rate = selectedApproveComm.commission_percentage > 0 ? `${selectedApproveComm.commission_percentage}%` : '—';

        return (
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setIsApproveOpen(false); setSelectedApproveComm(null); }} />
            
            <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-left">
              <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
                <span className="font-bold tracking-tight">Approve / Reject Commission</span>
                <button type="button" onClick={() => { setIsApproveOpen(false); setSelectedApproveComm(null); }} className="p-1 rounded-lg text-indigo-100 hover:text-white focus:outline-none">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Detailed Context Info */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <span className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Channel Partner</span>
                    <span className="text-slate-800 font-semibold">{code} - {name}</span>
                  </div>
                  <div>
                    <span className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Booking Number</span>
                    <span className="text-slate-800 font-semibold font-mono">{bookingNum}</span>
                  </div>
                  <div>
                    <span className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Customer / Lead</span>
                    <span className="text-slate-800 font-semibold">{customerName}</span>
                  </div>
                  <div>
                    <span className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Project</span>
                    <span className="text-slate-800 font-semibold">{projName}</span>
                  </div>
                  <div>
                    <span className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Tower & Unit</span>
                    <span className="text-slate-800 font-semibold">
                      {towerName} - {unitNo}
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Sale Value (Base)</span>
                    <span className="text-slate-800 font-semibold font-mono">₹{saleValue.toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Structure & Rate</span>
                    <span className="text-slate-800 font-semibold">
                      {structure} ({rate})
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Calculated Commission</span>
                    <span className="text-slate-800 font-bold text-indigo-700 font-mono">₹{(selectedApproveComm.commission_amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {!isRejectMode ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Approved Commission Amount (₹) *</label>
                      <div className="relative">
                        <DollarSign className="absolute inset-y-0 left-3 h-4.5 w-4.5 text-slate-400 self-center top-1/2 -translate-y-1/2" />
                        <input
                          type="number"
                          required
                          min="1"
                          placeholder="Approved amount"
                          value={approvedAmountInput}
                          onChange={(e) => setApprovedAmountInput(e.target.value)}
                          className="block w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Approval Remarks / Notes</label>
                      <textarea
                        placeholder="Log any notes or reason for approved amount modification..."
                        rows={2}
                        value={approvalRemarksInput}
                        onChange={(e) => setApprovalRemarksInput(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all resize-none"
                      />
                    </div>

                    <div className="bg-slate-50 px-6 py-4 flex justify-between border-t border-slate-100 rounded-b-2xl">
                      <button
                        type="button"
                        onClick={() => setIsRejectMode(true)}
                        className="px-4 py-2 border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-bold transition-all focus:outline-none"
                      >
                        Reject Commission
                      </button>
                      <div className="flex space-x-2">
                        <button
                          type="button"
                          onClick={() => { setIsApproveOpen(false); setSelectedApproveComm(null); }}
                          className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors focus:outline-none"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={approvalLoading}
                          onClick={() => handleApproveAction(parseFloat(approvedAmountInput) || 0, approvalRemarksInput)}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow transition-all disabled:opacity-50 focus:outline-none"
                        >
                          {approvalLoading ? 'Processing...' : 'Approve Commission'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Rejection Reason *</label>
                      <textarea
                        required
                        placeholder="Please provide a mandatory reason for rejection..."
                        rows={3}
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all resize-none"
                      />
                    </div>

                    <div className="bg-slate-50 px-6 py-4 flex justify-between border-t border-slate-100 rounded-b-2xl">
                      <button
                        type="button"
                        onClick={() => setIsRejectMode(false)}
                        className="px-4 py-2 text-slate-655 hover:bg-slate-100 rounded-xl text-xs font-bold transition-all focus:outline-none"
                      >
                        Back to Approval
                      </button>
                      <div className="flex space-x-2">
                        <button
                          type="button"
                          onClick={() => { setIsApproveOpen(false); setSelectedApproveComm(null); }}
                          className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors focus:outline-none"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={approvalLoading}
                          onClick={() => handleRejectAction(rejectionReason)}
                          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow transition-all disabled:opacity-50 focus:outline-none"
                        >
                          {approvalLoading ? 'Rejecting...' : 'Confirm Rejection'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ADD COMMISSION STRUCTURE MODAL */}
      {isStructOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsStructOpen(false)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-left">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">Add Commission Structure</span>
              <button type="button" onClick={() => setIsStructOpen(false)} className="p-1 rounded-lg text-indigo-100 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStructure}>
              <div className="p-6 space-y-4">
                {structError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-start space-x-2.5">
                    <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-semibold leading-tight">{structError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Project (Optional)</label>
                  <select
                    value={structProjectId}
                    onChange={(e) => setStructProjectId(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                  >
                    <option value="">General (All Projects)</option>
                    {allProjects.map(p => (
                      <option key={p.id} value={p.id}>{p.project_name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Structure Type *</label>
                    <select
                      value={structType}
                      onChange={(e) => setStructType(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      <option value="PERCENTAGE">Percentage</option>
                      <option value="FIXED">Fixed Amount</option>
                      <option value="SLAB">Slab</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Status *</label>
                    <select
                      value={structStatus}
                      onChange={(e) => setStructStatus(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                {structType === 'PERCENTAGE' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Commission Percentage (%) *</label>
                    <input
                      type="number"
                      required
                      step="0.0001"
                      min="0"
                      placeholder="e.g. 2.0"
                      value={structPercentage}
                      onChange={(e) => setStructPercentage(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                )}

                {structType === 'FIXED' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Fixed Commission Amount (₹) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      placeholder="e.g. 50000"
                      value={structFixedAmount}
                      onChange={(e) => setStructFixedAmount(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                )}

                {structType === 'SLAB' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Slab Min Value (₹)</label>
                        <input
                          type="number"
                          placeholder="Min booking amount"
                          value={structSlabMin}
                          onChange={(e) => setStructSlabMin(e.target.value)}
                          className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Slab Max Value (₹)</label>
                        <input
                          type="number"
                          placeholder="Max booking amount"
                          value={structSlabMax}
                          onChange={(e) => setStructSlabMax(e.target.value)}
                          className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Commission Rate (%) *</label>
                      <input
                        type="number"
                        required
                        step="0.0001"
                        min="0"
                        placeholder="e.g. 3.5"
                        value={structPercentage}
                        onChange={(e) => setStructPercentage(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Effective From *</label>
                    <input
                      type="date"
                      required
                      value={structEffectiveFrom}
                      onChange={(e) => setStructEffectiveFrom(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Effective To</label>
                    <input
                      type="date"
                      value={structEffectiveTo}
                      onChange={(e) => setStructEffectiveTo(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Notes</label>
                  <textarea
                    placeholder="Provide any additional criteria or structure details..."
                    rows={2}
                    value={structNotes}
                    onChange={(e) => setStructNotes(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all resize-none"
                  />
                </div>
              </div>

              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsStructOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={structLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow disabled:opacity-50 transition-all focus:outline-none"
                >
                  {structLoading ? 'Saving...' : 'Add Structure'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD MANUAL COMMISSION MODAL */}
      {isManualCommOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsManualCommOpen(false)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-left">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">Add Commission Obligation</span>
              <button type="button" onClick={() => setIsManualCommOpen(false)} className="p-1 rounded-lg text-indigo-100 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateManualCommission}>
              <div className="p-6 space-y-4">
                {manualError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-start space-x-2.5">
                    <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-semibold leading-tight">{manualError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Select Booking *</label>
                  <select
                    required
                    value={manualBookingId}
                    onChange={(e) => handleManualBookingChange(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                  >
                    <option value="">Select a booking...</option>
                    {bookingsList.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.booking_number} — {b.customer_name}
                      </option>
                    ))}
                  </select>
                </div>

                {manualBookingId && (
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1.5 text-xs text-slate-650">
                    <div className="flex justify-between">
                      <span className="font-bold">Project:</span>
                      <span>{projectsMap.get(manualProjectId) || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-bold">Tower:</span>
                      <span>{towersMap.get(manualTowerId) || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-bold">Flat / Unit:</span>
                      <span>{unitsMap.get(manualUnitId) || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-bold">Consideration Amount:</span>
                      <span className="font-semibold text-slate-800">₹{manualSaleValue.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-bold">Structure:</span>
                      <span className="font-semibold text-slate-800">{manualStructureType}</span>
                    </div>
                    <span className="hidden" data-structure-id={manualStructureId} />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Commission Rate (%)</label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={manualCommissionRate}
                      onChange={(e) => {
                        setManualCommissionRate(e.target.value);
                        const rate = parseFloat(e.target.value) || 0;
                        const calculated = (manualSaleValue * rate) / 100;
                        setManualCommissionAmt(calculated.toString());
                        setManualPayableAmt(calculated.toString());
                      }}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Commission Amount (₹) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={manualCommissionAmt}
                      onChange={(e) => {
                        setManualCommissionAmt(e.target.value);
                        setManualPayableAmt(e.target.value);
                      }}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Payable Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={manualPayableAmt}
                    onChange={(e) => setManualPayableAmt(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Remarks</label>
                  <textarea
                    placeholder="Specify structural details or rationale..."
                    rows={2}
                    value={manualRemarks}
                    onChange={(e) => setManualRemarks(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all resize-none"
                  />
                </div>
              </div>

              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsManualCommOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={manualLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow disabled:opacity-50 transition-all focus:outline-none"
                >
                  {manualLoading ? 'Saving...' : 'Add Commission'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
