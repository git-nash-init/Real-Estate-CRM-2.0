import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { reportQueryError } from '../services/queryLogger';
import { useAuth } from '../hooks/useAuth';
import { canCreateBooking, canCancelBooking, isSuperAdmin } from '../utils/permissions';
import { computeCurrentlyDueTotal, totalMilestonePercentage } from '../utils/bookingDue';
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
  Home,
  IndianRupee,
  Plus,
  Users,
  Trash2
} from 'lucide-react';

interface Booking {
  id: string;
  created_at: string;
  lead_id: string | null;
  project_id: string | null;
  booking_amount: number | null;
  consideration_amount: number | null;
  gst_amount: number | null;
  stamp_duty: number | null;
  registration_charges: number | null;
  development_charges: number | null;
  maintenance_charges: number | null;
  parking_charges: number | null;
  other_charges: number | null;
  total_additional_charges: number | null;
  total_payable_amount: number | null;
  status: string | null;
  booking_date: string | null;
  inventory_id: string | null;
  notes: string | null;
  booking_number?: string | null;
  customer_name?: string | null;
  created_by?: string | null;
  channel_partner_id: string | null;
  token_amount?: number | null;
  refund_amount?: number | null;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  sales_owner?: string | null;
  closing_manager?: string | null;
  possession_date?: string | null;
}

interface Lead {
  id: string;
  customer_name: string | null;
  mobile: string | null;
  email: string | null;
  project_id: string | null;
  owner_id: string | null;
  sourcing_manager_id: string | null;
  channel_partner_id: string | null;
}

interface InventoryUnit {
  id: string;
  project_id: string | null;
  tower_id: string | null;
  floor_id: string | null;
  unit_number: string | null;
  configuration: string | null;
  carpet_area: number | null;
  built_up_area: number | null;
  base_price: number | null;
  status: string | null;
  notes: string | null;
}



interface Tower {
  id: string;
  project_id: string | null;
  tower_name: string | null;
  status: string | null;
}

