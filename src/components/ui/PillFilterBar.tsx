import React from 'react';

export interface PillFilterOption {
  value: string;
  label: string;
  count: number;
}

/**
 * Rounded pill-style filter chips with a live count badge, replacing a
 * plain `<select>` for small fixed-enum filters (e.g. lead/booking status).
 * Purely presentational -- the page keeps owning the active-value state and
 * the logic that computes each option's count from its already-fetched rows.
 */
export const PillFilterBar: React.FC<{
  options: PillFilterOption[];
  active: string;
  onChange: (value: string) => void;
  className?: string;
}> = ({ options, active, onChange, className = '' }) => (
  <div className={`flex flex-wrap items-center gap-2 ${className}`}>
    {options.map((opt) => {
      const isActive = opt.value === active;
      return (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            isActive
              ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
          }`}
        >
          <span>{opt.label}</span>
          <span
            className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-[11px] font-bold ${
              isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {opt.count}
          </span>
        </button>
      );
    })}
  </div>
);
