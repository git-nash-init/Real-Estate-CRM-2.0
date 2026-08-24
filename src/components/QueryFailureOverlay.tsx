import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { subscribeToQueryFailures, dismissQueryFailure, type QueryFailure } from '../services/queryLogger';

/**
 * Dev-visible banner stack for Supabase query failures. Mounted once in
 * AppLayout so every page benefits without wiring per-page state.
 *
 * Only rendered in development (import.meta.env.DEV) — in production these
 * still hit console.error via queryLogger, but we don't want end users
 * staring at raw PostgREST error text. Swap in real toast/monitoring
 * integration for prod later (see AUDIT.md).
 */
export const QueryFailureOverlay: React.FC = () => {
  const [failures, setFailures] = useState<QueryFailure[]>([]);

  useEffect(() => subscribeToQueryFailures(setFailures), []);

  if (!import.meta.env.DEV || failures.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] w-full max-w-md space-y-2">
      {failures.slice(-5).map((f) => (
        <div
          key={f.id}
          className="flex items-start gap-3 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 shadow-lg"
        >
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-rose-600 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-rose-800">{f.context}</p>
            <p className="text-xs text-rose-700 break-words">{f.message}</p>
            {f.code && <p className="text-[10px] text-rose-500 mt-0.5">code: {f.code}</p>}
          </div>
          <button
            onClick={() => dismissQueryFailure(f.id)}
            className="text-rose-400 hover:text-rose-700 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
