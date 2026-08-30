import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { Upload, FileSpreadsheet, User, Calendar, ExternalLink, ArrowLeft, Phone, MessageCircle, X, Trash2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { BulkUploadModal } from '../components/leads/BulkUploadModal';
import { canPerformBulkUpload } from '../utils/permissions';

interface BulkUploadRecord {
  id: string;
  file_name: string;
  created_at: string;
  uploaded_by: string;
  project_id: string;
  channel_partner_id: string | null;
  uploader?: { full_name: string };
  project?: { project_name: string };
  partner?: { name: string };
}

interface BatchLead {
  id: string;
  customer_name: string | null;
  mobile: string | null;
  project_id: string | null;
  owner_id: string | null;
  sourcing_manager_id: string | null;
  telecaller_id: string | null;
  status: string | null;
  notes: string | null;
}

// Values must match the DB's lead_status enum exactly (new, contacted,
// interested, hot, site_visit_planned, site_visit_done, negotiation,
// booking_done, not_reachable, call_back_later, lost, junk).
const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  interested: 'Interested',
  hot: 'Hot',
  site_visit_planned: 'Visit Planned',
  site_visit_done: 'Visit Done',
  negotiation: 'Negotiation',
  booking_done: 'Booked',
  not_reachable: 'Not Reachable',
  call_back_later: 'Call Back Later',
  lost: 'Lost',
  junk: 'Junk',
};

const statusBadgeClass = (status: string | null) => {
  const s = (status || 'new').toLowerCase();
  if (s === 'booking_done') return 'bg-emerald-50 text-emerald-700';
  if (s === 'lost' || s === 'junk') return 'bg-rose-50 text-rose-700';
  if (s === 'site_visit_planned' || s === 'site_visit_done') return 'bg-amber-50 text-amber-700';
  return 'bg-indigo-50 text-indigo-700';
};

