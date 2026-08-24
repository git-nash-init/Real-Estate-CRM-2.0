/**
 * Central reporting point for Supabase query failures.
 *
 * Before this existed, every page swallowed its errors:
 *
 *   if (err) { console.warn('Commissions query warning:', err.message); }
 *   else { setList(data || []); }
 *
 * A missing table therefore rendered as a normal, empty list — which is why
 * broken screens were indistinguishable from screens with no data. Errors are
 * now routed here so they surface in the UI instead of only the console.
 */

export interface QueryFailure {
  id: number;
  /** Human label for where it broke, e.g. 'Channel Partner commissions'. */
  context: string;
  message: string;
  /** PostgREST code — PGRST205 means the table is absent from the schema cache. */
  code?: string;
  hint?: string;
  at: Date;
}

type Listener = (failures: QueryFailure[]) => void;

let failures: QueryFailure[] = [];
let listeners: Listener[] = [];
let nextId = 1;

const emit = () => {
  const snapshot = failures;
  listeners.forEach((l) => l(snapshot));
};

/** Subscribe to the failure list. Returns an unsubscribe function. */
export const subscribeToQueryFailures = (listener: Listener): (() => void) => {
  listeners.push(listener);
  listener(failures);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
};

export const clearQueryFailures = () => {
  failures = [];
  emit();
};

export const dismissQueryFailure = (id: number) => {
  failures = failures.filter((f) => f.id !== id);
  emit();
};

/**
 * Record a failed Supabase call. Accepts the raw PostgrestError (or any Error)
 * so call sites stay a one-line swap from the old console.warn.
 */
export const reportQueryError = (context: string, error: unknown): void => {
  if (!error) return;

  const err = error as { message?: string; code?: string; hint?: string };
  const message = err.message || String(error);

  // Missing tables are the dominant failure mode in this codebase; name them
  // explicitly so the cause is obvious without decoding PostgREST codes.
  const isMissingTable =
    err.code === 'PGRST205' || /Could not find the table/i.test(message);

  const failure: QueryFailure = {
    id: nextId++,
    context,
    message: isMissingTable ? `${message} (this table does not exist)` : message,
    code: err.code,
    hint: err.hint,
    at: new Date(),
  };

  // Keep the console line too — useful when the overlay is dismissed.
  console.error(`[query] ${context}:`, message, err.code ? `(${err.code})` : '');

  failures = [...failures, failure].slice(-25);
  emit();
};
