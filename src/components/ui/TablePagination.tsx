import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageSizeSelect } from './PageSizeSelect';

/**
 * Footer for tables that already hold every row in memory (no server
 * paging): "Showing X to Y of N", Rows selector, Prev/Next. Pair with
 * `paginate()` below. Page is clamped, so a filter that shrinks the list
 * can never leave you stranded on a page that no longer exists.
 */
export function paginate<T>(rows: T[], page: number, pageSize: number) {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  return { pageRows: rows.slice(safePage * pageSize, (safePage + 1) * pageSize), safePage, pages };
}

export const TablePagination: React.FC<{
  total: number;
  page: number; // already clamped (use safePage from paginate())
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
  label?: string;
}> = ({ total, page, pageSize, onPage, onPageSize, label = 'records' }) => {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);
  return (
    <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs font-medium text-slate-500">
        Showing <span className="font-semibold text-slate-800">{start}</span> to{' '}
        <span className="font-semibold text-slate-800">{end}</span> of{' '}
        <span className="font-semibold text-slate-800">{total}</span> {label}
      </span>
      <div className="flex items-center space-x-2">
        <PageSizeSelect value={pageSize} onChange={(n) => { onPageSize(n); onPage(0); }} />
        <button
          onClick={() => onPage(Math.max(page - 1, 0))}
          disabled={page === 0}
          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs font-semibold text-slate-700">Page {page + 1} of {pages}</span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page + 1 >= pages}
          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