export const BulkUploads: React.FC = () => {
  const [uploads, setUploads] = useState<BulkUploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const { role, user } = useAuth();
  const canUpload = canPerformBulkUpload(role);
  // Deleting an entire batch (and every lead in it) or an individual lead
  // out of a batch is super_admin/site_head only -- enforced for real by
  // bulk_lead_uploads_delete / leads_delete RLS, this just gates the button.
  const canDeleteBulk = role === 'super_admin' || role === 'site_head';

  useEffect(() => {
    fetchUploads();
  }, []);

  const fetchUploads = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('bulk_lead_uploads')
        .select(`
          id,
          file_name,
          created_at,
          uploaded_by,
          project_id,
          channel_partner_id,
          uploader:user_profiles!uploaded_by(full_name),
          project:projects(project_name),
          partner:channel_partners(name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Handle casting properly due to Postgrest single/array object mappings
      const typedData = (data as any[]).map(item => ({
        ...item,
        uploader: Array.isArray(item.uploader) ? item.uploader[0] : item.uploader,
        project: Array.isArray(item.project) ? item.project[0] : item.project,
        partner: Array.isArray(item.partner) ? item.partner[0] : item.partner,
      }));

      setUploads(typedData);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch bulk uploads');
    } finally {
      setLoading(false);
    }
  };

  // Drill-down into one upload's leads -- this used to navigate away to
  // /leads?bulk_upload_id=..., but bulk-uploaded leads are a separate thing
  // from the main Leads directory and stay fully inside this page now,
  // like a folder of files rather than a different destination.
  const [viewingUpload, setViewingUpload] = useState<BulkUploadRecord | null>(null);
  const [batchLeads, setBatchLeads] = useState<BatchLead[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [profileMap, setProfileMap] = useState<Map<string, string>>(new Map());
  const [projectMap, setProjectMap] = useState<Map<string, string>>(new Map());
  const [detailsLead, setDetailsLead] = useState<BatchLead | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchBatchLeads = async (uploadId: string) => {
    setBatchLoading(true);
    setBatchError(null);
    try {
      const [leadsRes, profilesRes, projectsRes] = await Promise.all([
        supabase.from('leads')
          .select('id, customer_name, mobile, project_id, owner_id, sourcing_manager_id, telecaller_id, status, notes')
          .eq('bulk_upload_id', uploadId)
          .order('created_at', { ascending: false }),
        supabase.from('user_profiles').select('id, full_name'),
        supabase.from('projects').select('id, project_name'),
      ]);
      if (leadsRes.error) throw leadsRes.error;
      setBatchLeads(leadsRes.data || []);
      if (profilesRes.data) setProfileMap(new Map(profilesRes.data.map(p => [p.id, p.full_name])));
      if (projectsRes.data) setProjectMap(new Map(projectsRes.data.map(p => [p.id, p.project_name])));
    } catch (err: any) {
      setBatchError(err.message || 'Failed to load leads for this upload.');
    } finally {
      setBatchLoading(false);
    }
  };

  const openBatch = (upload: BulkUploadRecord) => {
    setViewingUpload(upload);
    fetchBatchLeads(upload.id);
  };

  const closeBatch = () => {
    setViewingUpload(null);
    setBatchLeads([]);
    setBatchError(null);
  };

  const handleDeleteBatch = async (upload: BulkUploadRecord) => {
    if (!window.confirm(`Permanently delete "${upload.file_name}" and every lead in it? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('bulk_lead_uploads').delete().eq('id', upload.id);
      if (error) throw error;
      await fetchUploads();
    } catch (err: any) {
      setError(err.message || 'Failed to delete this upload.');
    }
  };

  const handleDeleteBatchLead = async (lead: BatchLead) => {
    if (!viewingUpload) return;
    if (!window.confirm(`Permanently delete "${lead.customer_name || 'this lead'}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('leads').delete().eq('id', lead.id);
      if (error) throw error;
      await fetchBatchLeads(viewingUpload.id);
    } catch (err: any) {
      setBatchError(err.message || 'Failed to delete this lead.');
    }
  };

  const updateBatchLeadStatus = async (lead: BatchLead, newStatus: string) => {
    if (!viewingUpload) return;
    // LOST permanently deletes the lead, per the client -- everything else
    // just updates status.
    if (newStatus === 'lost' && !window.confirm('Marking this LOST will permanently delete the lead. Continue?')) {
      return;
    }
    setUpdatingId(lead.id);
    try {
      if (newStatus === 'lost') {
        const { error } = await supabase.from('leads').delete().eq('id', lead.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('leads').update({ status: newStatus }).eq('id', lead.id);
        if (error) throw error;
      }
      await fetchBatchLeads(viewingUpload.id);
    } catch (err: any) {
      setBatchError(err.message || 'Failed to update status.');
    } finally {
      setUpdatingId(null);
    }
  };

  if (viewingUpload) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <button
            onClick={closeBatch}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors mb-3"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Bulk Uploads
          </button>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
            {viewingUpload.file_name}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {viewingUpload.project?.project_name || 'Unknown project'} · Uploaded by {viewingUpload.uploader?.full_name || 'Unknown'}
          </p>
        </div>

        {batchError && (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">{batchError}</div>
        )}

        {batchLoading ? (
          <div className="flex justify-center p-12">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : batchLeads.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-1">No leads visible here</h3>
            <p className="text-slate-500">Either this batch has no leads, or none are allocated to you.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-3.5">Customer</th>
                    <th className="px-6 py-3.5">Mobile</th>
                    <th className="px-6 py-3.5">Project</th>
                    <th className="px-6 py-3.5">Sourcing Manager</th>
                    <th className="px-6 py-3.5">Allocated To</th>
                    <th className="px-6 py-3.5">Presales (Telecaller)</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batchLeads.map(lead => {
                    // Matches the leads_update/leads_delete RLS carve-out:
                    // super_admin/site_head unrestricted, the assigned
                    // telecaller, the sourcing manager this lead is
                    // attributed to, and a channel partner (RLS already
                    // guarantees a CP only ever sees leads attributed to
                    // them, so if they can see it here they can manage it).
                    const canManageThisLead = role === 'super_admin' || role === 'site_head'
                      || lead.telecaller_id === user?.id
                      || (lead.sourcing_manager_id === user?.id && (role === 'sourcing_manager' || role === 'sourcing_manager_tl'))
                      || role === 'channel_partner';
                    return (
                      <React.Fragment key={lead.id}>
                        <tr className="hover:bg-slate-50/50 transition-colors text-sm">
                          <td className="px-6 py-4 font-semibold text-slate-900">{lead.customer_name || 'Unnamed'}</td>
                          <td className="px-6 py-4 text-slate-600">{lead.mobile || 'N/A'}</td>
                          <td className="px-6 py-4 text-slate-600">{projectMap.get(lead.project_id || '') || 'N/A'}</td>
                          <td className="px-6 py-4 text-slate-600">{profileMap.get(lead.sourcing_manager_id || '') || 'N/A'}</td>
                          <td className="px-6 py-4 text-slate-600">{profileMap.get(lead.owner_id || '') || 'N/A'}</td>
                          <td className="px-6 py-4 text-slate-600">{profileMap.get(lead.telecaller_id || '') || 'N/A'}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusBadgeClass(lead.status)}`}>
                              {STATUS_LABEL[lead.status || 'new'] || lead.status || 'New'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <a
                                href={lead.mobile ? `tel:${lead.mobile}` : undefined}
                                title={lead.mobile ? 'Call' : 'No mobile number'}
                                className={`inline-flex items-center justify-center p-1.5 border border-slate-200 rounded-lg transition-colors ${lead.mobile ? 'text-blue-600 hover:bg-blue-50' : 'opacity-40 cursor-not-allowed text-slate-400'}`}
                              >
                                <Phone className="h-3.5 w-3.5" />
                              </a>
                              <a
                                href={lead.mobile ? `https://wa.me/${lead.mobile.replace(/\D/g, '')}` : undefined}
                                target="_blank"
                                rel="noreferrer"
                                title={lead.mobile ? 'WhatsApp' : 'No mobile number'}
                                className={`inline-flex items-center justify-center p-1.5 border border-slate-200 rounded-lg transition-colors ${lead.mobile ? 'text-emerald-600 hover:bg-emerald-50' : 'opacity-40 cursor-not-allowed text-slate-400'}`}
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                              </a>
                              <button
                                onClick={() => setDetailsLead(lead)}
                                className="px-3 py-1.5 border border-slate-200 bg-white text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-100 transition-colors"
                              >
                                DETAILS
                              </button>
                              {canDeleteBulk && (
                                <button
                                  onClick={() => handleDeleteBatchLead(lead)}
                                  title="Delete this lead (Super Admin / Site Head only)"
                                  className="inline-flex items-center justify-center p-1.5 border border-slate-200 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {/* Status quick-actions -- only the telecaller this
                            lead is assigned to can move it, matching the
                            narrow leads_update RLS carve-out for bulk leads
                            (everyone else is view-only here; full editing is
                            super_admin-only in the main Leads directory). */}
                        {canManageThisLead && (
                          <tr className="bg-slate-50/50 border-b border-slate-100">
                            <td colSpan={8} className="px-6 py-3">
                              <div className="flex flex-wrap gap-2 items-center">
                                <button disabled={updatingId === lead.id} onClick={() => updateBatchLeadStatus(lead, 'call_back_later')} className="px-3 py-1.5 border border-orange-500 bg-orange-500 text-black rounded-lg text-xs font-bold hover:bg-orange-600 transition-colors disabled:opacity-50">
                                  CALL BACK
                                </button>
                                <button disabled={updatingId === lead.id} onClick={() => updateBatchLeadStatus(lead, 'lost')} className="px-3 py-1.5 border border-red-600 bg-red-600 text-black rounded-lg text-xs font-bold hover:bg-red-700 transition-colors disabled:opacity-50">
                                  LOST
                                </button>
                                <button disabled={updatingId === lead.id} onClick={() => updateBatchLeadStatus(lead, 'booking_done')} className="px-3 py-1.5 border border-[#00FF00] bg-[#00FF00] text-black rounded-lg text-xs font-bold hover:bg-[#00cc00] transition-colors disabled:opacity-50">
                                  BOOKED
                                </button>
                                <button disabled={updatingId === lead.id} onClick={() => updateBatchLeadStatus(lead, 'site_visit_planned')} className="px-3 py-1.5 border border-cyan-400 bg-cyan-400 text-black rounded-lg text-xs font-bold hover:bg-cyan-500 transition-colors disabled:opacity-50">
                                  VISIT PLANNED
                                </button>
                                <button disabled={updatingId === lead.id} onClick={() => updateBatchLeadStatus(lead, 'junk')} className="px-3 py-1.5 border border-black bg-black text-red-600 rounded-lg text-xs font-bold hover:bg-gray-900 transition-colors disabled:opacity-50">
                                  JUNK
                                </button>
                                <button disabled={updatingId === lead.id} onClick={() => updateBatchLeadStatus(lead, 'site_visit_done')} className="px-3 py-1.5 border border-[#5AB7B7] bg-[#5AB7B7] text-black rounded-lg text-xs font-bold hover:bg-[#4a9f9f] transition-colors disabled:opacity-50">
                                  VISIT DONE
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {detailsLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-900">{detailsLead.customer_name || 'Lead Details'}</h3>
                <button onClick={() => setDetailsLead(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-3 text-sm">
                <div><span className="text-slate-400 text-xs font-bold uppercase">Mobile</span><p className="text-slate-800">{detailsLead.mobile || 'N/A'}</p></div>
                <div><span className="text-slate-400 text-xs font-bold uppercase">Project</span><p className="text-slate-800">{projectMap.get(detailsLead.project_id || '') || 'N/A'}</p></div>
                <div><span className="text-slate-400 text-xs font-bold uppercase">Sourcing Manager</span><p className="text-slate-800">{profileMap.get(detailsLead.sourcing_manager_id || '') || 'N/A'}</p></div>
                <div><span className="text-slate-400 text-xs font-bold uppercase">Allocated To</span><p className="text-slate-800">{profileMap.get(detailsLead.owner_id || '') || 'N/A'}</p></div>
                <div><span className="text-slate-400 text-xs font-bold uppercase">Presales (Telecaller)</span><p className="text-slate-800">{profileMap.get(detailsLead.telecaller_id || '') || 'N/A'}</p></div>
                <div><span className="text-slate-400 text-xs font-bold uppercase">Status</span><p className="text-slate-800">{STATUS_LABEL[detailsLead.status || 'new'] || detailsLead.status}</p></div>
                <div><span className="text-slate-400 text-xs font-bold uppercase">Notes</span><p className="text-slate-800 whitespace-pre-wrap">{detailsLead.notes || 'No notes.'}</p></div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Upload className="w-6 h-6 text-indigo-600" />
            Bulk Upload History
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Directory of all Excel lead uploads. Click an upload to view its leads.
          </p>
        </div>
        {canUpload && (
          <button
            onClick={() => setIsUploadOpen(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition-all focus:outline-none"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Upload Bulk Leads
          </button>
        )}
      </div>

      <BulkUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadComplete={fetchUploads}
      />

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : uploads.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-1">No uploads found</h3>
          <p className="text-slate-500">You haven't uploaded any bulk leads yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">File Name</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Uploaded By</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {uploads.map((upload) => (
                  <tr key={upload.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                          <FileSpreadsheet className="w-5 h-5" />
                        </div>
                        <span className="text-sm font-medium text-slate-900">{upload.file_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        {new Date(upload.created_at).toLocaleString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-700">{upload.project?.project_name || 'Unknown'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <User className="w-4 h-4 text-slate-400" />
                        {upload.uploader?.full_name || 'Unknown'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openBatch(upload)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                          View Leads
                        </button>
                        {canDeleteBulk && (
                          <button
                            onClick={() => handleDeleteBatch(upload)}
                            title="Delete this entire upload and all its leads (Super Admin / Site Head only)"
                            className="inline-flex items-center justify-center p-1.5 border border-slate-200 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
