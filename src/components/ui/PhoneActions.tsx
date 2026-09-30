import React, { useState } from 'react';
import { Phone, MessageCircle, Copy, Check } from 'lucide-react';

/**
 * Inline call / WhatsApp / copy icon cluster next to a phone number cell.
 * Reuses each page's own WhatsApp-open logic via `onWhatsApp` rather than
 * re-implementing it -- pass the same handler the page's existing WhatsApp
 * button already calls (e.g. Leads.tsx's `openWhatsApp`). If a page has no
 * WhatsApp compose flow yet, omit `onWhatsApp` and that icon is skipped.
 */
export const PhoneActions: React.FC<{
  phone: string | null | undefined;
  onWhatsApp?: () => void;
  className?: string;
}> = ({ phone, onWhatsApp, className = '' }) => {
  const [copied, setCopied] = useState(false);

  if (!phone) return <span className="text-slate-400 text-xs">—</span>;

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable -- silently no-op, nothing else to fall back to here
    }
  };

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="text-sm text-slate-700 font-medium tabular-nums">{phone}</span>
      <a
        href={`tel:${phone}`}
        onClick={(e) => e.stopPropagation()}
        className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
        title="Call"
      >
        <Phone className="h-3.5 w-3.5" />
      </a>
      {onWhatsApp && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onWhatsApp(); }}
          className="p-1 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
          title="WhatsApp"
        >
          <MessageCircle className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={handleCopy}
        className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        title="Copy number"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
};
