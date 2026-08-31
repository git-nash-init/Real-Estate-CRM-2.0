import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { canEditPayment, canCancelPayment, isSuperAdmin } from '../utils/permissions';
import { exportRowsToExcel } from '../utils/exportExcel';
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  AlertCircle,
  CheckCircle,
  IndianRupee,
  Plus,
  Printer,
  Trash2,
  Edit,
  Ban,
  Download
} from 'lucide-react';

interface Payment {
  id: string;
  booking_id: string;
  payment_number: string;
  payment_type: string;
  amount: number;
  due_date: string | null;
  received_date: string | null;
  payment_mode: string | null;
  transaction_reference: string | null;
  cheque_number: string | null;
  bank_name: string | null;
  receipt_document: string | null;
  status: string;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface Booking {
  id: string;
  booking_number: string;
  customer_name: string;
  project_id: string;
  inventory_id: string;
  booking_amount: number;
  consideration_amount?: number | null;
  total_additional_charges?: number | null;
  total_payable_amount?: number | null;
  lead_id: string;
  status: string;
}

interface Project {
  id: string;
  project_name: string;
}


interface InventoryUnit {
  id: string;
  unit_number: string;
  project_id: string;
  tower_id: string;
}

export const Payments: React.FC = () => {
  // Page lists and lookups
  const [payments, setPayments] = useState<Payment[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // Lookup maps for easy display mapping
  const [projectMap, setProjectMap] = useState<Map<string, string>>(new Map());
  const [towerMap, setTowerMap] = useState<Map<string, string>>(new Map());
  const [inventoryMap, setInventoryMap] = useState<Map<string, InventoryUnit>>(new Map());
  const [bookingMap, setBookingMap] = useState<Map<string, Booking>>(new Map());

  // Navigation / Loading / UI States
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [bookingFilter, setBookingFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dueDateFilter, setDueDateFilter] = useState('');
  const [receivedDateFilter, setReceivedDateFilter] = useState('');

  // Pagination
  const [page, setPage] = useState(0);
  const [pageSize] = useState(10);

  const { role } = useAuth();

  // Tab view selector: 'customer' | 'referral fee'
  const [activeView, setActiveView] = useState<'customer' | 'referral fee'>('customer');

  // Referral Fee data states
  const [cpCommissions, setCpCommissions] = useState<any[]>([]);
  const [cpPayouts, setCpPayouts] = useState<any[]>([]);
  const [cpMap, setCpMap] = useState<Map<string, any>>(new Map());

  // Record Payout modal states
  const [isPayoutOpen, setIsPayoutOpen] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [selectedCommissionId, setSelectedCommissionId] = useState('');
  const [payoutAmountInput, setPayoutAmountInput] = useState('');
  const [payoutPaymentMode, setPayoutPaymentMode] = useState('BANK_TRANSFER');
  const [payoutReferenceNumber, setPayoutReferenceNumber] = useState('');
  const [payoutNotes, setPayoutNotes] = useState('');
  const [payoutDate, setPayoutDate] = useState(new Date().toISOString().split('T')[0]);

  // Modal / Form states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [receiptPayment, setReceiptPayment] = useState<Payment | null>(null);
  const [cancellingPayment, setCancellingPayment] = useState<Payment | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form Fields
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [paymentType, setPaymentType] = useState('OCR');
  const [amountInput, setAmountInput] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [transactionReference, setTransactionReference] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [remarks, setRemarks] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('paid');

  // Auto-dismiss alert notifications
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Load all lookup data from Supabase
  const fetchData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      // 1. Fetch Projects
      const { data: projData, error: projErr } = await supabase
        .from('projects')
        .select('id, project_name');
      if (projErr) throw projErr;
      setProjects(projData || []);
      setProjectMap(new Map(projData?.map(p => [p.id, p.project_name]) || []));

      // 2. Fetch Towers
      const { data: towData, error: towErr } = await supabase
        .from('project_towers')
        .select('id, tower_name, project_id');
      if (towErr) throw towErr;
      setTowerMap(new Map(towData?.map(t => [t.id, t.tower_name]) || []));

      // 3. Fetch Units
      const { data: unitData, error: unitErr } = await supabase
        .from('project_inventory')
        .select('id, unit_number, project_id, tower_id');
      if (unitErr) throw unitErr;
      setInventoryMap(new Map(unitData?.map(u => [u.id, u]) || []));

      // 4. Fetch Bookings (load all valid ones)
      const { data: bookData, error: bookErr } = await supabase
        .from('bookings')
        .select('id, booking_number, customer_name, project_id, inventory_id, booking_amount, consideration_amount, total_additional_charges, total_payable_amount, lead_id, status');
      if (bookErr) throw bookErr;
      setBookings(bookData || []);
      setBookingMap(new Map(bookData?.map(b => [b.id, b]) || []));

      // 5. Fetch Payments
      const { data: payData, error: payErr } = await supabase
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false });
      if (payErr) throw payErr;
      setPayments(payData || []);

      // 6. Fetch Channel Partners
      const { data: cpData, error: cpErr } = await supabase
        .from('channel_partners')
        .select('id, name, company_name, partner_code, cp_code');
      if (cpErr) throw cpErr;
      setCpMap(new Map(cpData?.map(cp => [cp.id, cp]) || []));

      // 7. Fetch CP referral fees
      const { data: commsData, error: commsErr } = await supabase
        .from('cp_commissions')
        .select('*')
        .order('created_at', { ascending: false });
      if (commsErr) throw commsErr;
      setCpCommissions(commsData || []);

