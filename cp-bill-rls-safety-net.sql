-- Run this in Supabase Dashboard -> SQL Editor if a Channel Partner sees
-- "Failed to generate the commission bill" when clicking the download
-- button. These policies are additive (Postgres OR's same-command RLS
-- policies together) -- safe to run even if equivalent access already
-- exists elsewhere.

-- Let a Channel Partner read their own commission records (needed for the
-- brokerage %/amount on the bill).
DROP POLICY IF EXISTS cp_commissions_select_own_cp ON public.cp_commissions;
CREATE POLICY cp_commissions_select_own_cp ON public.cp_commissions
  FOR SELECT TO authenticated
  USING (
    cp_id IN (SELECT id FROM public.channel_partners WHERE user_id = auth.uid())
  );

-- Let a Channel Partner read the project details for any booking they're
-- attributed to (needed for the bill's "To" / developer section).
DROP POLICY IF EXISTS projects_select_own_cp_bookings ON public.projects;
CREATE POLICY projects_select_own_cp_bookings ON public.projects
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT project_id FROM public.bookings b
      JOIN public.channel_partners cp ON cp.id = b.channel_partner_id
      WHERE cp.user_id = auth.uid()
    )
  );
