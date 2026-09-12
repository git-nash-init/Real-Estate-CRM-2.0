-- Grants closing_manager UPDATE access on leads (edit lead details + add
-- remarks), matching the frontend's canEditLeadRecord change.
-- Safe to run regardless of the existing leads_update policy's exact
-- definition -- Postgres OR's multiple permissive policies for the same
-- command together, so this only ever ADDS access, never narrows it.
-- Run this in your Supabase Dashboard SQL Editor.

DROP POLICY IF EXISTS leads_update_closing_manager ON public.leads;

CREATE POLICY leads_update_closing_manager ON public.leads
  FOR UPDATE
  TO authenticated
  USING (current_user_has_role(ARRAY['closing_manager']))
  WITH CHECK (current_user_has_role(ARRAY['closing_manager']));

NOTIFY pgrst, 'reload schema';
