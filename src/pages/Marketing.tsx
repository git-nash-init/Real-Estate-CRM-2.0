import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { reportQueryError } from '../services/queryLogger';
import { useAuth } from '../hooks/useAuth';
import { canSendMarketingBlast } from '../utils/permissions';
import {
  uploadWhatsAppAttachment,
  removeWhatsAppAttachment,
  formatBytes,
  type UploadedAttachment,
} from '../services/whatsappAttachments';
import {
  Megaphone,
  Send,
  Plus,
  X,
  Users,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw,
  MessageSquare,
  Paperclip,
} from 'lucide-react';

interface Campaign {
  id: string;
  campaign_name: string;
  platform: string | null;
  campaign_type: string | null;
  status: string | null;
  project_id: string | null;
  created_at: string;
}

interface LeadOption {
  id: string;
  customer_name: string | null;
  mobile: string | null;
  project_id: string | null;
  status: string | null;
  source: string | null;
  channel_partner_id: string | null;
}

interface OutboxCounts {
  queued: number;
  sending: number;
  sent: number;
  failed: number;
}

const leadStatusOptions = [
  'new', 'contacted', 'interested', 'hot', 'site_visit_planned', 'site_visit_done',
  'negotiation', 'booking_done', 'not_reachable', 'call_back_later', 'lost', 'junk',
];

