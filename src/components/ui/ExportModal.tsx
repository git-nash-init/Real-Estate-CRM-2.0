import React, { useState } from 'react';
import { Download, X } from 'lucide-react';

/**
 * Small "what do you want to export" modal, shown before calling the page's
 * existing exportRowsToExcel(baseFilename, sheetName, rows) (src/utils/exportExcel.ts,
 * unchanged). The page supplies two loaders: one that builds rows from the
 * currently-applied filters (what it already does today) and one that
 * builds rows with filters cleared -- both reuse the page's existing query
 * logic, just called with a boolean.
 */
export const ExportModal: React.FC<{
  open: boolean;
  onClose: () => void;
  entityLabel: string; // e.g. "leads", "bookings"
  filteredCount?: number;
  onExport: (scope: 'all' | 'filtered') => void | Promise<void>;
}> = ({ open, onClose, entityLabel, filteredCount, onExport }) => {
  const [scope, setScope] = useState<'all' | 'filtered'>('filtered');
  const [exporting, setExporting] = useState(false);

  if (!open) return null;

  const handleExport = async () => {
    setExporting(true);
    try {
      await onExport(scope);
      onClose();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-900">Export to Excel</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2.5 mb-5">
          <button
            type="button"
            onClick={() => setScope('filtered')}
            className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${
              scope === 'filtered' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="text-sm font-semibold text-slate-900">Current filtered view</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {filteredCount != null ? `${filteredCount} ${entityLabel} matching your current filters` : `Only what's currently visible`}
            </div>
          </button>
          <button
            type="button"
            onClick={() => setScope('all')}
            className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${
              scope === 'all' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="text-sm font-semibold text-slate-900">All {entityLabel}</div>
            <div className="text-xs text-slate-500 mt-0.5">Every record you have access to, ignoring filters</div>
          </button>
        </div>

        <button
          onClick={handleExport}
          disabled={exporting}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold shadow-sm"
        >
          <Download className="h-4 w-4" />
          {exporting ? 'Exporting…' : 'Export'}
        </button>
      </div>
    </div>
  );
};
