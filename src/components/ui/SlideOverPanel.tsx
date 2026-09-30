import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Right-edge slide-over drawer shell. Replaces a page's hand-rolled
 * `fixed inset-0 ... flex items-center justify-center` centered modal --
 * the page's existing form JSX moves into `children` unchanged, only the
 * outer shell (position, backdrop, close behavior) changes.
 *
 * Closes on Escape and on backdrop click; scroll body internally so long
 * forms don't push the header/footer off-screen.
 */
export const SlideOverPanel: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: string; // tailwind max-w-* class, defaults to a comfortable form width
  footer?: React.ReactNode;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, width = 'max-w-xl', footer, children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] animate-[fadeIn_.15s_ease-out]"
        onClick={onClose}
      />
      <div
        className={`relative h-full w-full ${width} bg-white shadow-2xl flex flex-col animate-[slideIn_.2s_ease-out]`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-200 shrink-0">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="px-6 py-4 border-t border-slate-200 shrink-0 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

/** Simple bottom-border tab strip, matching the visual already used for Leads' "Leads Directory / Own Leads" toggle. */
export const SlideOverTabs: React.FC<{
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}> = ({ tabs, active, onChange }) => (
  <div className="flex items-center gap-5 border-b border-slate-200 mb-5 -mt-1">
    {tabs.map((tab) => (
      <button
        key={tab.key}
        type="button"
        onClick={() => onChange(tab.key)}
        className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors ${
          active === tab.key
            ? 'border-indigo-600 text-indigo-600'
            : 'border-transparent text-slate-500 hover:text-slate-700'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </div>
);
