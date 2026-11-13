import React, { useState } from 'react';

export const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100] as const;

/**
 * Rows-per-page state that remembers the choice per page (localStorage,
 * wrapped in try/catch so a blocked/private-mode browser just falls back to
 * the default of 10). Returns [pageSize, setPageSize].
 */
export function usePageSize(storageKey: string, initial = 10): [number, (n: number) => void] {
  const key = `pageSize:${storageKey}`;
  const [size, setSize] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(key));
      return (PAGE_SIZE_OPTIONS as readonly number[]).includes(saved) ? saved : initial;
    } catch {
      return initial;
    }
  });
  const update = (n: number) => {
    setSize(n);
    try { localStorage.setItem(key, String(n)); } catch { /* ignore */ }
  };
  return [size, update];
}

/** "Rows: [10 v]" dropdown for a pagination footer. The page resets itself via onChange. */
export const PageSizeSelect: React.FC<{
  value: number;
  onChange: (n: number) => void;
}> = ({ value, onChange }) => (
  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mr-2">
    Rows
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
    >
      {PAGE_SIZE_OPTIONS.map((n) => (
        <option key={n} value={n}>{n}</option>
      ))}
    </select>
  </label>
);
