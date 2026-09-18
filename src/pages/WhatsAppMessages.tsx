import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { reportQueryError } from '../services/queryLogger';
import { exportRowsToExcel } from '../utils/exportExcel';
import {
  MessageSquare,
  RefreshCw,
  Search,
  Download,
  Paperclip,
  AlertCircle,
} from 'lucide-react';

interface OutboxRow {
  id: string;
  to_phone: string;
  message: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  created_by: string | null;
  attempts: number;
  error: string | null;
  media_type: string | null;
  media_filename: string | null;
  campaign_id: string | null;
  cp_lead_id: string | null;
  lead_id: string | null;
  quick_visit_id: string | null;
}

const statusColors: Record<string, string> = {
  queued: 'bg-slate-100 text-slate-600',
  sending: 'bg-sky-50 text-sky-700',
  sent: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-rose-50 text-rose-700',
};

const sourceLabel = (r: OutboxRow) => {
  if (r.campaign_id) return 'Marketing Campaign';
  if (r.cp_lead_id) return 'Channel Partner';
  if (r.lead_id) return 'Lead';
  if (r.quick_visit_id) return 'Site Visit';
  return 'General';
};

// Swapnil's messages (and any system-generated row with no created_by) go
// out through the official Meta Cloud API business number, via the
// send-whatsapp Edge Function + Supabase Cron. Every other created_by
// routes through the Baileys gateway (whatsapp-gateway/), sent from that
// staff member's own QR-paired personal WhatsApp. Both write to the same
// whatsapp_outbox table, so this is purely which of the two actually
// carried the message -- not a separate data source.
const SWAPNIL_USER_ID = 'ccfd55b7-36a2-4ab0-964e-a7e8403a9504';
const sendMethod = (r: OutboxRow): 'cloud_api' | 'qr_gateway' =>
  (!r.created_by || r.created_by === SWAPNIL_USER_ID) ? 'cloud_api' : 'qr_gateway';
const sendMethodLabel: Record<'cloud_api' | 'qr_gateway', string> = {
  cloud_api: 'Official Cloud API',
  qr_gateway: 'Personal WhatsApp (QR)',
};
const sendMethodColors: Record<'cloud_api' | 'qr_gateway', string> = {
  cloud_api: 'bg-indigo-50 text-indigo-700',
  qr_gateway: 'bg-teal-50 text-teal-700',
};

