import { createClient } from '@supabase/supabase-js';
// NOTE: src/types/database.ts holds the real, generated schema types (see
// AUDIT.md). Wiring createClient(...) surfaces ~93 pre-existing
// interface/schema mismatches across most pages (Inventory, Employees,
// Projects, Followups, etc.) — real bugs, but out of scope to fix in one
// pass. Turn this on page-by-page as each page is repaired.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase environment variables (VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY) are missing.'
  );
}

// supabase-js coordinates auth (token refresh, sign-in/out) across tabs of
// the same origin using the browser's navigator.locks API. That lock is
// only released when the holding tab's JS context ends — if a tab ever
// gets stuck (frozen, or running old code from before a fix), it can hold
// the lock forever, and every OTHER tab for this origin — including a
// freshly reloaded one — queues behind it indefinitely. This is what
// caused the "spinner / reload, spinner / reload" loop: each reload just
// re-queued behind the same permanently-stuck lock. Wrapping the lock
// request with a hard timeout means THIS tab gives up waiting after 8s
// and proceeds anyway, regardless of what any other tab is doing — so a
// reload is now actually enough to recover, no need to hunt down and
// close whatever tab is stuck.
const timeBoxedLock = async <R,>(name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
  if (typeof navigator === 'undefined' || !navigator.locks) return fn();
  try {
    return await navigator.locks.request(name, { signal: AbortSignal.timeout(8000) }, () => fn());
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.warn(`[auth] Timed out waiting for the "${name}" lock (likely an orphaned tab elsewhere) — proceeding without it.`);
      return fn();
    }
    throw err;
  }
};

export const supabase = createClient(
  supabaseUrl || 'https://placeholder-url.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  { auth: { lock: timeBoxedLock } }
);
