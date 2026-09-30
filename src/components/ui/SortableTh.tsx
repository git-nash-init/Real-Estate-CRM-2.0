import React from 'react';
import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';

export type SortDirection = 'asc' | 'desc';

/**
 * Drop-in replacement for a static `<th>` on a client-sorted table. The page
 * keeps owning `sortKey`/`sortDirection` state and its own comparator --
 * this component is purely the clickable label + arrow icon, so no page's
 * existing row data/fetching changes, only how the header renders.
 *
 * Usage:
 *   const [sortKey, setSortKey] = useState<string | null>(null);
 *   const [sortDir, setSortDir] = useState<SortDirection>('asc');
 *   const toggleSort = (key: string) => {
 *     if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
 *     else { setSortKey(key); setSortDir('asc'); }
 *   };
 *   <SortableTh label="Lead Name" active={sortKey === 'name'} direction={sortDir} onClick={() => toggleSort('name')} />
 */
export const SortableTh: React.FC<{
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  className?: string;
}> = ({ label, active, direction, onClick, className = '' }) => (
  <th
    onClick={onClick}
    className={`select-none cursor-pointer group ${className}`}
  >
    <span className="inline-flex items-center gap-1 hover:text-slate-700">
      {label}
      {active ? (
        direction === 'asc' ? (
          <ArrowUp className="h-3.5 w-3.5 text-indigo-600" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5 text-indigo-600" />
        )
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5 text-slate-350 opacity-0 group-hover:opacity-100" />
      )}
    </span>
  </th>
);

/** Generic comparator helper for the common case (string/number/date-ish values, nulls last). */
export function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const as = String(a);
  const bs = String(b);
  return as.localeCompare(bs, undefined, { numeric: true, sensitivity: 'base' });
}