export const WhatsAppMessages: React.FC = () => {
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [usersMap, setUsersMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [statusFilter, setStatusFilter] = useState<'all' | 'queued' | 'sending' | 'sent' | 'failed'>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | 'cloud_api' | 'qr_gateway'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = useCallback(async () => {
    const [{ data, error }, { data: usersData, error: usersErr }] = await Promise.all([
      supabase
        .from('whatsapp_outbox')
        .select('id, to_phone, message, status, created_at, sent_at, created_by, attempts, error, media_type, media_filename, campaign_id, cp_lead_id, lead_id, quick_visit_id')
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase.from('user_profiles').select('id, full_name'),
    ]);
    if (error) reportQueryError('WhatsApp Messages: list', error);
    else setRows(data || []);
    if (usersErr) reportQueryError('WhatsApp Messages: users', usersErr);
    else setUsersMap(new Map((usersData || []).map(u => [u.id, u.full_name || 'Unnamed'])));
    setLoading(false);
    setSyncing(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel('whatsapp-outbox-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_outbox' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const filteredRows = rows.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (methodFilter !== 'all' && sendMethod(r) !== methodFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const senderName = (r.created_by && usersMap.get(r.created_by)) || '';
      const hay = `${r.to_phone} ${r.message} ${senderName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const totalCount = rows.length;
  const sentCount = rows.filter(r => r.status === 'sent').length;
  const failedCount = rows.filter(r => r.status === 'failed').length;
  const queuedCount = rows.filter(r => r.status === 'queued' || r.status === 'sending').length;

  const handleExportExcel = () => {
    const exportRows = filteredRows.map((r) => ({
      'To': r.to_phone,
      'Message': r.message || (r.media_filename ? `[${r.media_type}] ${r.media_filename}` : ''),
      'Sent By': r.created_by ? (usersMap.get(r.created_by) || '') : '',
      'Method': sendMethodLabel[sendMethod(r)],
      'Source': sourceLabel(r),
      'Status': r.status,
      'Attempts': r.attempts,
      'Error': r.error || '',
      'Queued At': new Date(r.created_at).toLocaleString('en-IN'),
      'Sent At': r.sent_at ? new Date(r.sent_at).toLocaleString('en-IN') : '',
    }));
    exportRowsToExcel('WhatsApp_Messages', 'Messages', exportRows);
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-indigo-600" /> WhatsApp Messages
          </h2>
          <p className="text-slate-500 text-xs mt-1">Every WhatsApp message sent from the CRM, across every user and module — Super Admin only.</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => { setSyncing(true); fetchData(); }}
            disabled={syncing}
            className="p-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-sm transition-all focus:outline-none"
          >
            <Download className="h-3.5 w-3.5" /> Export to Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          <p className="text-slate-500 text-xxs font-semibold tracking-wider uppercase">Total (last 1000)</p>
          <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{totalCount}</h3>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          <p className="text-slate-500 text-xxs font-semibold tracking-wider uppercase">Sent</p>
          <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">{sentCount}</h3>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          <p className="text-slate-500 text-xxs font-semibold tracking-wider uppercase">Queued / Sending</p>
          <h3 className="text-2xl font-extrabold text-sky-600 mt-1">{queuedCount}</h3>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          <p className="text-slate-500 text-xxs font-semibold tracking-wider uppercase">Failed</p>
          <h3 className="text-2xl font-extrabold text-rose-600 mt-1">{failedCount}</h3>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="all">All Status</option>
          <option value="queued">Queued</option>
          <option value="sending">Sending</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value as any)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="all">All Methods</option>
          <option value="cloud_api">Official Cloud API</option>
          <option value="qr_gateway">Personal WhatsApp (QR)</option>
        </select>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            placeholder="Search phone, message, sender..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 w-72"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-6">To</th>
                <th className="py-3 px-6">Message</th>
                <th className="py-3 px-6">Sent By</th>
                <th className="py-3 px-6">Method</th>
                <th className="py-3 px-6">Source</th>
                <th className="py-3 px-6">Status</th>
                <th className="py-3 px-6">Queued / Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length > 0 ? (
                filteredRows.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/50 align-top">
                    <td className="py-3 px-6 font-mono text-slate-700 whitespace-nowrap">{r.to_phone}</td>
                    <td className="py-3 px-6 max-w-sm">
                      {r.message ? (
                        <p className="text-slate-700 line-clamp-2">{r.message}</p>
                      ) : r.media_filename ? (
                        <span className="inline-flex items-center gap-1 text-slate-500 text-xs">
                          <Paperclip className="h-3 w-3" /> {r.media_type} · {r.media_filename}
                        </span>
                      ) : (
                        <span className="text-slate-300 italic">—</span>
                      )}
                      {r.status === 'failed' && r.error && (
                        <p className="mt-1 flex items-start gap-1 text-rose-600 text-xxs">
                          <AlertCircle className="h-3 w-3 flex-shrink-0 mt-0.5" /> {r.error}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-6 text-slate-600">{r.created_by ? (usersMap.get(r.created_by) || '—') : <span className="text-slate-300 italic">System</span>}</td>
                    <td className="py-3 px-6">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xxs font-semibold ${sendMethodColors[sendMethod(r)]}`}>
                        {sendMethodLabel[sendMethod(r)]}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-slate-500 text-xs">{sourceLabel(r)}</td>
                    <td className="py-3 px-6">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xxs font-semibold capitalize ${statusColors[r.status] || 'bg-slate-100 text-slate-600'}`}>
                        {r.status}
                      </span>
                      {r.attempts > 1 && <span className="ml-1.5 text-xxs text-slate-400">×{r.attempts}</span>}
                    </td>
                    <td className="py-3 px-6 text-slate-500 text-xs whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString('en-IN')}
                      {r.sent_at && <div className="text-emerald-600">Sent {new Date(r.sent_at).toLocaleTimeString('en-IN')}</div>}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400 italic">No messages found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