      // 8. Fetch CP payouts
      const { data: payoutsData, error: payoutsErr } = await supabase
        .from('cp_commission_payouts')
        .select('*')
        .order('created_at', { ascending: false });
      if (payoutsErr) throw payoutsErr;
      setCpPayouts(payoutsData || []);
    } catch (err: any) {
      console.error('Payments loading error:', err);
      setError(err.message || 'An error occurred while loading payment transactions.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sync refresh trigger
  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    await fetchData();
  };

  // Record referral fee payout submission
  const handlePayoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCommissionId) {
      setPayoutError('Please select a referral fee obligation.');
      return;
    }
    const amt = parseFloat(payoutAmountInput) || 0;
    if (amt <= 0) {
      setPayoutError('Payout amount must be greater than zero.');
      return;
    }

    setPayoutLoading(true);
    setPayoutError(null);

    try {
      const comm = cpCommissions.find(c => c.id === selectedCommissionId);
      if (!comm) throw new Error('Referral Fee record not found.');

      const statusLower = comm.status?.toLowerCase();
      if (statusLower === 'pending' || statusLower === 'cancelled') {
        throw new Error('Referral Fee must be approved before recording a payout.');
      }

      const outstanding = comm.pending_amount ?? (comm.payable_amount - comm.paid_amount);
      if (amt > outstanding) {
        throw new Error(`Payout amount exceeds outstanding referral fee of ₹${outstanding.toLocaleString('en-IN')}. Overpayment is denied.`);
      }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id || null;

      // 1. Insert payout record
      const { error: payErr } = await supabase
        .from('cp_commission_payouts')
        .insert([
          {
            commission_id: selectedCommissionId,
            amount: amt,
            payment_date: payoutDate || new Date().toISOString().split('T')[0],
            payment_mode: payoutPaymentMode,
            reference_number: payoutReferenceNumber.trim() || null,
            notes: payoutNotes.trim() || null,
            recorded_by: userId
          }
        ]);

      if (payErr) throw payErr;

      // 2. Update referral fee status and paid/pending balances
      const totalPaid = (comm.paid_amount || 0) + amt;
      const nextPending = Math.max(0, comm.payable_amount - totalPaid);
      const nextCommStatus = totalPaid >= comm.payable_amount ? 'paid' : 'partially_paid';

      const { error: updateErr } = await supabase
        .from('cp_commissions')
        .update({
          status: nextCommStatus,
          paid_amount: totalPaid,
          pending_amount: nextPending,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedCommissionId);

      if (updateErr) throw updateErr;

      setNotification({
        type: 'success',
        message: `Referral Fee payout of ₹${amt.toLocaleString('en-IN')} successfully logged!`
      });

      setIsPayoutOpen(false);
      setSelectedCommissionId('');
      setPayoutAmountInput('');
      setPayoutReferenceNumber('');
      setPayoutNotes('');
      await fetchData();
    } catch (err: any) {
      console.error('Payout submit error:', err);
      setPayoutError(err.message || 'Failed to record referral fee payout.');
    } finally {
      setPayoutLoading(false);
    }
  };

  // A CP can only ever set settlement_requested_at on their own commission
  // row -- enforced server-side by enforce_cp_settlement_request_only,
  // which also refuses this until first_payment_received_at is set. This
  // is just the request; approval/payout still happens separately via
  // Record Payout, by super admin or that project's site head.
  const [settlementRequestingId, setSettlementRequestingId] = useState<string | null>(null);
  const handleRequestSettlement = async (commissionId: string) => {
    setSettlementRequestingId(commissionId);
    try {
      const { error } = await supabase
        .from('cp_commissions')
        .update({ settlement_requested_at: new Date().toISOString() })
        .eq('id', commissionId);
      if (error) throw error;
      setNotification({ type: 'success', message: 'Settlement request submitted.' });
      await fetchData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to submit settlement request.' });
    } finally {
      setSettlementRequestingId(null);
    }
  };

  const handlePayoutCommissionChange = (commId: string) => {
    setSelectedCommissionId(commId);
    if (!commId) {
      setPayoutAmountInput('');
      return;
    }
    const comm = cpCommissions.find(c => c.id === commId);
    if (comm) {
      setPayoutAmountInput((comm.pending_amount || 0).toString());
    }
  };

  // Pre-fill / derive values when selectedBookingId changes in creation form
  const selectedBooking = bookingMap.get(selectedBookingId);
  const selectedBookingPayments = payments.filter(p => p.booking_id === selectedBookingId && p.status !== 'cancelled' && p.status !== 'refunded');
  
  const totalPaidForSelected = selectedBookingPayments
    .filter(p => p.status?.toLowerCase() === 'received' || p.status?.toLowerCase() === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);

  const selectedBookingTotalVal = selectedBooking ? (selectedBooking.total_payable_amount !== null && selectedBooking.total_payable_amount !== undefined ? selectedBooking.total_payable_amount : selectedBooking.booking_amount) : 0;
  const outstandingForSelected = selectedBooking ? (selectedBookingTotalVal - totalPaidForSelected) : 0;

  // Overdue check resolver
  const getDisplayStatus = (p: Payment) => {
    if (p.status?.toLowerCase() === 'pending' && p.due_date && new Date(p.due_date) < new Date(new Date().setHours(0,0,0,0))) {
      return 'overdue';
    }
    return p.status || 'pending';
  };

  // Submit Handler for Creation & Editing
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookingId) {
      setFormError('Please select a valid Booking.');
      return;
    }
    if (!paymentType) {
      setFormError('Please select a Payment Type.');
      return;
    }
    const newAmt = parseFloat(amountInput);
    if (isNaN(newAmt) || newAmt <= 0) {
      setFormError('Payment amount must be greater than zero.');
      return;
    }

    // Validation for Cheque / Bank details
    if (paymentMode === 'Cheque' && !chequeNumber.trim()) {
      setFormError('Cheque Number is required when Payment Mode is Cheque.');
      return;
    }
    if (['NEFT', 'RTGS', 'IMPS', 'Bank Transfer'].includes(paymentMode) && !bankName.trim() && !transactionReference.trim()) {
      setFormError('Bank Name or Transaction Reference is required for bank transfers.');
      return;
    }

    // Validation for received date
    if (paymentStatus === 'paid' && !receivedDate) {
      setFormError('Received Date is required when status is Paid.');
      return;
    }

    setFormError(null);
    setFormLoading(true);

    try {
      // 1. Fetch live booking to verify it still exists
      const { data: dbBooking, error: bookErr } = await supabase
        .from('bookings')
        .select('booking_amount, total_payable_amount')
        .eq('id', selectedBookingId)
        .single();
      if (bookErr || !dbBooking) {
        throw new Error("The selected booking no longer exists.");
      }

      // 2. Fetch live payments for this booking to calculate exact balance
      const { data: dbPayments, error: payErr } = await supabase
        .from('payments')
        .select('id, amount, status')
        .eq('booking_id', selectedBookingId);
      if (payErr) {
        throw new Error("Unable to verify booking payment history.");
      }

      const totalBookingVal = dbBooking.total_payable_amount !== null ? dbBooking.total_payable_amount : dbBooking.booking_amount;

      const activeTotal = dbPayments
        .filter(p => (p.status?.toLowerCase() === 'received' || p.status?.toLowerCase() === 'paid') && (!editingPayment || p.id !== editingPayment.id))
        .reduce((sum, p) => sum + p.amount, 0);

      // Overpayment check
      if (activeTotal + newAmt > totalBookingVal) {
        throw new Error("Payment amount exceeds the outstanding booking balance.");
      }

      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || null;

      const payload: any = {
        booking_id: selectedBookingId,
        payment_type: paymentType,
        amount: newAmt,
        due_date: dueDate || null,
        received_date: paymentStatus === 'paid' ? receivedDate : null,
        payment_mode: paymentMode,
        transaction_reference: transactionReference.trim() || null,
        cheque_number: chequeNumber.trim() || null,
        bank_name: bankName.trim() || null,
        status: paymentStatus,
        remarks: remarks.trim() || null,
        updated_at: new Date().toISOString()
      };

      if (editingPayment) {
        const { error: editErr } = await supabase
          .from('payments')
          .update(payload)
          .eq('id', editingPayment.id);
        if (editErr) throw editErr;
        setNotification({ type: 'success', message: 'Payment record updated successfully.' });
      } else {
        payload.created_by = userId;
        payload.created_at = new Date().toISOString();

        // Safe auto-detecting unique number generator/insert
        const { error: insertErr } = await supabase
          .from('payments')
          .insert([payload]);

        if (insertErr) {
          if (insertErr.message?.toLowerCase().includes('payment_number') && insertErr.message?.toLowerCase().includes('null value')) {
            // Falls back to frontend generation if DB doesn't generate automatically
            payload.payment_number = `PMT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
            const { error: retryErr } = await supabase
              .from('payments')
              .insert([payload]);
            if (retryErr) throw retryErr;
          } else {
            throw insertErr;
          }
        }
        setNotification({ type: 'success', message: 'Payment recorded successfully.' });
      }

      setIsModalOpen(false);
      setEditingPayment(null);
      await fetchData();
    } catch (err: any) {
      console.error('Error saving payment:', err);
      setFormError(err.message || 'Unable to save payment. Please try again.');
    } finally {
      setFormLoading(false);
    }
  };

  // Open creation modal
  const openCreateModal = () => {
    setEditingPayment(null);
    setFormError(null);
    setSelectedBookingId('');
    setPaymentType('Booking');
    setAmountInput('');
    setDueDate('');
    setReceivedDate(new Date().toISOString().split('T')[0]);
    setPaymentMode('Cash');
    setTransactionReference('');
    setChequeNumber('');
    setBankName('');
    setRemarks('');
    setPaymentStatus('paid');
    setIsModalOpen(true);
  };

  // Open editing modal
  const openEditModal = (p: Payment) => {
    setEditingPayment(p);
    setFormError(null);
    setSelectedBookingId(p.booking_id);
    setPaymentType(p.payment_type);
    setAmountInput(p.amount.toString());
    setDueDate(p.due_date || '');
    setReceivedDate(p.received_date || '');
    setPaymentMode(p.payment_mode || 'Cash');
    setTransactionReference(p.transaction_reference || '');
    setChequeNumber(p.cheque_number || '');
    setBankName(p.bank_name || '');
    setRemarks(p.remarks || '');
    setPaymentStatus(p.status);
    setIsModalOpen(true);
  };

  // Confirm and Execute Cancellation
  
  const handleDeletePayment = async (paymentId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this payment?')) return;
    try {
      const { error } = await supabase.from('payments').delete().eq('id', paymentId);
      if (error) throw error;
      setNotification({ type: 'success', message: 'Payment deleted permanently.' });
      fetchData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to delete payment.' });
    }
  };


  const handleCancelPayment = async () => {
    if (!cancellingPayment) return;
    try {
      const { error: cancelErr } = await supabase
        .from('payments')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', cancellingPayment.id);
      if (cancelErr) throw cancelErr;

      setNotification({ type: 'success', message: 'Payment cancelled successfully.' });
      setCancellingPayment(null);
      await fetchData();
    } catch (err: any) {
      console.error('Payment cancellation error:', err);
      setNotification({ type: 'error', message: err.message || 'Failed to cancel payment transaction.' });
    }
  };

  // Calculate live summary stats cards
  const totalReceivable = bookings
    .filter(b => b.status?.toLowerCase() === 'confirmed')
    .reduce((sum, b) => {
      const val = b.total_payable_amount !== null && b.total_payable_amount !== undefined ? b.total_payable_amount : (b.booking_amount || 0);
      return sum + val;
    }, 0);

  const totalReceived = payments
    .filter(p => p.status?.toLowerCase() === 'received' || p.status?.toLowerCase() === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalOutstanding = totalReceivable - totalReceived;

  let totalPendingSum = 0;
  let totalPartiallyPaidSum = 0;
  let totalOverdueSum = 0;

  bookings.forEach(b => {
    if (b.status?.toLowerCase() !== 'confirmed') return;

    const payable = b.total_payable_amount !== null && b.total_payable_amount !== undefined 
      ? b.total_payable_amount 
      : (b.booking_amount || 0);

    const bookingPayments = payments.filter(p => p.booking_id === b.id && p.status !== 'cancelled' && p.status !== 'refunded');
    
    const received = bookingPayments
      .filter(p => p.status?.toLowerCase() === 'received' || p.status?.toLowerCase() === 'paid')
      .reduce((sum, p) => sum + p.amount, 0);

    const outstanding = Math.max(0, payable - received);

    if (received === 0) {
      totalPendingSum += payable;
    } else if (received < payable) {
      totalPartiallyPaidSum += outstanding;
    }

    const hasOverduePayment = bookingPayments.some(p => 
      p.status?.toLowerCase() === 'pending' && 
      p.due_date && 
      new Date(p.due_date) < new Date(new Date().setHours(0,0,0,0))
    );

    if (hasOverduePayment && received < payable) {
      totalOverdueSum += outstanding;
    }
  });

  // Filter payments in-memory
  const filteredPayments = payments.filter(p => {
    const booking = bookingMap.get(p.booking_id);
    const unit = booking ? inventoryMap.get(booking.inventory_id) : null;

    // Search query matches
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchNum = p.payment_number?.toLowerCase().includes(query);
      const matchCust = booking?.customer_name?.toLowerCase().includes(query);
      const matchUnit = unit?.unit_number?.toLowerCase().includes(query);
      const matchBook = booking?.booking_number?.toLowerCase().includes(query);
      const matchRef = p.transaction_reference?.toLowerCase().includes(query);
      if (!matchNum && !matchCust && !matchUnit && !matchBook && !matchRef) return false;
    }

    // Filter selections
    if (projectFilter && booking?.project_id !== projectFilter) return false;
    if (bookingFilter && p.booking_id !== bookingFilter) return false;
    if (typeFilter && p.payment_type !== typeFilter) return false;
    if (modeFilter && p.payment_mode !== modeFilter) return false;
    if (statusFilter && getDisplayStatus(p) !== statusFilter) return false;
    if (dueDateFilter && p.due_date !== dueDateFilter) return false;
    if (receivedDateFilter && p.received_date !== receivedDateFilter) return false;

    return true;
  });

  // Referral Fee summary aggregations
  const approvedCommissions = cpCommissions.filter(c => c.status?.toLowerCase() !== 'cancelled' && c.status?.toLowerCase() !== 'pending');
  const totalApprovedCommission = approvedCommissions.reduce((sum, c) => sum + (c.payable_amount || 0), 0);
  const totalCommissionPaid = cpPayouts.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalCommissionOutstanding = approvedCommissions.reduce((sum, c) => sum + (c.pending_amount || 0), 0);
  const totalCommissionPendingApproval = cpCommissions.filter(c => c.status?.toLowerCase() === 'pending').reduce((sum, c) => sum + (c.commission_amount || 0), 0);

  // Filter referral fee payouts in-memory
  const filteredCommissionPayouts = cpPayouts.filter(p => {
    const comm = cpCommissions.find(c => c.id === p.commission_id);
    const booking = comm ? bookingMap.get(comm.booking_id) : null;
    const cp = comm ? cpMap.get(comm.cp_id) : null;

    // Search query matches
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchCust = booking?.customer_name?.toLowerCase().includes(query);
      const matchBook = booking?.booking_number?.toLowerCase().includes(query);
      const matchRef = p.reference_number?.toLowerCase().includes(query);
      const matchCp = cp?.name?.toLowerCase().includes(query);
      if (!matchCust && !matchBook && !matchRef && !matchCp) return false;
    }

    // Filter selections
    if (projectFilter && booking?.project_id !== projectFilter) return false;
    if (bookingFilter && comm?.booking_id !== bookingFilter) return false;
    if (modeFilter && p.payment_mode !== modeFilter) return false;
    if (statusFilter && comm?.status !== statusFilter) return false;

    return true;
  });

  // Exports whichever tab is currently active -- Customer Payments or
  // Referral Fee Payouts -- using the same filters already applied on screen.
  const handleExportExcel = () => {
    if (activeView === 'customer') {
      const rows = filteredPayments.map((p) => {
        const booking = bookingMap.get(p.booking_id);
        const unit = booking ? inventoryMap.get(booking.inventory_id) : null;
        return {
          'Payment #': p.payment_number || '',
          'Customer': booking?.customer_name || '',
          'Project': booking ? (projectMap.get(booking.project_id) || '') : '',
          'Unit': unit?.unit_number || '',
          'Booking #': booking?.booking_number || '',
          'Type': p.payment_type || '',
          'Amount': p.amount || 0,
          'Due Date': p.due_date || '',
          'Received Date': p.received_date || '',
          'Mode': p.payment_mode || '',
          'Status': getDisplayStatus(p),
          'Reference': p.transaction_reference || '',
        };
      });
      exportRowsToExcel('Customer_Payments', 'Customer Payments', rows);
    } else {
      const rows = filteredCommissionPayouts.map((p) => {
        const comm = cpCommissions.find(c => c.id === p.commission_id);
        const booking = comm ? bookingMap.get(comm.booking_id) : null;
        const cp = comm ? cpMap.get(comm.cp_id) : null;
        return {
          'Payout Date': p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-IN') : '',
          'Channel Partner': cp ? (cp.name || cp.company_name || '') : '',
          'Booking #': booking?.booking_number || '',
          'Project': booking ? (projectMap.get(booking.project_id) || '') : '',
          'Approved Amount': comm?.payable_amount || 0,
          'Payout Amount': p.amount || 0,
          'Mode': p.payment_mode || '',
          'Reference': p.reference_number || '',
          'Status': comm?.status || '',
        };
      });
      exportRowsToExcel('Referral_Fee_Payouts', 'Referral Fee Payouts', rows);
    }
  };

  const totalFilteredCommCount = filteredCommissionPayouts.length;
  const startCommRange = totalFilteredCommCount > 0 ? page * pageSize + 1 : 0;
  const endCommRange = Math.min((page + 1) * pageSize, totalFilteredCommCount);
  const paginatedCommissionPayouts = filteredCommissionPayouts.slice(page * pageSize, (page + 1) * pageSize);

  // Calculate paginated lists
  const totalFilteredCount = filteredPayments.length;
  const startRange = totalFilteredCount > 0 ? page * pageSize + 1 : 0;
  const endRange = Math.min((page + 1) * pageSize, totalFilteredCount);
  const paginatedPayments = filteredPayments.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="space-y-6">
      {/* Alerts notification toast */}
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

      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Payments</h2>
          <p className="text-slate-500 text-xs mt-1">Manage booking payments, installments, receipts and outstanding balances.</p>
        </div>
        <div className="flex items-center space-x-2 flex-wrap">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-semibold shadow-sm transition-all focus:outline-none disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync Data'}</span>
          </button>
          {isSuperAdmin(role) && (
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-semibold shadow-sm transition-all focus:outline-none"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export to Excel</span>
            </button>
          )}
          {activeView === 'customer' ? (
            role !== 'channel_partner' && (
              <button
                onClick={openCreateModal}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/10 hover:shadow-lg transition-all focus:outline-none"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Payment</span>
              </button>
            )
          ) : (
            canEditPayment(role) && (
              <button
                onClick={() => {
                  setSelectedCommissionId('');
                  setPayoutAmountInput('');
                  setPayoutReferenceNumber('');
                  setPayoutNotes('');
                  setPayoutDate(new Date().toISOString().split('T')[0]);
                  setPayoutError(null);
                  setIsPayoutOpen(true);
                }}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/10 hover:shadow-lg transition-all focus:outline-none"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Record Payout</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* TABS SELECTOR */}
      <div className="border-b border-slate-200 flex space-x-6 mb-6">
        <button
          onClick={() => { setActiveView('customer'); setPage(0); }}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all ${
            activeView === 'customer'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Customer Payments
        </button>
        <button
          onClick={() => { setActiveView('referral fee'); setPage(0); }}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all ${
            activeView === 'referral fee'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Referral Fee Payouts
        </button>
      </div>

      {/* SUMMARY CARDS */}
      {activeView === 'customer' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Total Receivable</span>
            <span className="block text-lg font-extrabold text-slate-950 mt-1">₹{totalReceivable.toLocaleString('en-IN')}</span>
          </div>
          <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Total Received</span>
            <span className="block text-lg font-extrabold text-emerald-600 mt-1">₹{totalReceived.toLocaleString('en-IN')}</span>
          </div>
          <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Total Outstanding</span>
            <span className="block text-lg font-extrabold text-indigo-600 mt-1">₹{totalOutstanding.toLocaleString('en-IN')}</span>
          </div>
          <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Pending</span>
            <span className="block text-lg font-extrabold text-amber-500 mt-1">₹{totalPendingSum.toLocaleString('en-IN')}</span>
          </div>
          <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Partially Paid</span>
            <span className="block text-lg font-extrabold text-blue-600 mt-1">₹{totalPartiallyPaidSum.toLocaleString('en-IN')}</span>
          </div>
          <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Overdue</span>
            <span className="block text-lg font-extrabold text-rose-600 mt-1">₹{totalOverdueSum.toLocaleString('en-IN')}</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Total Approved Referral Fee</span>
            <span className="block text-lg font-extrabold text-slate-950 mt-1">₹{totalApprovedCommission.toLocaleString('en-IN')}</span>
          </div>
          <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Total Paid</span>
            <span className="block text-lg font-extrabold text-emerald-600 mt-1">₹{totalCommissionPaid.toLocaleString('en-IN')}</span>
          </div>
          <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Total Outstanding</span>
            <span className="block text-lg font-extrabold text-indigo-600 mt-1">₹{totalCommissionOutstanding.toLocaleString('en-IN')}</span>
          </div>
          <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
            <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Pending Approval</span>
            <span className="block text-lg font-extrabold text-amber-500 mt-1">₹{totalCommissionPendingApproval.toLocaleString('en-IN')}</span>
          </div>
        </div>
      )}

      {/* SEARCH AND FILTERS */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-4 mb-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* Search bar */}
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:bg-white focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all col-span-1 md:col-span-2">
            <Search className="h-4 w-4 text-slate-400 mr-2 flex-shrink-0" />
            <input
              type="text"
              placeholder="Search by Payment #, Customer, Booking #, Reference..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              className="bg-transparent border-none text-sm w-full focus:outline-none text-slate-700 placeholder-slate-400"
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
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.project_name}</option>
              ))}
            </select>
          </div>

          {/* Booking filter */}
          <div>
            <select
              value={bookingFilter}
              onChange={(e) => { setBookingFilter(e.target.value); setPage(0); }}
              className="border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all w-full"
            >
              <option value="">All Bookings</option>
              {bookings.map(b => (
                <option key={b.id} value={b.id}>{b.booking_number} ({b.customer_name})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 pt-1 border-t border-slate-100">
          {/* Payment Type */}
          <div>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
              className="border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 text-slate-700 text-xs focus:bg-white focus:outline-none transition-all w-full"
            >
              <option value="">All Types</option>
              <option value="OCR">OCR</option>
              <option value="GST">GST</option>
              <option value="Stamp Duty Registration">Stamp Duty Registration</option>
              <option value="Development Charges">Development Charges</option>
              <option value="Maintenance Charges">Maintenance Charges</option>
              <option value="Other Charges">Other Charges</option>
            </select>
          </div>

          {/* Payment Mode */}
          <div>
            <select
              value={modeFilter}
              onChange={(e) => { setModeFilter(e.target.value); setPage(0); }}
              className="border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 text-slate-700 text-xs focus:bg-white focus:outline-none transition-all w-full"
            >
              <option value="">All Modes</option>
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
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
              className="border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 text-slate-700 text-xs focus:bg-white focus:outline-none transition-all w-full"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>

          {/* Due Date */}
          <div className="flex items-center space-x-1.5">
            <span className="text-xxs font-bold text-slate-400 uppercase flex-shrink-0">Due:</span>
            <input
              type="date"
              value={dueDateFilter}
              onChange={(e) => { setDueDateFilter(e.target.value); setPage(0); }}
              className="border border-slate-200 rounded-xl px-2 py-1 bg-slate-50 text-slate-700 text-xs focus:bg-white focus:outline-none transition-all w-full"
            />
          </div>

          {/* Received Date */}
          <div className="flex items-center space-x-1.5">
            <span className="text-xxs font-bold text-slate-400 uppercase flex-shrink-0">Recv:</span>
            <input
              type="date"
              value={receivedDateFilter}
              onChange={(e) => { setReceivedDateFilter(e.target.value); setPage(0); }}
              className="border border-slate-200 rounded-xl px-2 py-1 bg-slate-50 text-slate-700 text-xs focus:bg-white focus:outline-none transition-all w-full"
            />
          </div>
        </div>
      </div>

      {/* REFERRAL FEE OBLIGATIONS -- lets a CP request settlement once their
          first payment lands on a booking, and lets admins see who has
          requested one. Separate from the payouts table below, which only
          ever lists money already paid out. */}
      {activeView === 'referral fee' && !loading && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800">
              {role === 'channel_partner' ? 'My Referral Fee Obligations' : 'Referral Fee Obligations'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {role === 'channel_partner'
                ? 'Once the first payment lands on a booking, you can request settlement here.'
                : 'Settlement requests submitted by Channel Partners are highlighted below.'}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                  {role !== 'channel_partner' && <th className="py-2.5 px-4">Channel Partner</th>}
                  <th className="py-2.5 px-4">Booking #</th>
                  <th className="py-2.5 px-4">Project</th>
                  <th className="py-2.5 px-4">Payable Amount</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Settlement</th>
                  {role === 'channel_partner' && <th className="py-2.5 px-4 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cpCommissions.length > 0 ? (
                  cpCommissions.map((c) => {
                    const booking = bookingMap.get(c.booking_id);
                    const cp = cpMap.get(c.cp_id);
                    const cpName = cp ? (cp.name || cp.company_name || 'N/A') : 'N/A';
                    const projName = booking ? projectMap.get(booking.project_id) : 'N/A';
                    const statusLower = c.status?.toLowerCase();
                    const eligible = !!c.first_payment_received_at && !c.settlement_requested_at && statusLower === 'pending';

                    return (
                      <tr key={c.id} className={`hover:bg-slate-50/50 transition-colors ${c.settlement_requested_at && (statusLower === 'pending') ? 'bg-amber-50/40' : ''}`}>
                        {role !== 'channel_partner' && (
                          <td className="py-3 px-4 font-semibold text-slate-800 text-xs">{cpName}</td>
                        )}
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-700">{booking?.booking_number || 'N/A'}</td>
                        <td className="py-3 px-4 text-xs text-slate-600 truncate max-w-[150px]">{projName}</td>
                        <td className="py-3 px-4 font-mono text-xs font-bold text-slate-800">₹{(c.payable_amount || 0).toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xxs font-extrabold uppercase tracking-wider ${
                            statusLower === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                            statusLower === 'partially_paid' ? 'bg-blue-50 text-blue-700' :
                            statusLower === 'approved' ? 'bg-indigo-50 text-indigo-700' :
                            statusLower === 'rejected' || statusLower === 'cancelled' ? 'bg-rose-50 text-rose-700' :
                            'bg-slate-100 text-slate-500'
                          }`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {!c.first_payment_received_at ? (
                            <span className="text-xxs text-slate-400 font-medium">Awaiting first payment</span>
                          ) : c.settlement_requested_at ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xxs font-extrabold uppercase tracking-wider bg-amber-100 text-amber-800">
                              Requested {new Date(c.settlement_requested_at).toLocaleDateString('en-IN')}
                            </span>
                          ) : (
                            <span className="text-xxs text-emerald-600 font-bold uppercase tracking-wider">Eligible</span>
                          )}
                        </td>
                        {role === 'channel_partner' && (
                          <td className="py-3 px-4 text-right">
                            {eligible && (
                              <button
                                onClick={() => handleRequestSettlement(c.id)}
                                disabled={settlementRequestingId === c.id}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xxs font-bold shadow-sm transition-all focus:outline-none disabled:opacity-50"
                              >
                                {settlementRequestingId === c.id ? 'Requesting...' : 'Request Settlement'}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={role === 'channel_partner' ? 6 : 6} className="py-10 text-center text-xs text-slate-400">
                      No referral fee obligations found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TABLE */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col">
        {loading ? (
          <div className="py-24 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-100 border-t-indigo-600 mx-auto mb-4"></div>
            <p className="text-slate-500 font-medium">Loading payments directory...</p>
          </div>
        ) : activeView === 'customer' ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3.5 px-6">Payment #</th>
                    <th className="py-3.5 px-6">Customer</th>
                    <th className="py-3.5 px-6">Project Focus</th>
                    <th className="py-3.5 px-6">Unit</th>
                    <th className="py-3.5 px-6">Booking #</th>
                    <th className="py-3.5 px-6">Type</th>
                    <th className="py-3.5 px-6">Amount</th>
                    <th className="py-3.5 px-6">Due Date</th>
                    <th className="py-3.5 px-6">Received Date</th>
                    <th className="py-3.5 px-6">Mode</th>
                    <th className="py-3.5 px-6">Status</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedPayments.length > 0 ? (
                    paginatedPayments.map((p) => {
                      const booking = bookingMap.get(p.booking_id);
                      const unit = booking ? inventoryMap.get(booking.inventory_id) : null;
                      const projName = booking ? projectMap.get(booking.project_id) : 'N/A';
                      const displayStatus = getDisplayStatus(p);

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/50 transition-colors text-sm">
                          <td className="py-3.5 px-6 font-mono text-slate-600 text-xs font-semibold">{p.payment_number || '—'}</td>
                          <td className="py-3.5 px-6 text-slate-900 font-semibold">{booking?.customer_name || 'N/A'}</td>
                          <td className="py-3.5 px-6 text-slate-655 font-medium">{projName}</td>
                          <td className="py-3.5 px-6 text-slate-700 font-semibold">{unit?.unit_number || '—'}</td>
                          <td className="py-3.5 px-6 font-mono text-slate-600 text-xs">{booking?.booking_number || '—'}</td>
                          <td className="py-3.5 px-6">
                            <span className="text-slate-600 font-medium text-xs bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-lg">{p.payment_type}</span>
                          </td>
                          <td className="py-3.5 px-6 font-extrabold text-slate-950 font-mono">₹{p.amount.toLocaleString('en-IN')}</td>
                          <td className="py-3.5 px-6 text-slate-500 font-mono text-xs">{p.due_date ? new Date(p.due_date).toLocaleDateString('en-IN') : '—'}</td>
                          <td className="py-3.5 px-6 text-slate-600 font-mono text-xs">{p.received_date ? new Date(p.received_date).toLocaleDateString('en-IN') : '—'}</td>
                          <td className="py-3.5 px-6 text-slate-500 text-xs font-semibold">{p.payment_mode || '—'}</td>
                          <td className="py-3.5 px-6">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xxs font-bold uppercase tracking-wider ${
                              displayStatus === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                              displayStatus === 'overdue' ? 'bg-rose-50 text-rose-800' :
                              displayStatus === 'pending' ? 'bg-amber-50 text-amber-800' :
                              displayStatus === 'cancelled' ? 'bg-slate-100 text-slate-500' :
                              'bg-slate-50 text-slate-500'
                            }`}>
                              {displayStatus}
                            </span>
                          </td>
                          <td className="py-3.5 px-6 text-right space-x-1.5">
                            <button
                              onClick={() => setSelectedPayment(p)}
                              className="inline-flex p-1.5 text-slate-400 hover:text-indigo-650 hover:bg-slate-100 rounded-lg transition-colors focus:outline-none"
                              title="View Details"
                            >
                              <Eye className="h-4.5 w-4.5" />
                            </button>
                            {p.status?.toLowerCase() !== 'cancelled' && p.status?.toLowerCase() !== 'refunded' && (
                              <>
                                {canEditPayment(role) && (
                                  <button
                                    onClick={() => openEditModal(p)}
                                    className="inline-flex p-1.5 text-slate-400 hover:text-amber-600 hover:bg-slate-100 rounded-lg transition-colors focus:outline-none"
                                    title="Edit"
                                  >
                                    <Edit className="h-4.5 w-4.5" />
                                  </button>
                                )}
                                {canCancelPayment(role) && (
                                  <button
                                    onClick={() => setCancellingPayment(p)}
                                    className="inline-flex p-1.5 text-slate-400 hover:text-amber-600 hover:bg-slate-100 rounded-lg transition-colors focus:outline-none"
                                    title="Cancel Transaction (keeps the record, marks it cancelled)"
                                  >
                                    <Ban className="h-4.5 w-4.5" />
                                  </button>
                                )}
                              </>
                            )}
                            {isSuperAdmin(role) && (
                              <button
                                onClick={() => handleDeletePayment(p.id)}
                                className="inline-flex p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors focus:outline-none"
                                title="Delete Payment Permanently"
                              >
                                <Trash2 className="h-4.5 w-4.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={12} className="py-16 text-center">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <div className="bg-slate-50 p-3 rounded-full border border-slate-100">
                            <Search className="h-6 w-6 text-slate-400" />
                          </div>
                          <p className="text-slate-500 font-semibold text-sm">No Payment Records Found</p>
                          <p className="text-xs max-w-sm text-slate-400">
                            Create a new payment or adjust filters. Only valid bookings recorded in the system support child payments.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            {totalFilteredCount > 0 && (
              <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">
                  Showing <span className="font-semibold text-slate-800">{startRange}</span> to{' '}
                  <span className="font-semibold text-slate-800">{endRange}</span> of{' '}
                  <span className="font-semibold text-slate-800">{totalFilteredCount}</span> transactions
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
                    Page {page + 1} of {Math.ceil(totalFilteredCount / pageSize)}
                  </span>
                  <button
                    onClick={() => setPage(prev => prev + 1)}
                    disabled={(page + 1) * pageSize >= totalFilteredCount}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus:outline-none disabled:opacity-50"
                  >
                    <ChevronRight className="h-4.5 w-4.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3.5 px-6">Payout Date</th>
                    <th className="py-3.5 px-6">Channel Partner</th>
                    <th className="py-3.5 px-6">Booking #</th>
                    <th className="py-3.5 px-6">Project Focus</th>
                    <th className="py-3.5 px-6">Unit</th>
                    <th className="py-3.5 px-6">Approved Amount</th>
                    <th className="py-3.5 px-6">Payout Amount</th>
                    <th className="py-3.5 px-6">Mode</th>
                    <th className="py-3.5 px-6">Reference Number</th>
                    <th className="py-3.5 px-6">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedCommissionPayouts.length > 0 ? (
                    paginatedCommissionPayouts.map((p) => {
                      const comm = cpCommissions.find(c => c.id === p.commission_id);
                      const booking = comm ? bookingMap.get(comm.booking_id) : null;
                      const cp = comm ? cpMap.get(comm.cp_id) : null;
                      const cpName = cp ? `${cp.name || cp.company_name || ''}${cp.name && cp.company_name ? ` (${cp.company_name})` : ''}` : 'N/A';
                      const cpCode = cp ? `(${cp.partner_code || cp.cp_code || '—'})` : '';
                      const projName = booking ? projectMap.get(booking.project_id) : 'N/A';
                      const unitNumber = booking ? inventoryMap.get(booking.inventory_id)?.unit_number : '—';

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/50 transition-colors text-sm">
                          <td className="py-3.5 px-6 text-slate-655 font-mono text-xs">{new Date(p.payment_date).toLocaleDateString('en-IN')}</td>
                          <td className="py-3.5 px-6 text-slate-900 font-semibold">
                            {cpName} <span className="text-slate-400 text-xxs block">{cpCode}</span>
                          </td>
                          <td className="py-3.5 px-6 text-slate-705 font-mono text-xs font-semibold">{booking?.booking_number || 'N/A'}</td>
                          <td className="py-3.5 px-6 text-slate-650 truncate max-w-[150px]">{projName}</td>
                          <td className="py-3.5 px-6 text-slate-700 font-medium">{unitNumber}</td>
                          <td className="py-3.5 px-6 text-slate-550 font-mono">₹{comm?.payable_amount?.toLocaleString('en-IN') || '—'}</td>
                          <td className="py-3.5 px-6 text-emerald-600 font-bold font-mono">₹{(p.amount || 0).toLocaleString('en-IN')}</td>
                          <td className="py-3.5 px-6 text-slate-600 text-xs font-semibold">{p.payment_mode || '—'}</td>
                          <td className="py-3.5 px-6 text-slate-500 font-mono text-xs truncate max-w-[120px]" title={p.reference_number || ''}>
                            {p.reference_number || '—'}
                          </td>
                          <td className="py-3.5 px-6">
                            {(() => {
                              const statusLower = comm?.status?.toLowerCase();
                              return (
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xxs font-extrabold uppercase tracking-wider ${
                                  statusLower === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                                  statusLower === 'partially_paid' ? 'bg-blue-50 text-blue-700' :
                                  statusLower === 'approved' ? 'bg-indigo-50 text-indigo-700' :
                                  'bg-slate-100 text-slate-500'
                                }`}>
                                  {comm?.status}
                                </span>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={10} className="py-16 text-center">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <IndianRupee className="h-8 w-8 text-slate-300" />
                          <p className="text-slate-500 font-semibold text-sm">No Referral Fee Payouts Found</p>
                          <p className="text-xs max-w-sm text-slate-400">
                            Log a referral fee payout or adjust filters. Payouts must reference approved referral fee obligations.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination controls for referral fee payouts */}
            {totalFilteredCommCount > 0 && (
              <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">
                  Showing <span className="font-semibold text-slate-800">{startCommRange}</span> to{' '}
                  <span className="font-semibold text-slate-800">{endCommRange}</span> of{' '}
                  <span className="font-semibold text-slate-800">{totalFilteredCommCount}</span> payouts
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
                    Page {page + 1} of {Math.ceil(totalFilteredCommCount / pageSize)}
                  </span>
                  <button
                    onClick={() => setPage(prev => prev + 1)}
                    disabled={(page + 1) * pageSize >= totalFilteredCommCount}
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

      {/* CREATE & EDIT PAYMENT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">{editingPayment ? 'Edit Payment Record' : 'Create New Payment'}</span>
              <button type="button" onClick={() => setIsModalOpen(false)} className="p-1 rounded-lg text-indigo-200 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleFormSubmit}>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {formError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl flex items-start space-x-2.5">
                    <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-semibold leading-tight">{formError}</span>
                  </div>
                )}

                {/* Booking Select */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Select Booking *</label>
                  <select
                    required
                    disabled={!!editingPayment}
                    value={selectedBookingId}
                    onChange={(e) => setSelectedBookingId(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="">Choose Booking...</option>
                    {bookings.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.customer_name} — {projectMap.get(b.project_id) || 'N/A'} — {b.booking_number}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Derived financial read-only panel */}
                {selectedBooking && (
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3 text-xs text-slate-700">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="block font-bold text-slate-400 uppercase tracking-wide">Customer</span>
                        <span className="font-semibold text-slate-800">{selectedBooking.customer_name}</span>
                      </div>
                      <div>
                        <span className="block font-bold text-slate-400 uppercase tracking-wide">Project / Unit</span>
                        <span className="font-semibold text-slate-800">
                          {projectMap.get(selectedBooking.project_id) || 'N/A'} — Unit {inventoryMap.get(selectedBooking.inventory_id)?.unit_number || 'N/A'}
                        </span>
                      </div>
                    </div>
                    
                    {/* Financial Summary */}
                    <div className="pt-2.5 border-t border-slate-200/50 space-y-1.5">
                      {(() => {
                        const consideration = selectedBooking.consideration_amount !== null && selectedBooking.consideration_amount !== undefined ? selectedBooking.consideration_amount : (selectedBooking.booking_amount || 0);
                        const addCharges = selectedBooking.total_additional_charges !== null && selectedBooking.total_additional_charges !== undefined ? selectedBooking.total_additional_charges : 0;
                        return (
                          <>
                            <div className="flex justify-between">
                              <span className="text-slate-500 font-medium">Total Consideration (Base):</span>
                              <span className="font-semibold text-slate-800">₹{consideration.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500 font-medium">Additional Charges:</span>
                              <span className="font-semibold text-slate-800">₹{addCharges.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between border-t border-slate-200/40 pt-1">
                              <span className="text-slate-605 font-bold">Total Payable:</span>
                              <span className="font-bold text-slate-800">₹{selectedBookingTotalVal.toLocaleString('en-IN')}</span>
                            </div>
                          </>
                        );
                      })()}
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Total Received:</span>
                        <span className="font-semibold text-emerald-600">₹{totalPaidForSelected.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-200/40 pt-1.5">
                        <span className="text-slate-750 font-bold">Outstanding Before Payment:</span>
                        <span className="font-bold text-indigo-700">₹{outstandingForSelected.toLocaleString('en-IN')}</span>
                      </div>
                      {amountInput && parseFloat(amountInput) > 0 && (
                        <div className="flex justify-between border-t border-dashed border-slate-200 pt-1.5 animate-in fade-in duration-100">
                          <span className="text-slate-750 font-bold">Outstanding After Payment:</span>
                          <span className="font-extrabold text-indigo-700 text-sm">
                            ₹{Math.max(0, outstandingForSelected - (parseFloat(amountInput) || 0)).toLocaleString('en-IN')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {/* Payment Type */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Payment Type *</label>
                    <select
                      value={paymentType}
                      onChange={(e) => setPaymentType(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      <option value="OCR">OCR</option>
                      <option value="GST">GST</option>
                      <option value="Stamp Duty Registration">Stamp Duty Registration</option>
                      <option value="Development Charges">Development Charges</option>
                      <option value="Maintenance Charges">Maintenance Charges</option>
                      <option value="Other Charges">Other Charges</option>
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
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-850 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Due Date */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Due Date</label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    />
                  </div>

                  {/* Received Date */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Received Date</label>
                    <input
                      type="date"
                      value={receivedDate}
                      onChange={(e) => setReceivedDate(e.target.value)}
                      disabled={paymentStatus !== 'paid'}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Payment Mode */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Payment Mode</label>
                    <select
                      value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value)}
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
                      value={paymentStatus}
                      onChange={(e) => {
                        setPaymentStatus(e.target.value);
                        if (e.target.value !== 'paid') setReceivedDate('');
                      }}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      <option value="paid">Paid</option>
                      <option value="pending">Pending</option>
                      <option value="partially_paid">Partially Paid</option>
                      {editingPayment && <option value="refunded">Refunded</option>}
                      {editingPayment && <option value="cancelled">Cancelled</option>}
                    </select>
                  </div>
                </div>

                {/* Additional payment mode specific details */}
                {paymentMode === 'Cheque' && (
                  <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-150">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Cheque Number *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 102456"
                        value={chequeNumber}
                        onChange={(e) => setChequeNumber(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-805 text-sm focus:bg-white focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Bank Name</label>
                      <input
                        type="text"
                        placeholder="e.g. HDFC Bank"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-805 text-sm focus:bg-white focus:outline-none transition-all"
                      />
                    </div>
                  </div>
                )}

                {['NEFT', 'RTGS', 'IMPS', 'Bank Transfer', 'UPI', 'Card', 'Other'].includes(paymentMode) && (
                  <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-150">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Transaction Reference</label>
                      <input
                        type="text"
                        placeholder="e.g. TXN10009238"
                        value={transactionReference}
                        onChange={(e) => setTransactionReference(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-805 text-sm focus:bg-white focus:outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Bank Name</label>
                      <input
                        type="text"
                        placeholder="e.g. ICICI Bank"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-805 text-sm focus:bg-white focus:outline-none transition-all"
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
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/10 hover:shadow-lg disabled:opacity-50 transition-all focus:outline-none"
                >
                  {formLoading ? 'Saving...' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW PAYMENT DETAILS MODAL */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedPayment(null)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">Payment Details Summary</span>
              <button onClick={() => setSelectedPayment(null)} className="p-1 rounded-lg text-slate-400 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 text-sm text-slate-700">
              {(() => {
                const booking = bookingMap.get(selectedPayment.booking_id);
                const unit = booking ? inventoryMap.get(booking.inventory_id) : null;
                const displayStatus = getDisplayStatus(selectedPayment);
                return (
                  <div className="space-y-3">
                    <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                      <div>
                        <span className="block font-bold text-slate-400 text-xxs uppercase tracking-wider">Payment ID #</span>
                        <span className="font-extrabold text-slate-900">{selectedPayment.payment_number || 'N/A'}</span>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xxs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700">
                        {displayStatus}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div>
                        <span className="block font-bold text-slate-400 text-xxs uppercase tracking-wider">Customer / Client</span>
                        <span className="font-semibold text-slate-800">{booking?.customer_name || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="block font-bold text-slate-400 text-xxs uppercase tracking-wider">Project / Tower</span>
                        <span className="font-semibold text-slate-800">
                          {projectMap.get(booking?.project_id || '') || 'N/A'} — {towerMap.get(unit?.tower_id || '') || 'N/A'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-50">
                      <div>
                        <span className="block font-bold text-slate-400 text-xxs uppercase tracking-wider">Unit / Flat</span>
                        <span className="font-semibold text-slate-850">Unit {unit?.unit_number || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="block font-bold text-slate-400 text-xxs uppercase tracking-wider">Booking Serial</span>
                        <span className="font-semibold text-slate-800">{booking?.booking_number || 'N/A'}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-50">
                      <div>
                        <span className="block font-bold text-slate-400 text-xxs uppercase tracking-wider">Payment Type</span>
                        <span className="font-semibold text-slate-800">{selectedPayment.payment_type}</span>
                      </div>
                      <div>
                        <span className="block font-bold text-slate-400 text-xxs uppercase tracking-wider">Transaction Amount</span>
                        <span className="font-extrabold text-indigo-700">₹{(selectedPayment.amount || 0).toLocaleString('en-IN')}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-50">
                      <div>
                        <span className="block font-bold text-slate-400 text-xxs uppercase tracking-wider">Due Date</span>
                        <span className="font-semibold text-slate-800">{selectedPayment.due_date ? new Date(selectedPayment.due_date).toLocaleDateString('en-IN') : '—'}</span>
                      </div>
                      <div>
                        <span className="block font-bold text-slate-400 text-xxs uppercase tracking-wider">Received Date</span>
                        <span className="font-semibold text-slate-850">{selectedPayment.received_date ? new Date(selectedPayment.received_date).toLocaleDateString('en-IN') : '—'}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-50">
                      <div>
                        <span className="block font-bold text-slate-400 text-xxs uppercase tracking-wider">Payment Mode</span>
                        <span className="font-semibold text-slate-800">{selectedPayment.payment_mode || '—'}</span>
                      </div>
                      <div>
                        <span className="block font-bold text-slate-400 text-xxs uppercase tracking-wider">Transaction reference</span>
                        <span className="font-semibold text-slate-800 font-mono text-xs">{selectedPayment.transaction_reference || '—'}</span>
                      </div>
                    </div>

                    {(selectedPayment.cheque_number || selectedPayment.bank_name) && (
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-50">
                        {selectedPayment.cheque_number && (
                          <div>
                            <span className="block font-bold text-slate-400 text-xxs uppercase tracking-wider">Cheque Number</span>
                            <span className="font-semibold text-slate-800">{selectedPayment.cheque_number}</span>
                          </div>
                        )}
                        {selectedPayment.bank_name && (
                          <div>
                            <span className="block font-bold text-slate-400 text-xxs uppercase tracking-wider">Bank Name</span>
                            <span className="font-semibold text-slate-800">{selectedPayment.bank_name}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="border-t border-slate-100 pt-3 mt-3">
                      <span className="block font-bold text-slate-400 text-xxs uppercase tracking-wider mb-1">Remarks / Remarks log</span>
                      <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg text-xs text-slate-600 max-h-[80px] overflow-y-auto">
                        {selectedPayment.remarks || 'No remarks recorded.'}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-100">
              <button
                onClick={() => setSelectedPayment(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition-all focus:outline-none"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT RECEIPT MODAL */}
      {receiptPayment && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setReceiptPayment(null)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Stylesheet specifically injected for printing */}
            <style>{`
              @media print {
                body > * {
                  display: none !important;
                }
                #printable-receipt-modal, #printable-receipt-modal * {
                  display: block !important;
                  visibility: visible !important;
                }
                #printable-receipt-modal {
                  position: absolute;
                  left: 0;
                  top: 0;
                  width: 100%;
                  background: white;
                  color: black;
                  padding: 32px;
                  border: none !important;
                  box-shadow: none !important;
                }
                .no-print {
                  display: none !important;
                }
              }
            `}</style>
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between no-print">
              <span className="font-bold tracking-tight flex items-center space-x-1.5">
                <Printer className="h-4.5 w-4.5 text-indigo-400" />
                <span>Tax Receipt Generation</span>
              </span>
              <button onClick={() => setReceiptPayment(null)} className="p-1 rounded-lg text-slate-400 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Printable Receipt Content */}
            <div id="printable-receipt-modal" className="p-8 space-y-6 bg-white">
              {(() => {
                const booking = bookingMap.get(receiptPayment.booking_id);
                const unit = booking ? inventoryMap.get(booking.inventory_id) : null;
                const projName = booking ? projectMap.get(booking.project_id) : 'N/A';
                const towerName = unit ? towerMap.get(unit.tower_id) : 'N/A';

                return (
                  <div className="border border-slate-300 p-6 rounded-2xl space-y-6">
                    <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                      <div className="flex items-center gap-2.5">
                        <img src="/logo-icon.png" alt="Opal Properties" className="h-8 w-8 object-contain" />
                        <div>
                          <h3 className="text-xl font-bold text-slate-955 uppercase tracking-wide">Opal Properties</h3>
                          <p className="text-xxs text-slate-500 font-semibold uppercase mt-0.5">Real Estate Operations Client Receipt</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="inline-block px-3 py-1 bg-slate-900 text-white font-bold text-xxs tracking-wider uppercase rounded-md mb-2">OFFICIAL RECEIPT</span>
                        <p className="text-xs text-slate-500">Receipt No: <span className="font-bold text-slate-800">{receiptPayment.payment_number || 'Pending'}</span></p>
                        <p className="text-xs text-slate-500">Date: <span className="font-bold text-slate-800">{receiptPayment.received_date ? new Date(receiptPayment.received_date).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN')}</span></p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="space-y-1 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                        <span className="block font-bold text-slate-400 uppercase tracking-wider text-xxs">Customer Details</span>
                        <p className="font-extrabold text-sm text-slate-800">{booking?.customer_name || 'N/A'}</p>
                        <p className="text-slate-500 font-medium mt-1">Booking Serial: <span className="text-slate-700 font-semibold">{booking?.booking_number || 'N/A'}</span></p>
                      </div>
                      <div className="space-y-1 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                        <span className="block font-bold text-slate-400 uppercase tracking-wider text-xxs">Property Details</span>
                        <p className="font-extrabold text-sm text-slate-800">{projName}</p>
                        <p className="text-slate-500 font-medium mt-1">
                          {towerName} — Unit {unit?.unit_number || 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden mt-4">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-600 font-bold uppercase border-b border-slate-200">
                            <th className="py-2.5 px-4">Transaction / Type</th>
                            <th className="py-2.5 px-4">Payment Mode</th>
                            <th className="py-2.5 px-4">Reference Key / Cheque</th>
                            <th className="py-2.5 px-4 text-right">Amount Received</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-slate-100 text-slate-700 font-medium">
                            <td className="py-3 px-4">{receiptPayment.payment_type} Payment</td>
                            <td className="py-3 px-4">{receiptPayment.payment_mode || 'Cash'}</td>
                            <td className="py-3 px-4 font-mono text-xxs">
                              {receiptPayment.payment_mode === 'Cheque' ? `Chq: ${receiptPayment.cheque_number || '—'}` : (receiptPayment.transaction_reference || '—')}
                            </td>
                            <td className="py-3 px-4 text-right font-extrabold text-slate-900">₹{(receiptPayment.amount || 0).toLocaleString('en-IN')}</td>
                          </tr>
                          <tr className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                            <td colSpan={3} className="py-3 px-4 text-right uppercase tracking-wider text-xxs text-slate-400 font-bold">Total Settled:</td>
                            <td className="py-3 px-4 text-right text-sm font-extrabold text-indigo-700">₹{(receiptPayment.amount || 0).toLocaleString('en-IN')}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xxs pt-4 border-t border-slate-200">
                      <div>
                        <span className="block font-bold text-slate-400 uppercase tracking-wider">Remarks / Terms</span>
                        <p className="text-slate-500 leading-normal mt-1">{receiptPayment.remarks || 'Receipt generated successfully. All subjects to cheque clearance.'}</p>
                      </div>
                      <div className="text-right flex flex-col justify-end items-end space-y-1">
                        <div className="w-32 h-10 border-b border-slate-300"></div>
                        <span className="block font-bold text-slate-400 uppercase tracking-wider">Authorized Officer Signature</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer buttons */}
            <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-2 border-t border-slate-100 no-print">
              <button
                onClick={() => setReceiptPayment(null)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors focus:outline-none"
              >
                Close Receipt
              </button>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/10 hover:shadow-lg transition-all focus:outline-none"
              >
                <Printer className="h-4 w-4" />
                <span>Print Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM CANCELLATION MODAL */}
      {cancellingPayment && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setCancellingPayment(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-rose-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">Confirm Payment Cancellation</span>
              <button onClick={() => setCancellingPayment(null)} className="p-1 rounded-lg text-rose-200 hover:text-white focus:outline-none">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Are you sure you want to cancel this payment transaction? This action is permanent and will revert the booking's total collected payments and outstanding balance.
              </p>
              
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs text-slate-700">
                <div className="flex justify-between font-medium">
                  <span className="text-slate-400">Payment Number:</span>
                  <span className="font-bold text-slate-800">{cancellingPayment.payment_number || 'N/A'}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-slate-400">Transaction Amount:</span>
                  <span className="font-extrabold text-slate-950">₹{(cancellingPayment.amount || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-slate-400">Payment Type:</span>
                  <span className="font-semibold text-slate-800">{cancellingPayment.payment_type}</span>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-2 border-t border-slate-100">
              <button
                onClick={() => setCancellingPayment(null)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-100 transition-all"
              >
                No, Keep Payment
              </button>
              <button
                onClick={handleCancelPayment}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
              >
                Yes, Cancel Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECORD COMMISSION PAYOUT MODAL */}
      {isPayoutOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsPayoutOpen(false)} />
          
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-left">
            <div className="bg-emerald-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">Record Referral Fee Payout</span>
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
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Approved Referral Fee Obligation *</label>
                  <select
                    required
                    value={selectedCommissionId}
                    onChange={(e) => handlePayoutCommissionChange(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                  >
                    <option value="">Select referral fee obligation...</option>
                    {cpCommissions
                      .filter(c => {
                        const statusLower = c.status?.toLowerCase();
                        return (statusLower === 'approved' || statusLower === 'partially_paid') && c.pending_amount > 0;
                      })
                      .map(c => {
                        const booking = bookingMap.get(c.booking_id);
                        const cp = cpMap.get(c.cp_id);
                        const partnerLabel = cp ? (cp.company_name || cp.name || 'CP') : 'CP';
                        return (
                          <option key={c.id} value={c.id}>
                            {booking?.booking_number || 'N/A'} — {partnerLabel} (Outstanding: ₹{(c.pending_amount || 0).toLocaleString('en-IN')})
                          </option>
                        );
                      })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Disbursed Payout Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="Payout Amount"
                    value={payoutAmountInput}
                    onChange={(e) => setPayoutAmountInput(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                  />
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
                      value={payoutPaymentMode}
                      onChange={(e) => setPayoutPaymentMode(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                    >
                      <option value="BANK_TRANSFER">Bank Transfer (NEFT/RTGS/IMPS)</option>
                      <option value="CHEQUE">Cheque</option>
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Reference Number / Transaction ID</label>
                  <input
                    type="text"
                    placeholder="e.g. TXN987654321"
                    value={payoutReferenceNumber}
                    onChange={(e) => setPayoutReferenceNumber(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Notes / Remarks</label>
                  <textarea
                    placeholder="Disbursement details, account transfer confirmation..."
                    rows={2}
                    value={payoutNotes}
                    onChange={(e) => setPayoutNotes(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm focus:bg-white focus:outline-none transition-all resize-none"
                  />
                </div>
              </div>

              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-2 border-t border-slate-100 rounded-b-2xl">
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
                  {payoutLoading ? 'Logging...' : 'Record Payout'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default Payments;