export const Marketing: React.FC = () => {
  const { role } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [outboxCountsByCampaign, setOutboxCountsByCampaign] = useState<Map<string, OutboxCounts>>(new Map());
  const [projectsMap, setProjectsMap] = useState<Map<string, string>>(new Map());
  const [projectsList, setProjectsList] = useState<{ id: string; project_name: string }[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCpOnly, setFilterCpOnly] = useState(false);
  const [messageTemplate, setMessageTemplate] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [attachment, setAttachment] = useState<UploadedAttachment | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;

    setUploadingAttachment(true);
    setCreateError(null);
    try {
      // One media item per WhatsApp message, so a new pick replaces the
      // old one; clean up the superseded upload.
      const previous = attachment;
      const uploaded = await uploadWhatsAppAttachment(file);
      setAttachment(uploaded);
      if (previous) removeWhatsAppAttachment(previous.path);
    } catch (err: any) {
      setCreateError(err.message || 'Failed to upload the attachment.');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleRemoveAttachment = async () => {
    const current = attachment;
    setAttachment(null);
    if (current) removeWhatsAppAttachment(current.path);
  };

  const fetchData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, campaign_name, platform, campaign_type, status, project_id, created_at')
        .eq('platform', 'whatsapp')
        .order('created_at', { ascending: false });
      if (error) {
        reportQueryError('Marketing: campaigns', error);
      } else {
        setCampaigns(data || []);

        // Aggregate delivery counts per campaign from the outbox — this is
        // the only source of truth for what actually sent (the gateway
        // updates whatsapp_outbox directly; campaigns.* metric columns are
        // for ad-spend campaigns, not messaging delivery status).
        if (data && data.length > 0) {
          const { data: outboxRows, error: outboxErr } = await supabase
            .from('whatsapp_outbox')
            .select('campaign_id, status')
            .in('campaign_id', data.map(c => c.id));
          if (outboxErr) {
            reportQueryError('Marketing: outbox delivery counts', outboxErr);
          } else {
            const counts = new Map<string, OutboxCounts>();
            for (const row of outboxRows || []) {
              if (!row.campaign_id) continue;
              const c = counts.get(row.campaign_id) || { queued: 0, sending: 0, sent: 0, failed: 0 };
              if (row.status === 'queued') c.queued++;
              else if (row.status === 'sending') c.sending++;
              else if (row.status === 'sent') c.sent++;
              else if (row.status === 'failed') c.failed++;
              counts.set(row.campaign_id, c);
            }
            setOutboxCountsByCampaign(counts);
          }
        }
      }
    } catch (err) {
      reportQueryError('Marketing: campaigns', err);
    }

    try {
      const { data, error } = await supabase.from('projects').select('id, project_name');
      if (error) {
        reportQueryError('Marketing: projects', error);
      } else {
        setProjectsList(data || []);
        setProjectsMap(new Map((data || []).map(p => [p.id, p.project_name])));
      }
    } catch (err) {
      reportQueryError('Marketing: projects', err);
    }

    try {
      const { data, error } = await supabase
        .from('leads')
        .select('id, customer_name, mobile, project_id, status, source, channel_partner_id');
      if (error) {
        reportQueryError('Marketing: leads audience', error);
      } else {
        setLeads(data || []);
      }
    } catch (err) {
      reportQueryError('Marketing: leads audience', err);
    }

    setLoading(false);
    setSyncing(false);
  }, []);

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

  // Audience preview: matches the same filters used at send time so the
  // count shown before sending is exactly what will be enqueued.
  const matchedAudience = useMemo(() => {
    return leads.filter(l => {
      if (!l.mobile) return false;
      if (filterProjectId && l.project_id !== filterProjectId) return false;
      if (filterStatus && l.status !== filterStatus) return false;
      if (filterCpOnly && !l.channel_partner_id) return false;
      return true;
    });
  }, [leads, filterProjectId, filterStatus, filterCpOnly]);

  const resetForm = () => {
    setCampaignName('');
    setFilterProjectId('');
    setFilterStatus('');
    setFilterCpOnly(false);
    setMessageTemplate('');
    setCreateError(null);
    // Not deleting the uploaded object here — if a campaign was just
    // created, its queued rows still reference it.
    setAttachment(null);
    setUploadingAttachment(false);
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignName.trim()) {
      setCreateError('Campaign name is required.');
      return;
    }
    // With an attachment the template becomes the caption and is optional —
    // blasting a brochure with no covering note is legitimate.
    if (!messageTemplate.trim() && !attachment) {
      setCreateError('Add a message template or an attachment.');
      return;
    }
    if (matchedAudience.length === 0) {
      setCreateError('No leads match the selected audience filters.');
      return;
    }

    setCreateError(null);
    setCreateLoading(true);

    try {
      const { data: userData } = await supabase.auth.getUser();

      const { data: campaign, error: campaignErr } = await supabase
        .from('campaigns')
        .insert([{
          campaign_name: campaignName.trim(),
          platform: 'whatsapp',
          campaign_type: 'bulk_message',
          status: 'active',
          project_id: filterProjectId || null,
          created_by: userData?.user?.id || null,
          media_path: attachment?.path || null,
          media_type: attachment?.type || null,
          media_filename: attachment?.filename || null,
        }])
        .select('id')
        .single();

      if (campaignErr) throw campaignErr;

      // {{name}} merge field per recipient; everything else in the template
      // is sent verbatim.
      const outboxRows = matchedAudience.map(lead => ({
        to_phone: lead.mobile as string,
        message: messageTemplate.replace(/\{\{\s*name\s*\}\}/gi, lead.customer_name || 'there'),
        campaign_id: campaign.id,
        lead_id: lead.id,
        status: 'queued',
        created_by: userData?.user?.id || null,
        // Every recipient references the same uploaded object — the file
        // is stored once, not once per lead.
        media_path: attachment?.path || null,
        media_type: attachment?.type || null,
        media_filename: attachment?.filename || null,
      }));

      const { error: outboxErr } = await supabase.from('whatsapp_outbox').insert(outboxRows);
      if (outboxErr) throw outboxErr;

      setNotification({ type: 'success', message: `Campaign queued — ${outboxRows.length} messages sent to the gateway.` });
      setIsCreateOpen(false);
      resetForm();
      await fetchData();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create campaign.');
    } finally {
      setCreateLoading(false);
    }
  };

  const totalCampaigns = campaigns.length;
  const totalSent = Array.from(outboxCountsByCampaign.values()).reduce((sum, c) => sum + c.sent, 0);
  const totalQueued = Array.from(outboxCountsByCampaign.values()).reduce((sum, c) => sum + c.queued + c.sending, 0);
  const totalFailed = Array.from(outboxCountsByCampaign.values()).reduce((sum, c) => sum + c.failed, 0);

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
            <Megaphone className="h-6 w-6 text-indigo-600" /> Marketing
          </h2>
          <p className="text-slate-500 text-xs mt-1">WhatsApp bulk messaging campaigns to leads.</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="p-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
          {canSendMarketingBlast(role) && (
            <button
              onClick={() => { resetForm(); setIsCreateOpen(true); }}
              className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>New Campaign</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Campaigns</span>
          <span className="block text-xl font-bold text-slate-900 mt-1">{totalCampaigns}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Sent</span>
          <span className="block text-xl font-bold text-emerald-600 mt-1">{totalSent}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Queued</span>
          <span className="block text-xl font-bold text-amber-500 mt-1">{totalQueued}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <span className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Failed</span>
          <span className="block text-xl font-bold text-rose-600 mt-1">{totalFailed}</span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-6">Campaign</th>
                <th className="py-3 px-6">Project</th>
                <th className="py-3 px-6">Status</th>
                <th className="py-3 px-6">Sent</th>
                <th className="py-3 px-6">Queued</th>
                <th className="py-3 px-6">Failed</th>
                <th className="py-3 px-6">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.length > 0 ? (
                campaigns.map(c => {
                  const counts = outboxCountsByCampaign.get(c.id) || { queued: 0, sending: 0, sent: 0, failed: 0 };
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-6 font-semibold text-slate-900 flex items-center gap-2">
                        <MessageSquare className="h-3.5 w-3.5 text-indigo-500" /> {c.campaign_name}
                      </td>
                      <td className="py-3 px-6 text-slate-600">{projectsMap.get(c.project_id || '') || 'All Projects'}</td>
                      <td className="py-3 px-6">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xxs font-semibold bg-indigo-50 text-indigo-700">{c.status}</span>
                      </td>
                      <td className="py-3 px-6 font-semibold text-emerald-600">{counts.sent}</td>
                      <td className="py-3 px-6 font-semibold text-amber-500">{counts.queued + counts.sending}</td>
                      <td className="py-3 px-6 font-semibold text-rose-600">{counts.failed}</td>
                      <td className="py-3 px-6 text-slate-500 text-xs">{new Date(c.created_at).toLocaleDateString('en-IN')}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400 italic">No campaigns yet. Create one to send a WhatsApp broadcast.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !createLoading && setIsCreateOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <span className="font-bold tracking-tight">New WhatsApp Campaign</span>
              <button onClick={() => !createLoading && setIsCreateOpen(false)} className="p-1 rounded-lg text-indigo-200 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateCampaign}>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {createError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-sm">{createError}</div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Campaign Name *</label>
                  <input
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    placeholder="e.g. Diwali Offer Blast"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Project</label>
                    <select
                      value={filterProjectId}
                      onChange={(e) => setFilterProjectId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    >
                      <option value="">All Projects</option>
                      {projectsList.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Lead Status</label>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    >
                      <option value="">Any Status</option>
                      {leadStatusOptions.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={filterCpOnly} onChange={(e) => setFilterCpOnly(e.target.checked)} />
                  Channel Partner referred leads only
                </label>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Message Template * <span className="text-slate-400 normal-case font-normal">— use {'{{name}}'} to insert the lead's name</span>
                  </label>
                  <textarea
                    value={messageTemplate}
                    onChange={(e) => setMessageTemplate(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    placeholder="Hi {{name}}, check out our latest offer..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Attachment <span className="text-slate-400 normal-case font-normal">— optional, sent to every recipient</span>
                  </label>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleFilePick} />
                  {attachment ? (
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <Paperclip className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-700 truncate">{attachment.filename}</div>
                        <div className="text-[10px] text-slate-400 capitalize">
                          {attachment.type} · {formatBytes(attachment.sizeBytes)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveAttachment}
                        className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex-shrink-0"
                        title="Remove attachment"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingAttachment}
                      className="flex items-center justify-center gap-1.5 w-full px-3 py-2.5 border border-dashed border-slate-300 rounded-lg text-xs font-semibold text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors disabled:opacity-50"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      {uploadingAttachment ? 'Uploading...' : 'Attach a file (image, PDF, video…)'}
                    </button>
                  )}
                </div>

                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-center gap-2.5 text-sm text-indigo-800">
                  <Users className="h-4 w-4 flex-shrink-0" />
                  <span><strong>{matchedAudience.length}</strong> lead{matchedAudience.length === 1 ? '' : 's'} match{matchedAudience.length === 1 ? 'es' : ''} these filters and will receive this message.</span>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2">
                  <Clock className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  Messages are throttled by the WhatsApp gateway (a few seconds apart, daily cap) to reduce the risk of the connected number being flagged. Large audiences may take a while to fully send.
                </div>
              </div>
              <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={createLoading}
                  className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading || uploadingAttachment}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {createLoading ? 'Queuing...' : `Send to ${matchedAudience.length} Lead${matchedAudience.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
