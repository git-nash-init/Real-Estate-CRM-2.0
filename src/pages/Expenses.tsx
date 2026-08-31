import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { reportQueryError } from '../services/queryLogger';
import { useAuth } from '../hooks/useAuth';
import {
  Wallet,
  Plus,
  X,
  RefreshCw,
  Pencil,
  Trash2,
  ShieldAlert,
  Search,
  ReceiptText,
  Calendar,
} from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { resolveDateRange, presetOptions, type DateRangePreset } from '../services/dateRangePresets';

interface Expense {
  id: string;
  user_id: string;
  expense_date: string;
  category: string | null;
  vendor: string | null;
  description: string | null;
  receipt_amount: number;
  received_amount: number;
  actual_amount: number;
  payment_mode: string | null;
  notes: string | null;
  created_at: string;
}

const emptyForm = {
  expense_date: new Date().toISOString().slice(0, 10),
  category: '',
  vendor: '',
  description: '',
  receipt_amount: '',
  received_amount: '',
  actual_amount: '',
  payment_mode: '',
  notes: '',
};

const categoryOptions = ['Travel', 'Office Supplies', 'Client Entertainment', 'Utilities', 'Marketing', 'Maintenance', 'Miscellaneous'];
const paymentModeOptions = ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque'];

const formatCurrency = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const DateRangeFilter: React.FC<{
  preset: DateRangePreset;
  onPresetChange: (p: DateRangePreset) => void;
  customStart: string;
  customEnd: string;
  onCustomChange: (start: string, end: string) => void;
}> = ({ preset, onPresetChange, customStart, customEnd, onCustomChange }) => (
  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
    <div className="flex items-center gap-2 mb-3 text-slate-700">
      <Calendar className="h-4 w-4 text-indigo-600" />
      <span className="text-xs font-bold uppercase tracking-wider">Time Frame Filter</span>
    </div>
    <div className="flex flex-wrap gap-2">
      {presetOptions.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onPresetChange(opt.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors \${
            preset === opt.value
              ? 'bg-indigo-600 border-indigo-600 text-white'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
    {preset === 'custom' && (
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <input
          type="date"
          value={customStart}
          onChange={(e) => onCustomChange(e.target.value, customEnd)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <span className="text-xs text-slate-400">to</span>
        <input
          type="date"
          value={customEnd}
          onChange={(e) => onCustomChange(customStart, e.target.value)}
          min={customStart || undefined}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        {(!customStart || !customEnd) && (
          <span className="text-xs text-amber-600">Pick both dates to apply.</span>
        )}
      </div>
    )}
  </div>
);

export const Expenses: React.FC = () => {
  const { role, profile } = useAuth();
  const isSuperAdmin = role === 'super_admin';
  const isBlockedUser = profile?.email === 'anilhiwale17@gmail.com';

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [preset, setPreset] = useState<DateRangePreset>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const range = useMemo(() => resolveDateRange(preset, customStart, customEnd), [preset, customStart, customEnd]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'expense' | 'received'>('expense');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);

  const fetchExpenses = useCallback(async () => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('personal_expenses')
      .select('*')
      .gte('expense_date', range.startISO)
      .lt('expense_date', range.endISO)
      .order('expense_date', { ascending: false });
    if (error) reportQueryError('Expenses: list', error);
    else setExpenses(data || []);
    setLoading(false);
    setSyncing(false);
  }, [isSuperAdmin, range]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  useEffect(() => {
    if (notification) {
      const t = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(t);
    }
  }, [notification]);

  const handleSync = async () => {
    setSyncing(true);
    await fetchExpenses();
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormError(null);
  };

  const openCreate = (mode: 'expense' | 'received') => {
    resetForm();
    setFormMode(mode);
    setIsFormOpen(true);
  };

  const openEdit = (exp: Expense) => {
    setEditingId(exp.id);
    setFormMode((exp.received_amount || 0) > 0 && (exp.actual_amount || 0) === 0 ? 'received' : 'expense');
    setForm({
      expense_date: exp.expense_date,
      category: exp.category || '',
      vendor: exp.vendor || '',
      description: exp.description || '',
      receipt_amount: String(exp.receipt_amount ?? ''),
      received_amount: String(exp.received_amount ?? ''),
      actual_amount: String(exp.actual_amount ?? ''),
      payment_mode: exp.payment_mode || '',
      notes: exp.notes || '',
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!form.expense_date) {
      setFormError('Date is required.');
      return;
    }
    if (formMode === 'expense' && form.actual_amount === '') {
      setFormError('Spent amount is required.');
      return;
    }
    if (formMode === 'received' && form.received_amount === '') {
      setFormError('Received amount is required.');
      return;
    }

    const receiptAmount = Number(form.receipt_amount) || 0;
    const actualAmount = Number(form.actual_amount) || 0;
    const receivedAmount = Number(form.received_amount) || 0;

    if (receiptAmount < 0 || actualAmount < 0 || receivedAmount < 0) {
      setFormError('Amounts must be valid non-negative numbers.');
      return;
    }

    setFormLoading(true);
    const payload = {
      expense_date: form.expense_date,
      category: form.category || null,
      vendor: form.vendor || null,
      description: form.description || null,
      receipt_amount: receiptAmount,
      received_amount: receivedAmount,
      actual_amount: actualAmount,
      payment_mode: form.payment_mode || null,
      notes: form.notes || null,
    };

    try {
      if (editingId) {
        const { error } = await supabase.from('personal_expenses').update(payload).eq('id', editingId);
        if (error) throw error;
        setNotification({ type: 'success', message: 'Expense updated.' });
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        const { error } = await supabase.from('personal_expenses').insert([{ ...payload, user_id: session?.user?.id }]);
        if (error) throw error;
        setNotification({ type: 'success', message: 'Expense logged.' });
      }
      setIsFormOpen(false);
      resetForm();
      fetchExpenses();
    } catch (err: any) {
      reportQueryError('Expenses: save', err);
      setFormError(err.message || 'Failed to save expense.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingExpense) return;
    const { error } = await supabase.from('personal_expenses').delete().eq('id', deletingExpense.id);
    if (error) {
      reportQueryError('Expenses: delete', error);
      setNotification({ type: 'error', message: error.message });
    } else {
      setNotification({ type: 'success', message: 'Expense deleted.' });
      setExpenses((prev) => prev.filter((e) => e.id !== deletingExpense.id));
    }
    setDeletingExpense(null);
  };

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return expenses;
    return expenses.filter((e) =>
      (e.vendor || '').toLowerCase().includes(term) ||
      (e.category || '').toLowerCase().includes(term) ||
      (e.description || '').toLowerCase().includes(term)
    );
  }, [expenses, searchTerm]);

  const totals = useMemo(() => {
    const received = filtered.reduce((s, e) => s + (e.received_amount || 0), 0);
    const receipt = filtered.reduce((s, e) => s + (e.receipt_amount || 0), 0);
    const actual = filtered.reduce((s, e) => s + (e.actual_amount || 0), 0);
    return { received, receipt, actual, delta: received - actual };
  }, [filtered]);

  if (isBlockedUser) {
    return <Navigate to="/" replace />;
  }

  if (!isSuperAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-10 flex flex-col items-center justify-center text-center min-h-[300px]">
        <ShieldAlert className="h-10 w-10 text-amber-500 mb-3" />
        <h3 className="text-lg font-bold text-slate-800">Super Admin Only</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">This is a personal expense ledger, restricted to the Super Admin account.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium \${notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
          {notification.message}
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Wallet className="h-6 w-6 text-indigo-600" /> Personal Expenses
          </h2>
          <p className="text-slate-500 text-xs mt-1">Private ledger — visible only to your account. Nobody else, including other admins, can see these entries.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 \${syncing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => openCreate('received')}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-sm"
          >
            <Plus className="h-4 w-4" /> Log Received
          </button>
          <button
            onClick={() => openCreate('expense')}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm"
          >
            <Plus className="h-4 w-4" /> Log Expense
          </button>
        </div>
      </div>

      <DateRangeFilter
        preset={preset}
        onPresetChange={setPreset}
        customStart={customStart}
        customEnd={customEnd}
        onCustomChange={(start, end) => { setCustomStart(start); setCustomEnd(end); }}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Total Received</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(totals.received)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Total Billed</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(totals.receipt)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Total Spent</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(totals.actual)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Balance (Received − Spent)</p>
          <p className={`text-2xl font-bold mt-1 \${totals.delta > 0 ? 'text-emerald-600' : totals.delta < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {totals.delta >= 0 ? '+' : ''}{formatCurrency(totals.delta)}
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by vendor, category, description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-5 w-5 text-indigo-600 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <ReceiptText className="h-10 w-10 mb-2" />
            <p className="text-sm">No entries match your search/filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Date</th>
                  <th className="text-left px-4 py-3 font-semibold">Category</th>
                  <th className="text-left px-4 py-3 font-semibold">Vendor / Bill</th>
                  <th className="text-right px-4 py-3 font-semibold">Received</th>
                  <th className="text-right px-4 py-3 font-semibold">Billed</th>
                  <th className="text-right px-4 py-3 font-semibold">Spent</th>
                  <th className="text-right px-4 py-3 font-semibold">Difference</th>
                  <th className="text-left px-4 py-3 font-semibold">Mode</th>
                  <th className="text-right px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((exp) => {
                  const delta = (exp.received_amount || 0) - (exp.actual_amount || 0);
                  return (
                    <tr key={exp.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700">{new Date(exp.expense_date).toLocaleDateString('en-IN')}</td>
                      <td className="px-4 py-3 text-slate-700">{exp.category || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="font-medium">{exp.vendor || '-'}</div>
                        {exp.description && <div className="text-xs text-slate-400">{exp.description}</div>}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(exp.received_amount)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(exp.receipt_amount)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(exp.actual_amount)}</td>
                      <td className={`px-4 py-3 text-right font-semibold \${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                        {delta >= 0 ? '+' : ''}{formatCurrency(delta)}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{exp.payment_mode || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(exp)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => setDeletingExpense(exp)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsFormOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">{editingId ? 'Edit Entry' : formMode === 'received' ? 'Log Received' : 'Log Expense'}</h3>
              <button onClick={() => setIsFormOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {formError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">{formError}</div>
              )}
              <div className={`grid gap-4 ${formMode === 'received' ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Date *</label>
                  <input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                {formMode !== 'received' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Category</label>
                    <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500">
                      <option value="">Select category</option>
                      {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Vendor / Bill Reference</label>
                <input type="text" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              
              {formMode === 'received' ? (
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Received Amount (₹) *</label>
                    <input type="number" min="0" step="0.01" value={form.received_amount} onChange={(e) => setForm({ ...form, received_amount: e.target.value, actual_amount: '0', receipt_amount: '0' })} required
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                    <p className="text-[10px] text-slate-400 mt-1">Money received.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Billed Amount (₹)</label>
                    <input type="number" min="0" step="0.01" value={form.receipt_amount} onChange={(e) => setForm({ ...form, receipt_amount: e.target.value, received_amount: '0' })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                    <p className="text-[10px] text-slate-400 mt-1">Amount shown on the bill (optional).</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Spent Amount (₹) *</label>
                    <input type="number" min="0" step="0.01" value={form.actual_amount} onChange={(e) => setForm({ ...form, actual_amount: e.target.value, received_amount: '0' })} required
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                    <p className="text-[10px] text-slate-400 mt-1">Paid out of pocket.</p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Payment Mode</label>
                <select value={form.payment_mode} onChange={(e) => setForm({ ...form, payment_mode: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500">
                  <option value="">Select mode</option>
                  {paymentModeOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Description</label>
                <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsFormOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">
                  Cancel
                </button>
                <button type="submit" disabled={formLoading} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                  {formLoading ? 'Saving...' : editingId ? 'Save Changes' : formMode === 'received' ? 'Log Received' : 'Log Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deletingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setDeletingExpense(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Delete Entry</h3>
            <p className="text-sm text-slate-500 mb-6">Are you sure you want to delete this entry? This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeletingExpense(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancel
              </button>
              <button onClick={handleDelete} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-semibold">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
