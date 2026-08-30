import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { X, Upload, Download, Loader2 } from 'lucide-react';

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: () => void;
}

export const BulkUploadModal: React.FC<BulkUploadModalProps> = ({ isOpen, onClose, onUploadComplete }) => {
  const { user, role } = useAuth();
  // A channel partner uploading their own batch isn't "assigning to a CP"
  // (they ARE the CP) and has no business picking which internal
  // telecaller follows up -- that's a staff decision. Both sections below
  // are hidden for them; their own channel_partners.id is resolved and
  // attached automatically instead of showing a dropdown of every partner
  // (which RLS scopes to just their own row anyway, so it'd be a
  // dropdown with exactly one option -- confusing, not useful).
  const isChannelPartner = role === 'channel_partner';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [projectId, setProjectId] = useState('');
  const [channelPartnerId, setChannelPartnerId] = useState('');
  const [telecallerIds, setTelecallerIds] = useState<string[]>([]);

  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [partners, setPartners] = useState<{ id: string; name: string; company_name: string | null }[]>([]);
  const [telecallers, setTelecallers] = useState<{ id: string; name: string }[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchDropdownData();
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setProjectId('');
    setChannelPartnerId('');
    setTelecallerIds([]);
    setError(null);
    setSuccess(null);
  };

  const fetchDropdownData = async () => {
    try {
      if (isChannelPartner) {
        // Resolve their own channel_partners.id directly -- not filtered
        // by status='active', since a partner uploading for themselves
        // should work regardless of that flag; RLS already scopes this
        // query to their own row (user_id = auth.uid()) regardless.
        const { data: ownCp } = await supabase.from('channel_partners').select('id').eq('user_id', user?.id).maybeSingle();
        if (ownCp) {
          setChannelPartnerId(ownCp.id);
          // Project dropdown limited to projects actually assigned to
          // this partner (channel_partner_projects), not every project
          // in the company.
          const { data: assignments } = await supabase.from('channel_partner_projects').select('project_id, projects(project_name)').eq('channel_partner_id', ownCp.id);
          setProjects((assignments || []).map((a: any) => ({ id: a.project_id, name: a.projects?.project_name || 'Unknown' })));
        }
        return; // no telecaller list needed -- that section is hidden for them
      }

      // Fetch Projects
      const { data: projData } = await supabase.from('projects').select('id, project_name');
      if (projData) setProjects(projData.map(p => ({ id: p.id, name: p.project_name })));

      // Fetch Channel Partners
      const { data: cpData } = await supabase.from('channel_partners').select('id, name, company_name').eq('status', 'active');
      if (cpData) setPartners(cpData.map(c => ({ id: c.id, name: c.name, company_name: c.company_name })));

      // Fetch Telecallers (Role = telecaller)
      const { data: roles, error: rErr } = await supabase.from('roles').select('id, name');
      if (rErr) console.error('Error fetching roles:', rErr);
      const tcRoleId = roles?.find(r => r.name === 'telecaller')?.id;
      
      if (tcRoleId) {
        const { data: userRoles, error: urErr } = await supabase.from('user_roles').select('user_id').eq('role_id', tcRoleId);
        if (urErr) console.error('Error fetching user_roles:', urErr);
        if (userRoles && userRoles.length > 0) {
          const userIds = userRoles.map(ur => ur.user_id);
          const { data: profiles, error: pErr } = await supabase.from('user_profiles').select('id, full_name').in('id', userIds);
          if (pErr) console.error('Error fetching user_profiles:', pErr);
          if (profiles) {
            setTelecallers(profiles.map(p => ({ id: p.id, name: p.full_name || 'Unknown' })));
          }
        } else {
          console.log('No user_roles found for telecaller role ID:', tcRoleId);
        }
      } else {
        console.log('Telecaller role ID not found in roles table.');
      }
    } catch (err) {
      console.error('Failed to fetch dropdown data for bulk upload', err);
    }
  };

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Customer Name', 'Mobile Number', 'Configuration', 'Budget', 'Channel Partner Name']
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    XLSX.writeFile(wb, 'Bulk_Leads_Template.xlsx');
  };

  const toggleTelecaller = (id: string) => {
    setTelecallerIds(prev => 
      prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]
    );
  };

  const generateLeadNumber = async () => {
    const { data: maxLeadData } = await supabase
      .from('leads')
      .select('lead_number')
      .order('lead_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!maxLeadData?.lead_number) return 'LD-10001';

    const match = maxLeadData.lead_number.match(/^([a-zA-Z\-_]*?)(\d+)$/);
    if (match) {
      const prefix = match[1];
      const numStr = match[2];
      const nextNum = parseInt(numStr, 10) + 1;
      return `${prefix}${String(nextNum).padStart(numStr.length, '0')}`;
    }
    return `LD-${Date.now()}`;
  };

  const handleUpload = async () => {
    if (!file) return setError('Please select an Excel file.');
    if (!projectId) return setError('Please select a project.');
    
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (!isChannelPartner && telecallerIds.length === 0) {
      setError('Please select at least one telecaller before uploading.');
      setLoading(false);
      return;
    }

    try {
      // 1. Read Excel file
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      // Skip header row
      const json: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      const rows = json.slice(1).filter(row => row.length > 0 && row[0] && row[1]); // Must have name and mobile

      if (rows.length === 0) {
        throw new Error('The excel sheet is empty or invalid. Ensure you have Customer Name and Mobile Number.');
      }

      // 2. Create Bulk Upload Directory Record
      const { data: bulkRecord, error: bulkErr } = await supabase.from('bulk_lead_uploads').insert({
        file_name: file.name,
        uploaded_by: user?.id,
        project_id: projectId,
        channel_partner_id: channelPartnerId || null
      }).select('id').single();

      if (bulkErr || !bulkRecord) throw new Error(bulkErr?.message || 'Failed to create bulk upload record.');

      // 3. Prepare Leads data
      const leadBaseNumber = await generateLeadNumber();
      let prefix = 'LD-';
      let startNum = 10001;
      const match = leadBaseNumber.match(/^([a-zA-Z\-_]*?)(\d+)$/);
      if (match) {
        prefix = match[1];
        startNum = parseInt(match[2], 10);
      }

      const newLeads = rows.map((row, index) => {
        // Round Robin Telecaller Assignment
        let assignedTelecaller = null;
        if (telecallerIds.length > 0) {
          assignedTelecaller = telecallerIds[index % telecallerIds.length];
        }

        const lNum = `${prefix}${String(startNum + index).padStart(String(startNum).length, '0')}`;

        return {
          lead_number: lNum,
          customer_name: row[0]?.toString().trim() || 'Unknown',
          mobile: row[1]?.toString().trim() || '',
          configuration: row[2]?.toString().trim() || null,
          budget: row[3]?.toString().trim() || null,
          // row[4] is CP Name from excel, but we already have dropdown. If CP is set in dropdown, we use that.
          channel_partner_id: channelPartnerId || null,
          project_id: projectId,
          telecaller_id: assignedTelecaller,
          bulk_upload_id: bulkRecord.id,
          created_by: user?.id,
          owner_id: user?.id,
          status: 'new', // Default status for bulk uploads
          source: 'bulk_upload'
        };
      });

      // 4. Insert Leads (Batching if too large)
      const chunkSize = 100;
      for (let i = 0; i < newLeads.length; i += chunkSize) {
        const chunk = newLeads.slice(i, i + chunkSize);
        const { error: insertErr } = await supabase.from('leads').insert(chunk);
        if (insertErr) throw new Error(`Error inserting leads: ${insertErr.message}`);
      }

      // 5. Notify telecallers
      if (telecallerIds.length > 0) {
        const notifications: any[] = [];
        for (const tcId of telecallerIds) {
          const count = newLeads.filter(l => l.telecaller_id === tcId).length;
          if (count > 0) {
            notifications.push({
              user_id: tcId,
              notification_type: 'bulk_upload_assignment',
              title: 'New Leads Assigned',
              message: `You have been assigned ${count} new leads from a bulk upload.`,
              related_entity: 'bulk_upload',
              related_id: bulkRecord.id,
              is_read: false
            });
          }
        }

        if (notifications.length > 0) {
          await supabase.from('notifications').insert(notifications);
        }
      }

      setSuccess(`Successfully uploaded ${newLeads.length} leads.`);
      setTimeout(() => {
        onUploadComplete();
        onClose();
      }, 2000);

    } catch (err: any) {
      setError(err.message || 'An error occurred during upload.');
      // Cleanup bulk record if it failed during lead insertion
      // For a robust system, we should have transactions, but RPC or manual cleanup is okay here.
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 shrink-0">
          <h2 className="text-xl font-semibold text-slate-800">Bulk Upload Leads</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-2 -mr-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {error && <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
          {success && <div className="p-4 bg-emerald-50 text-emerald-700 rounded-lg text-sm">{success}</div>}

          <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg border border-slate-200">
            <div>
              <p className="text-sm font-medium text-slate-700">Need the template?</p>
              <p className="text-xs text-slate-500 mt-1">Download the empty Excel template with required columns.</p>
            </div>
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Template
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Upload File *</label>
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                ref={fileInputRef}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Project *</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              >
                <option value="">Select a Project</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {isChannelPartner ? (
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 text-sm text-indigo-800">
                These leads will be attributed to you automatically as the referring Channel Partner. Staff will assign a telecaller after review.
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Channel Partner (Optional)</label>
                  <select
                    value={channelPartnerId}
                    onChange={(e) => setChannelPartnerId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  >
                    <option value="">No specific partner</option>
                    {partners.map(p => (
                      <option key={p.id} value={p.id}>{p.company_name || p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Assign Telecallers (Round-Robin)</label>
                  <div className="border border-slate-300 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                    {telecallers.length === 0 ? (
                      <p className="text-sm text-slate-500">No telecallers found.</p>
                    ) : (
                      telecallers.map(tc => (
                        <label key={tc.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={telecallerIds.includes(tc.id)}
                            onChange={() => toggleTelecaller(tc.id)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          {tc.name}
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 shrink-0 flex justify-end gap-3 bg-slate-50 rounded-b-xl">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={loading || !file || !projectId}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {loading ? 'Uploading...' : 'Upload Leads'}
          </button>
        </div>
      </div>
    </div>
  );
};
