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

export const supabase = createClient(
  supabaseUrl || 'https://placeholder-url.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);