export const Bookings: React.FC = () => {
  const { role, assignedProjects } = useAuth();
  
  const canApproveBooking = useCallback((booking: Booking | null) => {
    if (!booking) return false;
    if (role === 'super_admin') return true;
    if (role === 'site_head' && booking.project_id) {
      return assignedProjects.includes(booking.project_id);
    }
    return false;
  }, [role, assignedProjects]);

  // Filters & query states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  // Pagination states
  const [page, setPage] = useState(0);
  const [pageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  // Data states
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [leadsMap, setLeadsMap] = useState<Map<string, Lead>>(new Map());
  const [projectMap, setProjectMap] = useState<Map<string, string>>(new Map());
  const [profileMap, setProfileMap] = useState<Map<string, string>>(new Map());
  const [inventoryMap, setInventoryMap] = useState<Map<string, InventoryUnit>>(new Map());
  const [towersMap, setTowersMap] = useState<Map<string, string>>(new Map());
  const [floorsMap, setFloorsMap] = useState<Map<string, string>>(new Map());
  // Cumulative % of the Agreement Value currently "released" for payment,
  // per project -- set by super_admin via project_payment_milestones.
  const [towerMilestonePercent, setTowerMilestonePercent] = useState<Map<string, number>>(new Map());
  // Per booking, whether at least one payment has already been recorded --
  // drives whether GST/Stamp Duty/Registration/Other Charges are due yet.
  const [bookingHasPaymentMap, setBookingHasPaymentMap] = useState<Map<string, boolean>>(new Map());
  
  // Lists for creation form dropdowns
  const [leadsList, setLeadsList] = useState<Lead[]>([]);
  const [inventoryList, setInventoryList] = useState<InventoryUnit[]>([]);
  const [towersList, setTowersList] = useState<Tower[]>([]);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [confirmingBooking, setConfirmingBooking] = useState<Booking | null>(null);
  const [cancellingBooking, setCancellingBooking] = useState<Booking | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelRefundAmount, setCancelRefundAmount] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [fetchingLookups, setFetchingLookups] = useState(false);

  // Create Form states
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedTowerId, setSelectedTowerId] = useState('');
  const [selectedInventoryId, setSelectedInventoryId] = useState('');
  const [considerationAmount, setConsiderationAmount] = useState('');
  const [gstAmount, setGstAmount] = useState('');
  const [stampDuty, setStampDuty] = useState('');
  
  const [developmentCharges, setDevelopmentCharges] = useState('');
  const [maintenanceCharges, setMaintenanceCharges] = useState('');
  const [parkingCharges, setParkingCharges] = useState('');
  const [otherCharges, setOtherCharges] = useState('');
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedStatus, setSelectedStatus] = useState('draft');
  const [selectedChannelPartnerId, setSelectedChannelPartnerId] = useState('');
  const [notes, setNotes] = useState('');

  // Channel Partner lookups lists & map
  const [channelPartnersList, setChannelPartnersList] = useState<{ id: string; name: string; partner_code: string; company_name: string | null }[]>([]);
  const [channelPartnerMap, setChannelPartnerMap] = useState<Map<string, string>>(new Map());

  // Status updating loader
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Booking Child Payments states
  const [activeViewTab, setActiveViewTab] = useState<'details' | 'payments'>('details');
  const [bookingPayments, setBookingPayments] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);
  const [addPaymentLoading, setAddPaymentLoading] = useState(false);
  const [addPaymentError, setAddPaymentError] = useState<string | null>(null);

  // Add Payment Form Fields
  const [addPaymentType, setAddPaymentType] = useState('Booking');
  const [addAmount, setAddAmount] = useState('');
  const [addDueDate, setAddDueDate] = useState('');
  const [addReceivedDate, setAddReceivedDate] = useState(new Date().toISOString().split('T')[0]);
  const [addPaymentMode, setAddPaymentMode] = useState('Cash');
  const [addTxnRef, setAddTxnRef] = useState('');
  const [addChequeNum, setAddChequeNum] = useState('');
  const [addBankName, setAddBankName] = useState('');
  const [addRemarks, setAddRemarks] = useState('');
  const [addPaymentStatus, setAddPaymentStatus] = useState('paid');

  const fetchBookingPayments = async (bookingId: string) => {
    setLoadingPayments(true);
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setBookingPayments(data || []);
    } catch (err) {
      console.error('Error fetching booking payments:', err);
    } finally {
      setLoadingPayments(false);
    }
  };

  const createCommissionForBooking = async (
    bookingId: string,
    channelPartnerId: string,
    considerationAmount: number,
    totalPayableAmount: number
  ) => {
    try {
      // 1. Fetch channel partner and booking details
      const [cpRes, bookingRes] = await Promise.all([
        supabase
          .from('channel_partners')
          .select('*')
          .eq('id', channelPartnerId)
          .single(),
        supabase
          .from('bookings')
          .select('project_id, inventory_id, tower_id')
          .eq('id', bookingId)
          .single()
      ]);

      if (cpRes.error || !cpRes.data) {
        console.error('Failed to load CP for referral fee calculation:', cpRes.error);
        return;
      }

      const cp = cpRes.data;
      const bookingData = bookingRes.data;
      const projectId = bookingData?.project_id || null;

      // 1. Fetch active referral fee structures for this Channel Partner
      const { data: structures, error: structErr } = await supabase
        .from('commission_structures')
        .select('*')
        .eq('cp_id', channelPartnerId)
        .eq('status', 'active');

      if (structErr) {
        console.error('Failed to fetch referral fee structures:', structErr);
      }

      // Find structure for specific project first, then general (where project_id is null)
      let activeStruct = structures?.find(s => s.project_id === projectId);
      if (!activeStruct) {
        activeStruct = structures?.find(s => s.project_id === null);
      }

      let commType = 'PERCENTAGE';
      let rate = 0;
      let fixedAmt = 0;

      if (activeStruct) {
        commType = activeStruct.structure_type;
        rate = activeStruct.commission_percentage || 0;
        fixedAmt = activeStruct.fixed_amount || 0;
      } else {
        // Fallback to partner defaults if no structures defined
        commType = cp.commission_type || 'PERCENTAGE';
        rate = cp.default_commission_rate || cp.commission_value || 0;
        fixedAmt = cp.default_commission_amount || cp.commission_value || 0;
      }

      // Default base is CONSIDERATION_AMOUNT
      const baseAmount = considerationAmount || totalPayableAmount || 0;

      // Calculate referral fee amount
      let commissionAmount = 0;
      let activeRate = rate;

      if (commType === 'PERCENTAGE') {
        commissionAmount = (baseAmount * rate) / 100;
      } else if (commType === 'SLAB') {
        if (activeStruct && activeStruct.slab_min !== null && activeStruct.slab_max !== null) {
          if (baseAmount >= activeStruct.slab_min && baseAmount <= activeStruct.slab_max) {
            commissionAmount = (baseAmount * rate) / 100;
          } else {
            commissionAmount = (baseAmount * rate) / 100;
          }
        } else {
          if (baseAmount < 5000000) {
            activeRate = 2.0;
          } else if (baseAmount <= 10000000) {
            activeRate = 2.5;
          } else {
            activeRate = 3.0;
          }
          commissionAmount = (baseAmount * activeRate) / 100;
        }
      } else {
        commissionAmount = fixedAmt;
      }

      // Insert referral fee snapshot record into cp_commissions table
      const { error: commInsertErr } = await supabase
        .from('cp_commissions')
        .insert([
          {
            cp_id: channelPartnerId,
            booking_id: bookingId,
            commission_percentage: commType === 'FIXED' ? 0 : activeRate,
            commission_amount: commissionAmount,
            payable_amount: commissionAmount,
            paid_amount: 0,
            pending_amount: commissionAmount,
            status: 'pending',
            remarks: `Auto-generated referral fee from booking creation. Structure: ${commType}`
          }
        ]);

      if (commInsertErr) {
        console.error('Failed to create booking referral fee record:', commInsertErr.message);
      } else {
        console.log('Referral Fee obligation record created successfully for booking:', bookingId);
      }
    } catch (err) {
      console.error('Error creating referral fee:', err);
    }
  };

  useEffect(() => {
    if (selectedBooking) {
      fetchBookingPayments(selectedBooking.id);
      setActiveViewTab('details');
    }
  }, [selectedBooking]);

  const handleAddPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBooking) return;
    const amt = parseFloat(addAmount);
    if (isNaN(amt) || amt <= 0) {
      setAddPaymentError('Payment amount must be greater than zero.');
      return;
    }
    if (addPaymentMode === 'Cheque' && !addChequeNum.trim()) {
      setAddPaymentError('Cheque Number is required when Payment Mode is Cheque.');
      return;
    }
    if (['NEFT', 'RTGS', 'IMPS', 'Bank Transfer'].includes(addPaymentMode) && !addBankName.trim() && !addTxnRef.trim()) {
      setAddPaymentError('Bank Name or Transaction Reference is required for bank transfers.');
      return;
    }
    if (addPaymentStatus === 'paid' && !addReceivedDate) {
      setAddPaymentError('Received Date is required when status is Paid.');
      return;
    }

    setAddPaymentError(null);
    setAddPaymentLoading(true);

    try {
      // Fetch live booking to check totals
      const { data: dbBooking, error: bookErr } = await supabase
        .from('bookings')
        .select('booking_amount, total_payable_amount, consideration_amount, gst_amount, stamp_duty, registration_charges, other_charges, development_charges, maintenance_charges, parking_charges, possession_date, project_id')
        .eq('id', selectedBooking.id)
        .single();
      if (bookErr || !dbBooking) {
        throw new Error("The selected booking no longer exists.");
      }

      // Fetch live payments for this booking
      const { data: dbPayments, error: payErr } = await supabase
        .from('payments')
        .select('amount, status')
        .eq('booking_id', selectedBooking.id);
      if (payErr) {
        throw new Error("Unable to verify booking payment history.");
      }

      const activeTotal = dbPayments
        .filter((p: any) => p.status?.toLowerCase() === 'received' || p.status?.toLowerCase() === 'paid')
        .reduce((sum: number, p: any) => sum + p.amount, 0);

      // Currently-due total isn't the booking's full grand total -- it's
      // staged by the project's released payment percentage, plus
      // first-payment/possession-triggered charges (see bookingDue.ts).
      // GST/Stamp Duty/Registration/Other Charges become due AT the first
      // payment (concurrent with it, not requiring a separate prior
      // payment), so they're always included as collectible here --
      // hasAnyPayment=true reflects "this transaction is or follows the
      // first payment", which is always the case once a payment is being
      // recorded at all.
      const milestonePercent = towerMilestonePercent.get(dbBooking.tower_id || '') || 0;
      const currentlyDueTotal = computeCurrentlyDueTotal(dbBooking, milestonePercent, true);

      if (activeTotal + amt > currentlyDueTotal) {
        throw new Error(`Payment amount exceeds the currently due balance (₹${currentlyDueTotal.toLocaleString('en-IN')} due so far, based on the project's released payment percentage).`);
      }

      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || null;

      const payload: any = {
        booking_id: selectedBooking.id,
        payment_type: addPaymentType,
        amount: amt,
        due_date: addDueDate || null,
        received_date: addPaymentStatus === 'paid' ? addReceivedDate : null,
        payment_mode: addPaymentMode,
        transaction_reference: addTxnRef.trim() || null,
        cheque_number: addChequeNum.trim() || null,
        bank_name: addBankName.trim() || null,
        status: addPaymentStatus,
        remarks: addRemarks.trim() || null,
        created_by: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { error: insertErr } = await supabase
        .from('payments')
        .insert([payload]);

      if (insertErr) {
        if (insertErr.message?.toLowerCase().includes('payment_number') && insertErr.message?.toLowerCase().includes('null value')) {
          payload.payment_number = `PMT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
          const { error: retryErr } = await supabase
            .from('payments')
            .insert([payload]);
          if (retryErr) throw retryErr;
        } else {
          throw insertErr;
        }
      }

      // First payment on a booking with a Channel Partner attached ->
      // flag their referral fee record as settlement-eligible and notify
      // them to request it. activeTotal is the total BEFORE this insert,
      // so activeTotal === 0 with this payment actually received/paid
      // means this is the first real money landing on the booking.
      const isActivePayment = addPaymentStatus === 'received' || addPaymentStatus === 'paid';
      if (activeTotal === 0 && isActivePayment && selectedBooking.channel_partner_id) {
        try {
          await supabase
            .from('cp_commissions')
            .update({ first_payment_received_at: new Date().toISOString() })
            .eq('booking_id', selectedBooking.id)
            .is('first_payment_received_at', null);

          const { data: cpRow } = await supabase
            .from('channel_partners')
            .select('user_id, name')
            .eq('id', selectedBooking.channel_partner_id)
            .maybeSingle();

          if (cpRow?.user_id) {
            await supabase.from('notifications').insert([{
              user_id: cpRow.user_id,
              notification_type: 'cp_settlement_eligible',
              title: 'Settlement Available',
              message: `The first payment has been received for booking ${selectedBooking.booking_number || selectedBooking.id}. You can now request your referral fee settlement.`,
              related_entity: 'booking',
              related_id: selectedBooking.id,
            }]);
          }
        } catch (notifyErr) {
          // Payment itself is already saved -- a failed notification
          // shouldn't undo that.
          reportQueryError('Bookings: CP settlement notification', notifyErr);
        }
      }

      setIsAddPaymentOpen(false);
      setAddAmount('');
      setAddRemarks('');
      setAddChequeNum('');
      setAddBankName('');
      setAddTxnRef('');
      setNotification({ type: 'success', message: 'Payment recorded successfully.' });
      await fetchBookingPayments(selectedBooking.id);
    } catch (err: any) {
      console.error('Error adding booking payment:', err);
      setAddPaymentError(err.message || 'Unable to save payment. Please try again.');
    } finally {
      setAddPaymentLoading(false);
    }
  };

  // Fetch Lookup Lists
  const fetchLookups = useCallback(async () => {
    setFetchingLookups(true);
    try {
      // 1. Fetch Projects
      const { data: projData, error: projectsError } = await supabase
        .from('projects')
        .select('id, project_name')
        .eq('status', 'active');
      if (projectsError) {
        console.error('Supabase Projects API Error:', projectsError.message, projectsError.details);
      } else if (projData) {
        setProjectMap(new Map(projData.map(p => [p.id, p.project_name])));
      }

      // 2. Fetch User Profiles
      const { data: profData, error: profilesError } = await supabase
        .from('user_profiles')
        .select('id, full_name');
      if (profilesError) {
        console.error('Supabase User Profiles API Error:', profilesError.message, profilesError.details);
      } else if (profData) {
        setProfileMap(new Map(profData.map(u => [u.id, u.full_name])));
      }

      // 3. Fetch Leads
      const { data: leadData, error: leadsError } = await supabase
        .from('leads')
        .select('id, customer_name, mobile, email, project_id, owner_id, sourcing_manager_id, channel_partner_id');
      if (leadsError) {
        console.error('Supabase Leads API Error:', leadsError.message, leadsError.details);
      } else if (leadData) {
        setLeadsList(leadData as any);
        setLeadsMap(new Map(leadData.map(l => [l.id, l as any])));
      }

      // Fetch active Channel Partners
      // FIX: this previously fetched ALL partners despite the comment —
      // .eq('status', 'active') was missing, so a deactivated CP could
      // still be picked as the referrer on a new booking. Leads.tsx and
      // SiteVisits.tsx already filtered correctly; this was the one gap.
      const { data: cpData, error: cpError } = await supabase
        .from('channel_partners')
        .select('id, name, partner_code, company_name')
        .eq('status', 'active');
      if (!cpError && cpData) {
        setChannelPartnersList(cpData as any);
        setChannelPartnerMap(new Map(cpData.map(c => [c.id, c.company_name || c.name || ''])));
      }

      // 4. Fetch Project Inventory
      const { data: invData, error: inventoryError } = await supabase
        .from('project_inventory')
        .select('id, project_id, tower_id, floor_id, unit_number, configuration, carpet_area, built_up_area, base_price, status, notes');
      if (inventoryError) {
        console.error('Supabase Project Inventory API Error:', inventoryError.message, inventoryError.details);
      } else if (invData) {
        setInventoryList(invData);
        setInventoryMap(new Map(invData.map(i => [i.id, i])));
      }

      // 5. Fetch Project Towers
      const { data: towData, error: towersError } = await supabase
        .from('project_towers')
        .select('id, project_id, tower_name, status');
      if (towersError) {
        console.error('Supabase Project Towers API Error:', towersError.message, towersError.details);
      } else if (towData) {
        setTowersList(towData);
        setTowersMap(new Map(towData.map(t => [t.id, t.tower_name])));
      }

      // 6. Fetch Project Floors
      const { data: floorData, error: floorsError } = await supabase
        .from('project_floors')
        .select('id, tower_id, floor_number, floor_name');
      if (floorsError) {
        console.error('Supabase Project Floors API Error:', floorsError.message, floorsError.details);
      } else if (floorData) {
        setFloorsMap(new Map(floorData.map(f => [f.id, f.floor_name || `Floor ${f.floor_number}`])));
      }

      // 7. Fetch Project Payment Milestones -- cumulative % released per tower
      const { data: milestoneData, error: milestoneError } = await supabase
        .from('project_payment_milestones')
        .select('tower_id, percentage');
      if (milestoneError) {
        console.error('Supabase Payment Milestones API Error:', milestoneError.message);
      } else if (milestoneData) {
        const byTower = new Map<string, number[]>();
        milestoneData.forEach(m => {
          if (!m.tower_id) return; // skip old project-level ones
          const arr = byTower.get(m.tower_id) || [];
          arr.push(m.percentage);
          byTower.set(m.tower_id, arr);
        });
        const percentMap = new Map<string, number>();
        byTower.forEach((percentages, towerId) => percentMap.set(towerId, totalMilestonePercentage(percentages)));
        setTowerMilestonePercent(percentMap);
      }

      // 8. Which bookings already have at least one recorded payment --
      // determines whether GST/Stamp Duty/Registration/Other Charges are due.
      const { data: paymentBookingIds, error: paymentBookingErr } = await supabase
        .from('payments')
        .select('booking_id');
      if (paymentBookingErr) {
        console.error('Supabase Payments-by-booking API Error:', paymentBookingErr.message);
      } else if (paymentBookingIds) {
        const hasPaymentMap = new Map<string, boolean>();
        paymentBookingIds.forEach(p => { if (p.booking_id) hasPaymentMap.set(p.booking_id, true); });
        setBookingHasPaymentMap(hasPaymentMap);
      }
    } catch (err) {
      console.error('Unexpected lookups load exception:', err);
    } finally {
      setFetchingLookups(false);
    }
  }, []);

  // Fetch Bookings list
  const fetchBookings = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      let query = supabase
        .from('bookings')
        .select('*', { count: 'exact' });

      // Filter by Status
      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }

      // Search -- customer name and unit number live on leads/project_inventory,
      // not on bookings itself, so match them via the full (unpaginated)
      // leadsList/inventoryList lookups already loaded, then filter bookings
      // by the resulting lead_id/inventory_id. Without this, search only
      // ever matched within the current page of results.
      if (searchQuery.trim()) {
        const term = searchQuery.trim().toLowerCase();
        const matchingLeadIds = leadsList.filter(l => l.customer_name?.toLowerCase().includes(term)).map(l => l.id);
        const matchingUnitIds = inventoryList.filter((u: any) => u.unit_number?.toLowerCase().includes(term)).map(u => u.id);
        const orParts = [`notes.ilike.%${term.replace(/[%,]/g, '')}%`];
        if (matchingLeadIds.length) orParts.push(`lead_id.in.(${matchingLeadIds.join(',')})`);
        if (matchingUnitIds.length) orParts.push(`inventory_id.in.(${matchingUnitIds.join(',')})`);
        query = query.or(orParts.join(','));
      }

      // Filter by Project / Role enforcement
      if (role === 'site_head') {
        if (assignedProjects && assignedProjects.length > 0) {
          if (projectFilter && assignedProjects.includes(projectFilter)) {
            query = query.eq('project_id', projectFilter);
          } else {
            query = query.in('project_id', assignedProjects);
          }
        } else {
          // A site_head with no assigned projects should see nothing
          query = query.eq('project_id', '00000000-0000-0000-0000-000000000000');
        }
      } else {
        if (projectFilter) {
          query = query.eq('project_id', projectFilter);
        }
      }

      // Pagination
      const from = page * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to).order('booking_date', { ascending: false });

      const { data, count, error: fetchError } = await query;

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      setBookings(data || []);
      setTotalCount(count || 0);
    } catch (err: any) {
      console.error('Error fetching bookings:', err);
      setError(err.message || 'An unexpected error occurred while loading bookings.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [statusFilter, projectFilter, page, pageSize, role, assignedProjects, searchQuery, leadsList, inventoryList]);

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Sync refresh trigger
  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    await fetchLookups();
    await fetchBookings();
  };

  const handleDeleteBooking = async (booking: Booking) => {
    if (!window.confirm(`Are you sure you want to delete Booking ${booking.booking_number || booking.id}?`)) {
      return;
    }
    
    try {
      const { error: deleteErr } = await supabase
        .from('bookings')
        .delete()
        .eq('id', booking.id);
      
      if (deleteErr) throw deleteErr;
      
      setNotification({ type: 'success', message: 'Booking deleted successfully.' });
      handleSync();
    } catch (err: any) {
      console.error('Error deleting booking:', err);
      setNotification({ type: 'error', message: err.message || 'Failed to delete booking.' });
    }
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

  // Auto-fill Project from Lead Selection in creation form
  useEffect(() => {
    if (selectedLeadId) {
      const lead = leadsMap.get(selectedLeadId);
      if (lead) {
        if (lead.project_id) {
          setSelectedProjectId(lead.project_id);
          setSelectedTowerId('');
          setSelectedInventoryId('');
        }
        if (lead.channel_partner_id) {
          setSelectedChannelPartnerId(lead.channel_partner_id);
        } else {
          setSelectedChannelPartnerId('');
        }
      }
    }
  }, [selectedLeadId, leadsMap]);

  // Auto-fill base price from selected unit
  useEffect(() => {
    if (selectedInventoryId) {
      const unit = inventoryList.find(item => item.id === selectedInventoryId);
      if (unit && unit.base_price) {
        setConsiderationAmount(unit.base_price.toString());
      } else {
        setConsiderationAmount('');
      }
    } else {
      setConsiderationAmount('');
    }
  }, [selectedInventoryId, inventoryList]);

  // Reload lookups whenever the create modal is opened to prevent stale caches
  useEffect(() => {
    if (isCreateOpen) {
      fetchLookups();
    }
  }, [isCreateOpen, fetchLookups]);

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedTowerId('');
    setSelectedInventoryId('');
  };

  const handleTowerChange = (towerId: string) => {
    setSelectedTowerId(towerId);
    setSelectedInventoryId('');
  };

  // Submit New Booking
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
    if (!selectedInventoryId) {
      setCreateError('Please select an Inventory Unit.');
      return;
    }
    if (!considerationAmount.trim() || isNaN(Number(considerationAmount)) || Number(considerationAmount) <= 0) {
      setCreateError('Agreement Value (Base) is required, must be a number, and must be greater than zero.');
      return;
    }
    if (gstAmount.trim() && (isNaN(Number(gstAmount)) || Number(gstAmount) < 0)) {
      setCreateError('GST Amount must be a valid non-negative number.');
      return;
    }

    const parseAmt = (val: string) => {
      const num = parseFloat(val);
      return isNaN(num) || num < 0 ? 0 : num;
    };

    const baseAmt = parseFloat(considerationAmount);
    const gstAmt = gstAmount.trim() ? parseFloat(gstAmount) : 0;
    const sdAmt = parseAmt(stampDuty);
    const regAmt = 0;
    const devAmt = parseAmt(developmentCharges);
    const maintAmt = parseAmt(maintenanceCharges);
    const parkAmt = parseAmt(parkingCharges);
    const othAmt = parseAmt(otherCharges);

    const totalAddCharges = gstAmt + sdAmt + regAmt + devAmt + maintAmt + parkAmt + othAmt;
    const calculatedTotalPayable = baseAmt + totalAddCharges;

    if (!bookingDate) {
      setCreateError('Please select a Booking Date.');
      return;
    }

    setCreateError(null);
    setCreateLoading(true);

    try {
      // 1. Database-side validation
      // Verify Lead
      const { data: leadDb, error: leadErr } = await supabase
        .from('leads')
        .select('id, customer_name')
        .eq('id', selectedLeadId)
        .single();
      if (leadErr || !leadDb) {
        setCreateError("Selected lead/customer does not exist.");
        setCreateLoading(false);
        return;
      }

      // Verify Project
      const { data: projectDb, error: projectErr } = await supabase
        .from('projects')
        .select('id, project_name')
        .eq('id', selectedProjectId)
        .single();
      if (projectErr || !projectDb) {
        setCreateError("The selected project does not exist.");
        setCreateLoading(false);
        return;
      }

      // Verify Tower
      const { data: towerDb, error: towerErr } = await supabase
        .from('project_towers')
        .select('id, tower_name, project_id')
        .eq('id', selectedTowerId)
        .single();
      if (towerErr || !towerDb) {
        setCreateError("The selected tower does not belong to this project.");
        setCreateLoading(false);
        return;
      }
      if (towerDb.project_id !== selectedProjectId) {
        setCreateError("The selected tower does not belong to this project.");
        setCreateLoading(false);
        return;
      }

      // Verify Unit and hierarchy relationships
      const { data: unitDb, error: unitErr } = await supabase
        .from('project_inventory')
        .select('id, unit_number, project_id, tower_id, floor_id, status')
        .eq('id', selectedInventoryId)
        .single();
      if (unitErr || !unitDb) {
        setCreateError("Please select a valid unit.");
        setCreateLoading(false);
        return;
      }
      if (unitDb.project_id !== selectedProjectId || unitDb.tower_id !== selectedTowerId) {
        setCreateError("The selected unit does not belong to this project/tower.");
        setCreateLoading(false);
        return;
      }
      if (!unitDb.floor_id) {
        setCreateError("Database configuration error: selected unit is missing a valid floor assignment.");
        setCreateLoading(false);
        return;
      }
      if (unitDb.status.toLowerCase() !== 'available') {
        setCreateError("Unit is no longer available. Please select another unit.");
        setCreateLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || null;
      const customerName = leadDb.customer_name || 'Unnamed Client';
      const bookingNumber = `BK-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

      // 2. Atomic Reservation Logic
      const initialStatus = selectedStatus || 'draft';
      
      if (initialStatus === 'confirmed') {
        // Try to update unit to booked atomically
        const { data: updatedUnits, error: updateUnitErr } = await supabase
          .from('project_inventory')
          .update({ status: 'booked' })
          .eq('id', selectedInventoryId)
          .eq('status', 'available')
          .select();
        
        if (updateUnitErr) {
          throw new Error(`Failed to reserve unit: ${updateUnitErr.message}`);
        }
        if (!updatedUnits || updatedUnits.length === 0) {
          setCreateError("Unit is no longer available. Please select another unit.");
          setCreateLoading(false);
          return;
        }

        // Insert booking record
        const { data: newBookings, error: insertError } = await supabase
          .from('bookings')
          .insert([
            {
              lead_id: selectedLeadId,
              project_id: selectedProjectId,
              inventory_id: selectedInventoryId,
              tower_id: selectedTowerId || null,
              booking_amount: calculatedTotalPayable,
              consideration_amount: baseAmt,
              gst_amount: gstAmt,
              stamp_duty: sdAmt,
              registration_charges: regAmt,
              development_charges: devAmt,
              maintenance_charges: maintAmt,
              parking_charges: parkAmt,
              other_charges: othAmt,
              total_additional_charges: totalAddCharges,
              total_payable_amount: calculatedTotalPayable,
              booking_date: new Date(bookingDate).toISOString(),
              status: 'confirmed',
              notes: notes.trim() || null,
              booking_number: bookingNumber,
              customer_name: customerName,
              created_by: userId,
              channel_partner_id: selectedChannelPartnerId || null
            }
          ])
          .select();

        if (insertError) {
          // Rollback unit status back to available on failure
          await supabase
            .from('project_inventory')
            .update({ status: 'available' })
            .eq('id', selectedInventoryId);
          throw new Error(`Unable to create booking. Please try again. ${insertError.message}`);
        }

        // Generate referral fee if channel partner is associated
        if (selectedChannelPartnerId && newBookings && newBookings[0]) {
          await createCommissionForBooking(newBookings[0].id, selectedChannelPartnerId, baseAmt, calculatedTotalPayable);
        }

        // Keep in-memory select list synchronized
        setInventoryList(prev => prev.map(item => 
          item.id === selectedInventoryId ? { ...item, status: 'booked' } : item
        ));
      } else {
        // Draft bookings: keep unit status available
        const { error: insertError } = await supabase
          .from('bookings')
          .insert([
            {
              lead_id: selectedLeadId,
              project_id: selectedProjectId,
              inventory_id: selectedInventoryId,
              tower_id: selectedTowerId || null,
              booking_amount: calculatedTotalPayable,
              consideration_amount: baseAmt,
              gst_amount: gstAmt,
              stamp_duty: sdAmt,
              registration_charges: regAmt,
              development_charges: devAmt,
              maintenance_charges: maintAmt,
              parking_charges: parkAmt,
              other_charges: othAmt,
              total_additional_charges: totalAddCharges,
              total_payable_amount: calculatedTotalPayable,
              booking_date: new Date(bookingDate).toISOString(),
              status: initialStatus,
              notes: notes.trim() || null,
              booking_number: bookingNumber,
              customer_name: customerName,
              created_by: userId,
              channel_partner_id: selectedChannelPartnerId || null
            }
          ]);

        if (insertError) {
          throw new Error(`Unable to create booking. Please try again. ${insertError.message}`);
        }
      }

      // Reset form states
      setIsCreateOpen(false);
      setSelectedLeadId('');
      setSelectedProjectId('');
      setSelectedTowerId('');
      setSelectedInventoryId('');
      setConsiderationAmount('');
      setGstAmount('');
      setStampDuty('');
      
      setDevelopmentCharges('');
      setMaintenanceCharges('');
      setParkingCharges('');
      setOtherCharges('');
      setBookingDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setSelectedStatus('draft');
      setSelectedChannelPartnerId('');

      // Refresh list
      setPage(0);
      await fetchBookings();
      await fetchLookups();

      setNotification({
        type: 'success',
        message: 'New booking record saved successfully!'
      });
    } catch (err: any) {
      console.error('Booking creation error:', err);
      setCreateError(err.message || 'Unable to create booking. Please try again.');
    } finally {
      setCreateLoading(false);
    }
  };

  // Update Status Quick Toggle (Confirm/Cancel)
  const handleUpdateStatus = async (bookingId: string, newStatus: string) => {
    setUpdatingId(bookingId);
    try {
      // 1. Fetch current booking from DB right before change
      const { data: bookingRecord, error: getBookingErr } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .single();
      if (getBookingErr || !bookingRecord) {
        throw new Error("Booking does not exist.");
      }

      const currentBookingStatus = bookingRecord.status?.toLowerCase();
      const nextStatus = newStatus.toLowerCase();

      if (currentBookingStatus === 'draft' && nextStatus === 'confirmed') {
        // Transition from Draft -> Confirmed
        if (!bookingRecord.inventory_id) {
          throw new Error("Booking record is missing a valid unit assignment.");
        }

        // Try to lock and set unit status to booked atomically
        const { data: updatedUnits, error: updateUnitErr } = await supabase
          .from('project_inventory')
          .update({ status: 'booked' })
          .eq('id', bookingRecord.inventory_id)
          .eq('status', 'available')
          .select();
        
        if (updateUnitErr) {
          throw new Error(`Failed to reserve unit: ${updateUnitErr.message}`);
        }
        if (!updatedUnits || updatedUnits.length === 0) {
          throw new Error("This unit is no longer available. Please select another unit.");
        }

        // Update booking status to confirmed
        const { error: updateError } = await supabase
          .from('bookings')
          .update({ status: 'confirmed' })
          .eq('id', bookingId)
          .eq('status', 'draft');
        
        if (updateError) {
          // Rollback unit status back to available
          await supabase
            .from('project_inventory')
            .update({ status: 'available' })
            .eq('id', bookingRecord.inventory_id);
          throw new Error("Unable to confirm booking. Please try again.");
        }

        // Generate referral fee if channel partner is associated
        if (bookingRecord.channel_partner_id) {
          await createCommissionForBooking(
            bookingId,
            bookingRecord.channel_partner_id,
            bookingRecord.consideration_amount || bookingRecord.booking_amount || 0,
            bookingRecord.total_payable_amount || bookingRecord.booking_amount || 0
          );
        }

        setInventoryList(prev => prev.map(item => 
          item.id === bookingRecord.inventory_id ? { ...item, status: 'booked' } : item
        ));
      } else {
        // Cancellation is handled by handleCancelBooking (captures reason +
        // refund + loss log); this function now only handles draft -> confirmed.
        throw new Error(`Invalid status transition from ${currentBookingStatus?.toUpperCase()} to ${newStatus.toUpperCase()}.`);
      }

      // Synchronize state and view lookups
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
      if (selectedBooking && selectedBooking.id === bookingId) {
        setSelectedBooking(prev => prev ? { ...prev, status: newStatus } : null);
      }

      setNotification({
        type: 'success',
        message: `Booking status updated to ${newStatus}!`
      });
      await fetchLookups();
      await fetchBookings();
    } catch (err: any) {
      console.error('Booking status update error:', err);
      setNotification({
        type: 'error',
        message: err.message || 'Failed to update booking status.'
      });
    } finally {
      setUpdatingId(null);
    }
  };

  // Cancel a booking, capturing a reason and any token-money refund.
  //
  // Inventory release is handled entirely by the live DB trigger
  // release_inventory_after_booking_cancel_trigger (fires on ANY
  // cancellation, not just from 'confirmed'), so this function does not
  // duplicate that — it only updates local state afterward so the UI
  // reflects it immediately instead of waiting for the next refetch.
  //
  // token_amount is treated as the money collected on this booking so far.
  // refund_amount capped to [0, token_amount]; anything not refunded is
  // logged to loss_logs as forfeited. Booking status becomes 'refunded'
  // when any money is returned, 'cancelled' otherwise (both terminal
  // states in booking_status, kept distinct for reporting).
  // Marks possession as handed over -- this is what unlocks Maintenance/
  // Parking/Development Charges as currently due (see bookingDue.ts).
  const [markingPossessionId, setMarkingPossessionId] = useState<string | null>(null);
  const handleMarkPossession = async (booking: Booking) => {
    if (!window.confirm(`Mark possession as given for booking ${booking.booking_number || booking.id}? This makes Maintenance, Parking, and Development Charges due.`)) return;
    setMarkingPossessionId(booking.id);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ possession_date: new Date().toISOString() })
        .eq('id', booking.id);
      if (error) throw error;
      setSelectedBooking(prev => prev && prev.id === booking.id ? { ...prev, possession_date: new Date().toISOString() } : prev);
      setNotification({ type: 'success', message: 'Possession marked as given.' });
      await fetchBookings();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to mark possession.' });
    } finally {
      setMarkingPossessionId(null);
    }
  };

  const handleCancelBooking = async (booking: Booking, reason: string, refundAmountInput: string) => {
    setCancelSubmitting(true);
    setCancelError(null);
    try {
      const trimmedReason = reason.trim();
      if (!trimmedReason) {
        throw new Error('Please provide a reason for cancelling this booking.');
      }

      const tokenAmount = booking.token_amount || 0;
      let refundAmount = Number(refundAmountInput) || 0;
      if (refundAmount < 0) refundAmount = 0;
      if (refundAmount > tokenAmount) refundAmount = tokenAmount;
      const forfeitedAmount = Math.max(0, tokenAmount - refundAmount);

      const nowIso = new Date().toISOString();
      // Always 'cancelled', never 'refunded': the live DB trigger
      // release_inventory_after_booking_cancel_trigger only fires on
      // status = 'cancelled' (verified against the live schema via a
      // rolled-back dry run). Using 'refunded' here would silently skip
      // inventory release. refund_amount already fully captures how much
      // was returned; a separate terminal status isn't needed for that.
      const newStatus = 'cancelled';

      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          status: newStatus,
          cancelled_at: nowIso,
          cancellation_reason: trimmedReason,
          refund_amount: refundAmount,
        })
        .eq('id', booking.id)
        .in('status', ['draft', 'confirmed']);
      if (updateError) {
        throw new Error('Unable to cancel booking. Please try again.');
      }

      // Inventory release: explicitly release it in the database just in case
      // the trigger is missing or failing, then mirror to local state.
      if (booking.inventory_id) {
        await supabase
          .from('project_inventory')
          .update({ status: 'available' })
          .eq('id', booking.inventory_id);

        setInventoryList(prev => prev.map(item =>
          item.id === booking.inventory_id ? { ...item, status: 'available' } : item
        ));
      }

      // Void any referral fee tied to this booking — it was earned on a
      // sale that no longer exists.
      const { error: commissionErr } = await supabase
        .from('cp_commissions')
        .update({ status: 'cancelled' })
        .eq('booking_id', booking.id);
      if (commissionErr) {
        reportQueryError('Bookings: void referral fee on cancel', commissionErr);
      }

      // Loss log: only meaningful when money was actually collected and not
      // fully returned.
      if (forfeitedAmount > 0) {
        const { data: userData } = await supabase.auth.getUser();
        const { error: lossErr } = await supabase
          .from('loss_logs')
          .insert([{
            booking_id: booking.id,
            booking_amount: tokenAmount,
            refunded_amount: refundAmount,
            forfeited_amount: forfeitedAmount,
            reason: trimmedReason,
            recorded_by: userData?.user?.id || null,
          }]);
        if (lossErr) {
          reportQueryError('Bookings: loss log', lossErr);
        }
      }

      setBookings(prev => prev.map(b => b.id === booking.id ? {
        ...b, status: newStatus, cancelled_at: nowIso, cancellation_reason: trimmedReason, refund_amount: refundAmount,
      } : b));
      if (selectedBooking && selectedBooking.id === booking.id) {
        setSelectedBooking(prev => prev ? { ...prev, status: newStatus, cancelled_at: nowIso, cancellation_reason: trimmedReason, refund_amount: refundAmount } : null);
      }

      setNotification({
        type: 'success',
        message: forfeitedAmount > 0
          ? 'Booking cancelled. Rs.' + forfeitedAmount.toLocaleString('en-IN') + ' forfeited, Rs.' + refundAmount.toLocaleString('en-IN') + ' refunded.'
          : 'Booking cancelled and refund recorded.',
      });

      setCancellingBooking(null);
      setCancelReason('');
      setCancelRefundAmount('');
      await fetchLookups();
      await fetchBookings();
    } catch (err: any) {
      setCancelError(err.message || 'Failed to cancel booking.');
    } finally {
      setCancelSubmitting(false);
    }
  };

  // Search and project filter are both applied server-side in fetchBookings
  // now, so `bookings` is already the filtered set for the current page.
  const getFilteredBookings = () => {
    return bookings.filter(b => {
      const matchesProject = projectFilter
        ? b.project_id === projectFilter
        : true;

      return matchesProject;
    });
  };

  const filteredBookings = getFilteredBookings();
  const startRange = page * pageSize + 1;
  const endRange = Math.min((page + 1) * pageSize, totalCount);

  // Filter available towers based on selected project
  const availableTowers = towersList.filter(t => t.project_id === selectedProjectId);

  // Filter available inventory based on selected project, selected tower, and status
  const availableInventory = inventoryList.filter(
    item => item.project_id === selectedProjectId && 
            item.tower_id === selectedTowerId && 
            item.status?.toLowerCase() === 'available'
  );

  // Tower option text
  let towerPlaceholder = "Choose Tower...";
  if (!selectedProjectId) {
    towerPlaceholder = "Choose Tower...";
  } else if (fetchingLookups) {
    towerPlaceholder = "Loading towers...";
  } else if (availableTowers.length === 0) {
    towerPlaceholder = "No towers available";
  }

  // Unit option text
  let unitPlaceholder = "Choose Unit...";
  if (!selectedTowerId) {
    unitPlaceholder = "Choose Unit...";
  } else if (fetchingLookups) {
    unitPlaceholder = "Loading units...";
  } else if (availableInventory.length === 0) {
    unitPlaceholder = "No available units";
  }

  // Temporary logging to debug inventory loading and mapping
  console.log('--- Bookings Form Cascading Debug ---');
  console.log('selectedProjectId:', selectedProjectId);
  console.log('selectedTowerId:', selectedTowerId);
  console.log('towersList count:', towersList.length);
  console.log('availableInventory details:', availableInventory);
  console.log('-------------------------------------');

  const parseAmt = (val: string) => {
    const num = parseFloat(val);
    return isNaN(num) || num < 0 ? 0 : num;
  };

  const calculatedTotalAdditionalCharges = 
    parseAmt(gstAmount) +
    parseAmt(stampDuty) +
    
    parseAmt(developmentCharges) +
    parseAmt(maintenanceCharges) +
    parseAmt(parkingCharges) +
    parseAmt(otherCharges);

  const calculatedTotalPayable = 
    parseAmt(considerationAmount) +
    calculatedTotalAdditionalCharges;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Bookings Directory</h2>
          <p className="text-slate-500 text-sm">Create, search, audit, and trace unit booking consideration records.</p>
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
          {canCreateBooking(role) && (
            <button
              onClick={() => setIsCreateOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md shadow-indigo-600/10 hover:shadow-lg transition-all focus:outline-none"
            >
              + New Booking
            </button>
          )}
        </div>
      </div>

      {/* Toast Alert */}
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
            placeholder="Search by customer name, unit number, notes..."
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
            <option value="draft">Draft</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col">
        {loading ? (
          <div className="py-24 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-100 border-t-indigo-600 mx-auto mb-4"></div>
            <p className="text-slate-500 font-medium">Loading bookings data...</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3.5 px-6">Customer / Lead</th>
                    <th className="py-3.5 px-6">Project Focus</th>
                    <th className="py-3.5 px-6">Inventory Unit</th>
                    <th className="py-3.5 px-6">Base Amount</th>
                    <th className="py-3.5 px-6">Total Payable</th>
                    <th className="py-3.5 px-6">Currently Due</th>
                    <th className="py-3.5 px-6">Booking Date</th>
                    <th className="py-3.5 px-6">Status</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBookings.length > 0 ? (
                    filteredBookings.map((b) => {
                      const lead = leadsMap.get(b.lead_id || '');
                      const unit = inventoryMap.get(b.inventory_id || '');
                      const baseAmt = b.consideration_amount !== null ? b.consideration_amount : (b.booking_amount || 0);
                      const totalPayable = b.total_payable_amount !== null ? b.total_payable_amount : (b.booking_amount || 0);
                      const bMilestonePercent = towerMilestonePercent.get(b.tower_id || '') || 0;
                      const bCurrentlyDue = computeCurrentlyDueTotal(b, bMilestonePercent, !!bookingHasPaymentMap.get(b.id));
                      return (
                        <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 px-6 font-semibold text-slate-900">
                            {lead?.customer_name || b.customer_name || 'Unnamed Client'}
                            {b.customer_name && lead?.customer_name && b.customer_name !== lead.customer_name && (
                              <span className="block text-slate-400 font-normal text-xxs mt-0.5">{b.customer_name}</span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-sm text-slate-600">
                            {projectMap.get(b.project_id || '') || 'N/A'}
                          </td>
                          <td className="py-4 px-6">
                            <span className="inline-flex items-center space-x-1.5 text-sm text-slate-700 font-medium">
                              <Home className="h-4 w-4 text-slate-400" />
                              <span>{unit?.unit_number ? `${unit.unit_number} (${towersMap.get(unit.tower_id || '') || 'No Tower'})` : 'N/A'}</span>
                            </span>
                          </td>
                          <td className="py-4 px-6 text-sm text-slate-600">
                            ₹{baseAmt.toLocaleString('en-IN')}
                          </td>
                          <td className="py-4 px-6">
                            <span className="font-extrabold text-indigo-700 text-sm">
                              ₹{totalPayable.toLocaleString('en-IN')}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <span className="font-semibold text-amber-700 text-sm" title={`${bMilestonePercent}% of Agreement Value released`}>
                              ₹{bCurrentlyDue.toLocaleString('en-IN')}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-sm text-slate-600">
                            {b.booking_date ? new Date(b.booking_date).toLocaleDateString('en-IN') : 'N/A'}
                          </td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              b.status?.toLowerCase() === 'confirmed' ? 'bg-emerald-50 text-emerald-700' :
                              b.status?.toLowerCase() === 'cancelled' ? 'bg-rose-50 text-rose-700' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {b.status || 'draft'}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              {/* Confirm Booking Action */}
                              {b.status?.toLowerCase() === 'draft' && canApproveBooking(b) && (
                                <button
                                  onClick={() => setConfirmingBooking(b)}
                                  disabled={updatingId === b.id}
                                  className="px-2.5 py-1.5 bg-emerald-50 border border-emerald-100 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-semibold disabled:opacity-50"
                                >
                                  Confirm
                                </button>
                              )}
                              
                              {/* Cancel Booking Action */}
                              {canCancelBooking(role) && (b.status?.toLowerCase() === 'draft' || b.status?.toLowerCase() === 'confirmed') && (
                                <button
                                  onClick={() => { setCancellingBooking(b); setCancelReason(''); setCancelRefundAmount(String(b.token_amount || 0)); setCancelError(null); }}
                                  disabled={updatingId === b.id}
                                  className="px-2.5 py-1.5 bg-rose-50 border border-rose-100 text-rose-700 hover:bg-rose-100 rounded-lg text-xs font-semibold disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              )}
                              
                              <button
                                onClick={() => setSelectedBooking(b)}
                                className="inline-flex items-center space-x-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>View</span>
                              </button>
                              {isSuperAdmin(role) && (
                                <button
                                  onClick={() => handleDeleteBooking(b)}
                                  className="p-1.5 border border-slate-200 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                                  title="Delete Booking"
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
                      <td colSpan={8} className="py-20 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center space-y-3">
                          <div className="bg-slate-50 p-4 rounded-full text-slate-300">
                            <IndianRupee className="h-8 w-8" />
                          </div>
                          <p className="text-slate-500 font-semibold text-sm">No Bookings Found</p>
                          <p className="text-xs max-w-sm text-slate-400">
                            There are currently no recorded bookings mapping your active project/status filters in the database.
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
                  <span className="font-semibold text-slate-800">{totalCount}</span> bookings
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

      {/* VIEW MODAL */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedBooking(null)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <IndianRupee className="h-5 w-5 text-indigo-400" />
                <span className="font-bold tracking-tight">Booking Consideration Details</span>
              </div>
              <button onClick={() => setSelectedBooking(null)} className="p-1 rounded-lg text-slate-400 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>            {/* Tabs Selector */}
            <div className="flex border-b border-slate-100 bg-slate-50 px-6">
              <button
                type="button"
                onClick={() => setActiveViewTab('details')}
                className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all focus:outline-none ${
                  activeViewTab === 'details'
                    ? 'border-indigo-600 text-indigo-600 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-650'
                }`}
              >
                Booking Details
              </button>
              <button
                type="button"
                onClick={() => setActiveViewTab('payments')}
                className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all focus:outline-none ${
                  activeViewTab === 'payments'
                    ? 'border-indigo-600 text-indigo-600 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-655'
                }`}
              >
                Payment Ledger
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {activeViewTab === 'details' ? (
                (() => {
                  const lead = leadsMap.get(selectedBooking.lead_id || '');
                  const unit = inventoryMap.get(selectedBooking.inventory_id || '');
                  return (
                    <>
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-lg font-bold text-slate-900">
                            {lead?.customer_name || selectedBooking.customer_name || 'Unnamed Client'}
                          </h4>
                          <p className="text-xs text-slate-500">Booking Serial: <span className="font-semibold text-slate-700">{selectedBooking.booking_number || 'N/A'}</span></p>
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          selectedBooking.status?.toLowerCase() === 'confirmed' ? 'bg-emerald-50 text-emerald-700' :
                          selectedBooking.status?.toLowerCase() === 'cancelled' ? 'bg-rose-50 text-rose-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {selectedBooking.status || 'draft'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-5">
                        <div className="flex items-start space-x-2 text-slate-700">
                          <User className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                          <div>
                            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Contact Phone</span>
                            <span className="text-sm font-semibold">{lead?.mobile || 'N/A'}</span>
                          </div>
                        </div>

                        <div className="flex items-start space-x-2 text-slate-700">
                          <IndianRupee className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                          <div>
                            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Booking Consideration</span>
                            <span className="text-sm font-bold text-indigo-700">
                              ₹{(selectedBooking.booking_amount || 0).toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-start space-x-2 text-slate-700">
                          <Clock className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                          <div>
                            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Booking Date</span>
                            <span className="text-sm font-semibold">
                              {selectedBooking.booking_date ? new Date(selectedBooking.booking_date).toLocaleDateString('en-IN') : 'N/A'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-start space-x-2 text-slate-700">
                          <Bookmark className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                          <div>
                            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Associated Project</span>
                            <span className="text-sm font-semibold">
                              {projectMap.get(selectedBooking.project_id || '') || 'N/A'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-start space-x-2 text-slate-700">
                          <Home className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                          <div>
                            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Tower & Floor</span>
                            <span className="text-sm font-semibold text-slate-800">
                              {towersMap.get(unit?.tower_id || '') || 'N/A'} — {floorsMap.get(unit?.floor_id || '') || 'N/A'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-start space-x-2 text-slate-700">
                          <Home className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                          <div>
                            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Unit & Configuration</span>
                            <span className="text-sm font-semibold text-slate-800">
                              Unit {unit?.unit_number || 'N/A'} ({unit?.configuration || 'N/A'})
                            </span>
                          </div>
                        </div>

                        <div className="flex items-start space-x-2 text-slate-700">
                          <Home className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                          <div>
                            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Carpet & Built-Up Area</span>
                            <span className="text-sm font-semibold text-slate-800">
                              Carpet: {unit?.carpet_area ? `${unit.carpet_area} sq.ft` : 'N/A'} | Built-Up: {unit?.built_up_area ? `${unit.built_up_area} sq.ft` : 'N/A'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-start space-x-2 text-slate-700">
                          <IndianRupee className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                          <div>
                            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Unit Base Price</span>
                            <span className="text-sm font-semibold text-slate-800">
                              {unit?.base_price ? `₹${unit.base_price.toLocaleString('en-IN')}` : 'N/A'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-start space-x-2 text-slate-700">
                          <User className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                          <div>
                            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Sourcing Manager Assigned</span>
                            <span className="text-sm font-semibold text-slate-850">
                              {profileMap.get(lead?.sourcing_manager_id || '') || 'N/A'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-start space-x-2 text-slate-700">
                          <User className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                          <div>
                            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Allocated To</span>
                            <span className="text-sm font-semibold text-slate-850">
                              {profileMap.get(selectedBooking.sales_owner || '') || profileMap.get(selectedBooking.closing_manager || '') || profileMap.get(lead?.owner_id || '') || 'N/A'}
                            </span>
                          </div>
                        </div>

                        {selectedBooking.channel_partner_id && (
                          <div className="flex items-start space-x-2 text-slate-700">
                            <Users className="h-4 w-4 text-indigo-500 mt-1 flex-shrink-0" />
                            <div>
                              <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Channel Partner Attribution</span>
                              <span className="text-sm font-semibold text-indigo-600">
                                {channelPartnerMap.get(selectedBooking.channel_partner_id) || 'N/A'}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-start space-x-2 text-slate-700 col-span-1 sm:col-span-2">
                          <Clock className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                          <div>
                            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Created Date / Audit Key ID</span>
                            <span className="text-sm font-semibold text-slate-650">
                              {selectedBooking.created_at ? new Date(selectedBooking.created_at).toLocaleString('en-IN') : 'N/A'} (ID: {selectedBooking.id})
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-slate-100 pt-5">
                        <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider mb-2">Financial Charges Breakdown</span>
                        <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 text-xs space-y-2 mb-4">
                          {(() => {
                            const baseAmt = selectedBooking.consideration_amount !== null && selectedBooking.consideration_amount !== undefined ? selectedBooking.consideration_amount : (selectedBooking.booking_amount || 0);
                            const gstAmt = selectedBooking.gst_amount || 0;
                            const sdAmt = selectedBooking.stamp_duty || 0;
                            const regAmt = selectedBooking.registration_charges || 0;
                            const devAmt = selectedBooking.development_charges || 0;
                            const maintAmt = selectedBooking.maintenance_charges || 0;
                            const parkAmt = selectedBooking.parking_charges || 0;
                            const othAmt = selectedBooking.other_charges || 0;
                            const totalAdditional = selectedBooking.total_additional_charges !== null && selectedBooking.total_additional_charges !== undefined ? selectedBooking.total_additional_charges : (gstAmt + sdAmt + regAmt + devAmt + maintAmt + parkAmt + othAmt);
                            const totalPayable = selectedBooking.total_payable_amount !== null && selectedBooking.total_payable_amount !== undefined ? selectedBooking.total_payable_amount : (selectedBooking.booking_amount || 0);
                            return (
                              <>
                                <div className="flex justify-between">
                                  <span className="text-slate-500 font-medium">Agreement Value (Base):</span>
                                  <span className="font-semibold text-slate-800">₹{baseAmt.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500 font-medium">GST Amount:</span>
                                  <span className="font-semibold text-slate-800">₹{gstAmt.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500 font-medium">Stamp Duty & Registration:</span>
                                  <span className="font-semibold text-slate-800">₹{sdAmt.toLocaleString('en-IN')}</span>
                                </div>
                                
                                <div className="flex justify-between">
                                  <span className="text-slate-500 font-medium">Development Charges:</span>
                                  <span className="font-semibold text-slate-800">₹{devAmt.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500 font-medium">Maintenance Charges:</span>
                                  <span className="font-semibold text-slate-800">₹{maintAmt.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500 font-medium">Parking Charges:</span>
                                  <span className="font-semibold text-slate-800">₹{parkAmt.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500 font-medium">Other Charges:</span>
                                  <span className="font-semibold text-slate-800">₹{othAmt.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="border-t border-slate-200 my-1 pt-1.5 flex justify-between">
                                  <span className="text-slate-500 font-medium">Total Additional Charges:</span>
                                  <span className="font-semibold text-slate-800">₹{totalAdditional.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="border-t border-slate-200 my-1 pt-1.5 flex justify-between">
                                  <span className="text-slate-900 font-bold">TOTAL PAYABLE AMOUNT:</span>
                                  <span className="font-extrabold text-indigo-700 text-sm">₹{totalPayable.toLocaleString('en-IN')}</span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="border-t border-slate-100 pt-5">
                        <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider mb-2">Booking Remarks / Notes</span>
                        <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-sm text-slate-700 leading-relaxed max-h-[120px] overflow-y-auto">
                          {selectedBooking.notes || 'No description remarks logged.'}
                        </div>
                      </div>
                    </>
                  );
                })()
              ) : (
                (() => {
                  const totalPayable = selectedBooking.total_payable_amount !== null ? selectedBooking.total_payable_amount : (selectedBooking.booking_amount || 0);
                  const validPayments = bookingPayments.filter(p => p.status !== 'cancelled' && p.status !== 'refunded');
                  const totalPaid = validPayments
                    .filter(p => p.status?.toLowerCase() === 'received' || p.status?.toLowerCase() === 'paid')
                    .reduce((sum, p) => sum + p.amount, 0);
                  // Currently due isn't the full booking value -- it's staged by
                  // the project's released payment percentage, plus
                  // first-payment/possession-triggered charges.
                  const milestonePercent = towerMilestonePercent.get(selectedBooking.tower_id || '') || 0;
                  const currentlyDueTotal = computeCurrentlyDueTotal(selectedBooking, milestonePercent, totalPaid > 0);
                  const outstanding = Math.max(0, currentlyDueTotal - totalPaid);

                  return (
                    <div className="space-y-5">
                      {/* Ledger Summary Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-xs">
                        <div>
                          <span className="block font-bold text-slate-400 uppercase tracking-wider text-xxs">Booking Value (Total)</span>
                          <span className="font-extrabold text-slate-800 text-sm">₹{totalPayable.toLocaleString('en-IN')}</span>
                        </div>
                        <div>
                          <span className="block font-bold text-slate-400 uppercase tracking-wider text-xxs">Currently Due ({milestonePercent}% Released)</span>
                          <span className="font-extrabold text-amber-600 text-sm">₹{currentlyDueTotal.toLocaleString('en-IN')}</span>
                        </div>
                        <div>
                          <span className="block font-bold text-slate-400 uppercase tracking-wider text-xxs">Total Settled</span>
                          <span className="font-extrabold text-emerald-600 text-sm">₹{totalPaid.toLocaleString('en-IN')}</span>
                        </div>
                        <div>
                          <span className="block font-bold text-slate-400 uppercase tracking-wider text-xxs">Outstanding (This Stage)</span>
                          <span className="font-bold text-indigo-600 text-sm">₹{outstanding.toLocaleString('en-IN')}</span>
                        </div>
                      </div>

                      {/* Header and Record Button */}
                      <div className="flex justify-between items-center pt-2">
                        <span className="block font-bold text-slate-700 uppercase tracking-wide text-xs">Receipt Ledger Ledger</span>
                        <button
                          type="button"
                          onClick={() => {
                            setAddAmount('');
                            setAddDueDate('');
                            setAddReceivedDate(new Date().toISOString().split('T')[0]);
                            setAddPaymentMode('Cash');
                            setAddTxnRef('');
                            setAddChequeNum('');
                            setAddBankName('');
                            setAddRemarks('');
                            setAddPaymentStatus('paid');
                            setAddPaymentError(null);
                            setIsAddPaymentOpen(true);
                          }}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xxs font-bold shadow-sm transition-all focus:outline-none"
                        >
                          <Plus className="h-3 w-3" />
                          <span>Record Payment</span>
                        </button>
                      </div>

                      {/* History list */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                        {loadingPayments ? (
                          <div className="py-12 text-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-100 border-t-indigo-600 mx-auto mb-2"></div>
                            <span className="text-xs text-slate-400 font-medium">Fetching payment ledger...</span>
                          </div>
                        ) : bookingPayments.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-200 uppercase tracking-wider">
                                  <th className="py-2.5 px-3">Payment #</th>
                                  <th className="py-2.5 px-3">Date</th>
                                  <th className="py-2.5 px-3">Type</th>
                                  <th className="py-2.5 px-3">Amount</th>
                                  <th className="py-2.5 px-3">Mode</th>
                                  <th className="py-2.5 px-3">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {bookingPayments.map((p) => {
                                  const displayStatus = p.status?.toLowerCase() === 'pending' && p.due_date && new Date(p.due_date) < new Date(new Date().setHours(0,0,0,0))
                                    ? 'overdue'
                                    : p.status;
                                  return (
                                    <tr key={p.id} className="text-slate-700 hover:bg-slate-50/50">
                                      <td className="py-2.5 px-3 font-bold">{p.payment_number || 'Pending'}</td>
                                      <td className="py-2.5 px-3">
                                        {p.received_date 
                                          ? new Date(p.received_date).toLocaleDateString('en-IN') 
                                          : p.due_date 
                                            ? new Date(p.due_date).toLocaleDateString('en-IN') 
                                            : '—'}
                                      </td>
                                      <td className="py-2.5 px-3">{p.payment_type}</td>
                                      <td className="py-2.5 px-3 font-extrabold text-slate-900">₹{p.amount?.toLocaleString('en-IN')}</td>
                                      <td className="py-2.5 px-3">{p.payment_mode || '—'}</td>
                                      <td className="py-2.5 px-3">
                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xxs font-bold uppercase tracking-wider ${
                                          displayStatus === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                                          displayStatus === 'partially_paid' ? 'bg-blue-50 text-blue-700' :
                                          displayStatus === 'overdue' ? 'bg-rose-50 text-rose-700' :
                                          displayStatus === 'cancelled' ? 'bg-slate-100 text-slate-400' :
                                          'bg-amber-50 text-amber-700'
                                        }`}>
                                          {displayStatus}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="py-10 text-center text-slate-400">
                            <span className="block text-xs font-semibold">No Payments Logged</span>
                            <span className="block text-xxs mt-0.5">Record a deposit payment to reconcile this booking.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}</div>

            {/* Footer */}
            <div className="bg-slate-50 px-6 py-4 flex justify-between items-center border-t border-slate-100">
                {/* Actions */}
                <div className="flex space-x-3 w-full">
                  {selectedBooking.status?.toLowerCase() === 'draft' && canApproveBooking(selectedBooking) && (
                    <button 
                      onClick={() => { setConfirmingBooking(selectedBooking); setSelectedBooking(null); }}
                      className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-colors"
                    >
                      Confirm Booking
                    </button>
                  )}
                  {!selectedBooking.possession_date
                    && selectedBooking.status?.toLowerCase() !== 'cancelled'
                    && selectedBooking.status?.toLowerCase() !== 'refunded'
                    && (isSuperAdmin(role) || role === 'site_head') && (
                    <button
                      onClick={() => handleMarkPossession(selectedBooking)}
                      disabled={markingPossessionId === selectedBooking.id}
                      className="px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                    >
                      {markingPossessionId === selectedBooking.id ? 'Marking...' : 'Mark Possession Given'}
                    </button>
                  )}
                  {(selectedBooking.status?.toLowerCase() === 'draft' || selectedBooking.status?.toLowerCase() === 'confirmed') && (
                  <button
                    onClick={() => { setCancellingBooking(selectedBooking); setSelectedBooking(null); setCancelReason(''); setCancelRefundAmount(String(selectedBooking.token_amount || 0)); setCancelError(null); }}
                    className={`px-4 py-2.5 ${canApproveBooking(selectedBooking) ? 'bg-rose-50 hover:bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'} rounded-xl text-sm font-bold transition-all`}
                    disabled={!canApproveBooking(selectedBooking)}
                  >
                    Cancel Booking
                  </button>
                )}
              </div>
              <button
                onClick={() => setSelectedBooking(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {confirmingBooking && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setConfirmingBooking(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-emerald-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">Confirm Status Update</span>
              <button onClick={() => setConfirmingBooking(null)} className="p-1 rounded-lg text-emerald-200 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Are you sure you want to transition this booking status from <strong>Draft</strong> to <strong>Confirmed</strong>? This action will set the unit's inventory status to <strong>Booked</strong>.
              </p>
              
              {(() => {
                const lead = leadsMap.get(confirmingBooking.lead_id || '');
                const unit = inventoryMap.get(confirmingBooking.inventory_id || '');
                return (
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2.5 text-xs text-slate-700">
                    <div>
                      <span className="block font-bold text-slate-400 uppercase tracking-wide">Customer / Lead</span>
                      <span className="text-sm font-semibold text-slate-800">{lead?.customer_name || confirmingBooking.customer_name || 'N/A'}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60">
                      <div>
                        <span className="block font-bold text-slate-400 uppercase tracking-wide">Project</span>
                        <span className="font-semibold text-slate-800">{projectMap.get(confirmingBooking.project_id || '') || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="block font-bold text-slate-400 uppercase tracking-wide">Tower / Unit</span>
                        <span className="font-semibold text-slate-800">
                          {towersMap.get(unit?.tower_id || '') || 'N/A'} - {unit?.unit_number || 'N/A'}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60">
                      {(() => {
                        const baseAmt = confirmingBooking.consideration_amount !== null ? confirmingBooking.consideration_amount : (confirmingBooking.booking_amount || 0);
                        const totalPayable = confirmingBooking.total_payable_amount !== null ? confirmingBooking.total_payable_amount : (confirmingBooking.booking_amount || 0);
                        return (
                          <>
                            <div>
                              <span className="block font-bold text-slate-400 uppercase tracking-wide">Base Amount</span>
                              <span className="font-semibold text-slate-800">₹{baseAmt.toLocaleString('en-IN')}</span>
                            </div>
                            <div>
                              <span className="block font-bold text-slate-400 uppercase tracking-wide">Total Payable</span>
                              <span className="font-bold text-indigo-700">₹{totalPayable.toLocaleString('en-IN')}</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    <div className="grid grid-cols-1 gap-2 pt-2 border-t border-slate-200/60">
                      <div>
                        <span className="block font-bold text-slate-400 uppercase tracking-wide">Booking Date</span>
                        <span className="font-semibold text-slate-800">
                          {confirmingBooking.booking_date ? new Date(confirmingBooking.booking_date).toLocaleDateString('en-IN') : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-2 border-t border-slate-100">
              <button
                onClick={() => setConfirmingBooking(null)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-100 transition-all"
              >
                No, Keep Draft
              </button>
              <button
                onClick={async () => {
                  const bId = confirmingBooking.id;
                  setConfirmingBooking(null);
                  await handleUpdateStatus(bId, 'confirmed');
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
              >
                Yes, Confirm Booking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCELLATION MODAL */}
      {cancellingBooking && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !cancelSubmitting && setCancellingBooking(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-rose-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">Cancel Booking</span>
              <button onClick={() => !cancelSubmitting && setCancellingBooking(null)} className="p-1 rounded-lg text-rose-200 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Are you sure you want to cancel this booking?
              </p>
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs text-sky-800">
                The inventory unit will be released back to <strong>Available</strong> automatically once cancelled.
              </div>

              {(() => {
                const lead = leadsMap.get(cancellingBooking.lead_id || '');
                const unit = inventoryMap.get(cancellingBooking.inventory_id || '');
                return (
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2.5 text-xs text-slate-700">
                    <div>
                      <span className="block font-bold text-slate-400 uppercase tracking-wide">Customer / Lead</span>
                      <span className="text-sm font-semibold text-slate-800">{lead?.customer_name || cancellingBooking.customer_name || 'N/A'}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60">
                      <div>
                        <span className="block font-bold text-slate-400 uppercase tracking-wide">Project</span>
                        <span className="font-semibold text-slate-800">{projectMap.get(cancellingBooking.project_id || '') || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="block font-bold text-slate-400 uppercase tracking-wide">Tower / Unit</span>
                        <span className="font-semibold text-slate-800">
                          {towersMap.get(unit?.tower_id || '') || 'N/A'} - {unit?.unit_number || 'N/A'}
                        </span>
                      </div>
                    </div>
                    {(cancellingBooking.token_amount || 0) > 0 && (
                      <div className="pt-2 border-t border-slate-200/60">
                        <span className="block font-bold text-slate-400 uppercase tracking-wide">Token Money Collected</span>
                        <span className="font-semibold text-slate-800">Rs. {(cancellingBooking.token_amount || 0).toLocaleString('en-IN')}</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                  Cancellation Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-rose-400"
                  placeholder="Why is this booking being cancelled?"
                />
              </div>

              {(cancellingBooking.token_amount || 0) > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                    Refund Amount (of Rs. {(cancellingBooking.token_amount || 0).toLocaleString('en-IN')} collected)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={cancellingBooking.token_amount || 0}
                    value={cancelRefundAmount}
                    onChange={(e) => setCancelRefundAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-rose-400"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Any amount not refunded is recorded as a loss against this booking.
                  </p>
                </div>
              )}

              {cancelError && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-xs text-rose-700">
                  {cancelError}
                </div>
              )}
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-2 border-t border-slate-100">
              <button
                onClick={() => setCancellingBooking(null)}
                disabled={cancelSubmitting}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-100 transition-all disabled:opacity-50"
              >
                No, Keep Booking
              </button>
              <button
                onClick={() => handleCancelBooking(cancellingBooking, cancelReason, cancelRefundAmount)}
                disabled={cancelSubmitting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
              >
                {cancelSubmitting ? 'Cancelling...' : 'Yes, Cancel Booking'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsCreateOpen(false)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">Create New Booking</span>
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
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Channel Partner Attribution (Auto-filled from Lead)</label>
                  <select
                    disabled
                    value={selectedChannelPartnerId}
                    onChange={(e) => setSelectedChannelPartnerId(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-100 text-slate-650 text-sm focus:outline-none transition-all cursor-not-allowed"
                  >
                    <option value="">Direct (No Channel Partner Referral)</option>
                    {channelPartnersList.map(cp => (
                      <option key={cp.id} value={cp.id}>
                        {cp.company_name || cp.name}
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
                    onChange={(e) => handleProjectChange(e.target.value)}
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

                {/* Tower Select */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Tower *</label>
                  <select
                    required
                    disabled={!selectedProjectId || fetchingLookups || availableTowers.length === 0}
                    value={selectedTowerId}
                    onChange={(e) => handleTowerChange(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="">{towerPlaceholder}</option>
                    {availableTowers.map(t => (
                      <option key={t.id} value={t.id}>{t.tower_name || 'Unnamed Tower'}</option>
                    ))}
                  </select>
                </div>

                {/* Flat / Inventory Select */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Select Flat / Unit *</label>
                  <select
                    required
                    disabled={!selectedTowerId || fetchingLookups || availableInventory.length === 0}
                    value={selectedInventoryId}
                    onChange={(e) => setSelectedInventoryId(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="">{unitPlaceholder}</option>
                    {availableInventory.map(item => (
                      <option key={item.id} value={item.id}>
                        Unit {item.unit_number || 'N/A'} ({item.status || 'available'})
                      </option>
                    ))}
                  </select>
                  {selectedTowerId && availableInventory.length === 0 && (
                    <p className="text-xxs text-amber-600 font-semibold mt-1">
                      ⚠️ Note: To create a booking, you must first add an available unit record to the "project_inventory" table referencing this Project and Tower.
                    </p>
                  )}
                </div>

                {/* Financial Charges Structure */}
                <div className="border-t border-slate-200 pt-4 mt-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">Financial Charges Structure</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Base/Agreement Value */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Agreement Value (Base) *</label>
                      <div className="relative">
                        <IndianRupee className="absolute inset-y-0 left-3 h-4.5 w-4.5 text-slate-400 self-center top-1/2 -translate-y-1/2" />
                        <input
                          type="number"
                          required
                          min="1"
                          placeholder="e.g. 3000000"
                          value={considerationAmount}
                          onChange={(e) => setConsiderationAmount(e.target.value)}
                          className="block w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* GST Amount */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">GST Amount</label>
                      <div className="relative">
                        <IndianRupee className="absolute inset-y-0 left-3 h-4.5 w-4.5 text-slate-400 self-center top-1/2 -translate-y-1/2" />
                        <input
                          type="number"
                          min="0"
                          placeholder="Enter GST amount"
                          value={gstAmount}
                          onChange={(e) => setGstAmount(e.target.value)}
                          className="block w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* Stamp Duty */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Stamp Duty & Registration Amount</label>
                      <div className="relative">
                        <IndianRupee className="absolute inset-y-0 left-3 h-4.5 w-4.5 text-slate-400 self-center top-1/2 -translate-y-1/2" />
                        <input
                          type="number"
                          min="0"
                          placeholder="Enter stamp duty"
                          value={stampDuty}
                          onChange={(e) => setStampDuty(e.target.value)}
                          className="block w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    

                    {/* Development Charges */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Development Charges</label>
                      <div className="relative">
                        <IndianRupee className="absolute inset-y-0 left-3 h-4.5 w-4.5 text-slate-400 self-center top-1/2 -translate-y-1/2" />
                        <input
                          type="number"
                          min="0"
                          placeholder="Enter development charges"
                          value={developmentCharges}
                          onChange={(e) => setDevelopmentCharges(e.target.value)}
                          className="block w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* Maintenance Charges */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Maintenance Charges</label>
                      <div className="relative">
                        <IndianRupee className="absolute inset-y-0 left-3 h-4.5 w-4.5 text-slate-400 self-center top-1/2 -translate-y-1/2" />
                        <input
                          type="number"
                          min="0"
                          placeholder="Enter maintenance charges"
                          value={maintenanceCharges}
                          onChange={(e) => setMaintenanceCharges(e.target.value)}
                          className="block w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* Parking Charges */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Parking Charges</label>
                      <div className="relative">
                        <IndianRupee className="absolute inset-y-0 left-3 h-4.5 w-4.5 text-slate-400 self-center top-1/2 -translate-y-1/2" />
                        <input
                          type="number"
                          min="0"
                          placeholder="Enter parking charges"
                          value={parkingCharges}
                          onChange={(e) => setParkingCharges(e.target.value)}
                          className="block w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* Other Charges */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Other Charges</label>
                      <div className="relative">
                        <IndianRupee className="absolute inset-y-0 left-3 h-4.5 w-4.5 text-slate-400 self-center top-1/2 -translate-y-1/2" />
                        <input
                          type="number"
                          min="0"
                          placeholder="Enter other charges"
                          value={otherCharges}
                          onChange={(e) => setOtherCharges(e.target.value)}
                          className="block w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Calculated Total Payable Display */}
                  <div className="mt-5 p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="block text-xxs font-bold text-indigo-900 uppercase tracking-wider">Calculated Total Payable</span>
                      <span className="text-xs text-indigo-700 font-medium">Auto-derived sum of all charges above</span>
                    </div>
                    <span className="text-lg font-extrabold text-indigo-700">
                      ₹{calculatedTotalPayable.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Booking Date */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Booking Date *</label>
                  <input
                    type="date"
                    required
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="block w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:border-indigo-600 focus:outline-none transition-all"
                  />
                </div>

                {/* Status select */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Initial Status *</label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                  >
                    <option value="draft">Draft</option>
                    {canApproveBooking(selectedBooking) && <option value="confirmed">Confirmed</option>}
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Booking remarks / Comments</label>
                  <textarea
                    placeholder="Describe payment logs, cheque numbers, downpayment scheduling..."
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
                  {createLoading ? 'Inserting...' : 'Create Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* RECORD PAYMENT MODAL (CHILD OF VIEW MODAL) */}
      {isAddPaymentOpen && selectedBooking && (
        <div className="fixed inset-0 z-[60] overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={() => setIsAddPaymentOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-150 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">Record Booking Payment</span>
              <button type="button" onClick={() => setIsAddPaymentOpen(false)} className="p-1 rounded-lg text-indigo-200 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddPaymentSubmit}>
              <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                {addPaymentError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-start space-x-2.5">
                    <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-semibold leading-tight">{addPaymentError}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {/* Payment Type */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Payment Type *</label>
                    <select
                      value={addPaymentType}
                      onChange={(e) => setAddPaymentType(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      <option value="Booking">Booking Deposit</option>
                      <option value="Installment">Installment</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Amount (₹) *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="e.g. 500000"
                      value={addAmount}
                      onChange={(e) => setAddAmount(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Due Date */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Due Date</label>
                    <input
                      type="date"
                      value={addDueDate}
                      onChange={(e) => setAddDueDate(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>

                  {/* Received Date */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Received Date</label>
                    <input
                      type="date"
                      value={addReceivedDate}
                      onChange={(e) => setAddReceivedDate(e.target.value)}
                      disabled={addPaymentStatus !== 'paid'}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Payment Mode */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Payment Mode</label>
                    <select
                      value={addPaymentMode}
                      onChange={(e) => setAddPaymentMode(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Cheque">Cheque</option>
                      <option value="UPI">UPI</option>
                      <option value="NEFT">NEFT</option>
                      <option value="RTGS">RTGS</option>
                      <option value="IMPS">IMPS</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Card">Card</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  {/* Status */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Status *</label>
                    <select
                      value={addPaymentStatus}
                      onChange={(e) => {
                        setAddPaymentStatus(e.target.value);
                        if (e.target.value !== 'paid') setAddReceivedDate('');
                      }}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      <option value="paid">Paid</option>
                      <option value="pending">Pending</option>
                      <option value="partially_paid">Partially Paid</option>
                    </select>
                  </div>
                </div>

                {/* Additional payment mode specific details */}
                {addPaymentMode === 'Cheque' && (
                  <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-150">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Cheque Number *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 102456"
                        value={addChequeNum}
                        onChange={(e) => setAddChequeNum(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-850 text-sm focus:bg-white focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Bank Name</label>
                      <input
                        type="text"
                        placeholder="e.g. HDFC Bank"
                        value={addBankName}
                        onChange={(e) => setAddBankName(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                      />
                    </div>
                  </div>
                )}

                {['NEFT', 'RTGS', 'IMPS', 'Bank Transfer', 'UPI', 'Card', 'Other'].includes(addPaymentMode) && (
                  <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-150">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Transaction Reference</label>
                      <input
                        type="text"
                        placeholder="e.g. TXN10009238"
                        value={addTxnRef}
                        onChange={(e) => setAddTxnRef(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-850 text-sm focus:bg-white focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Bank Name</label>
                      <input
                        type="text"
                        placeholder="e.g. ICICI Bank"
                        value={addBankName}
                        onChange={(e) => setAddBankName(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                      />
                    </div>
                  </div>
                )}

                {/* Remarks */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Remarks</label>
                  <textarea
                    placeholder="Log comments, cheque clearance schedules, installment particulars..."
                    rows={2}
                    value={addRemarks}
                    onChange={(e) => setAddRemarks(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddPaymentOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addPaymentLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/10 hover:shadow-lg disabled:opacity-50 transition-all focus:outline-none"
                >
                  {addPaymentLoading ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
