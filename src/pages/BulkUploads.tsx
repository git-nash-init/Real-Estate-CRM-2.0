import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { Upload, FileSpreadsheet, User, Calendar, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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

export const BulkUploads: React.FC = () => {
  const [uploads, setUploads] = useState<BulkUploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

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

  const navigateToLeads = (id: string) => {
    navigate(`/leads?bulk_upload_id=${id}`);
  };

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
      </div>

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
                      <button
                        onClick={() => navigateToLeads(upload.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View Leads
                      </button>
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
