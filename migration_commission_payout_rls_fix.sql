-- Safe, Idempotent Migration to fix RLS policies for cp_commissions and cp_commission_payouts
-- Run this script in your Supabase Dashboard SQL Editor.

-- 1. Enable RLS on both tables
ALTER TABLE public.cp_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cp_commission_payouts ENABLE ROW LEVEL SECURITY;

-- 2. Drop any potentially conflicting policies on these tables
DROP POLICY IF EXISTS policy_cp_commissions_all ON public.cp_commissions;
DROP POLICY IF EXISTS policy_cp_commission_payouts_all ON public.cp_commission_payouts;
DROP POLICY IF EXISTS policy_cp_comm_link_all ON public.cp_commissions;
DROP POLICY IF EXISTS policy_cp_pay_link_all ON public.cp_commission_payouts;

-- 3. Create RLS Policies to allow authenticated users full read/write access (matching other tables)
CREATE POLICY policy_cp_commissions_all ON public.cp_commissions
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY policy_cp_commission_payouts_all ON public.cp_commission_payouts
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
