-- Safe, Idempotent Migration to enable RLS on the followups table
-- Run this script in your Supabase Dashboard SQL Editor.

-- 1. Enable RLS on the table
ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY;

-- 2. Drop any potentially conflicting policies on this table
DROP POLICY IF EXISTS policy_followups_all ON public.followups;

-- 3. Create RLS Policy to allow authenticated users full read/write access (matching other tables)
CREATE POLICY policy_followups_all ON public.followups
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
