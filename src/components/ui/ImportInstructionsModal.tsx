import React from 'react';
import { HelpCircle, X } from 'lucide-react';

export interface ImportFieldSpec {
  field: string;
  required: boolean;
  example: string;
}

/**
 * Reusable "how to format your import file" info modal -- a clean
 * field-requirements table, driven entirely by props so any page's import
 * flow (e.g. BulkUploadModal.tsx) can wire it up next to its existing
 * "Download Template" button without duplicating this table shell.
 */
export const ImportInstructionsModal: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: string;
  fields: ImportFieldSpec[];
}> = ({ open, onClose, title = 'Import Instructions', fields }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <HelpCircle className="h-5 w-5 text-indigo-600" />
            <div>
              <h3 className="text-base font-bold text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500 mt-0.5">Format your file with these supported columns.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                <th className="pb-2 pr-3">Column</th>
                <th className="pb-2 pr-3">Required</th>
                <th className="pb-2">Example</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.field} className="border-t border-slate-100">
                  <td className="py-2.5 pr-3 font-mono text-xs text-slate-800">{f.field}</td>
                  <td className="py-2.5 pr-3">
                    {f.required ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        Required
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Optional</span>
                    )}
                  </td>
                  <td className="py-2.5 text-xs text-slate-600">{f.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
