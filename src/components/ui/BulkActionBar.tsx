import React from 'react';

/**
 * Checkbox-header cell for a table's <th>, toggling every currently-visible
 * row id. Purely presentational -- the page owns `selectedIds`.
 */
export const BulkSelectHeaderCell: React.FC<{
  allIds: string[];
  selectedIds: Set<string>;
  onToggleAll: (ids: string[], checked: boolean) => void;
}> = ({ allIds, selectedIds, onToggleAll }) => {
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = allIds.some((id) => selectedIds.has(id));
  return (
    <th className="w-10 px-3">
      <input
        type="checkbox"
        checked={allSelected}
        ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
        onChange={(e) => onToggleAll(allIds, e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
    </th>
  );
};

export const BulkSelectCell: React.FC<{
  id: string;
  selectedIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
}> = ({ id, selectedIds, onToggle }) => (
  <td className="w-10 px-3">
    <input
      type="checkbox"
      checked={selectedIds.has(id)}
      onChange={(e) => onToggle(id, e.target.checked)}
      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
    />
  </td>
);

/**
 * Sticky "N selected · Actions · Cancel" bar. Only render actions the page
 * already permission-gates per row -- this bar never grants a role an
 * action it couldn't already reach one row at a time.
 */
export const BulkActionBar: React.FC<{
  count: number;
  onCancel: () => void;
  actions: { label: string; onClick: () => void; danger?: boolean }[];
}> = ({ count, onCancel, actions }) => {
  if (count === 0) return null;
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-indigo-600 text-white rounded-xl px-4 py-2.5 mb-3 shadow-sm">
      <span className="text-sm font-semibold">{count} selected</span>
      <div className="flex items-center gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={a.onClick}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              a.danger ? 'bg-rose-500 hover:bg-rose-400' : 'bg-white/15 hover:bg-white/25'
            }`}
          >
            {a.label}
          </button>
        ))}
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/15 hover:bg-white/25"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
