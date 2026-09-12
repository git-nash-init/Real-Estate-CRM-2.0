-- Fixes: closing_manager_tl couldn't edit leads at all, even ones they
-- own (Allocated To). leads_update_closing_manager only covered the
-- literal 'closing_manager' role -- closing_manager_tl was missed, even
-- though every other closing_manager permission elsewhere already
-- includes the TL variant. Reported live: the closing manager for a
-- project (whose actual role is closing_manager_tl) couldn't edit leads.
-- Run this in your Supabase Dashboard SQL Editor.

DROP POLICY IF EXISTS leads_update_closing_manager ON public.leads;

CREATE POLICY leads_update_closing_manager ON public.leads
  FOR UPDATE
  TO authenticated
  USING (current_user_has_role(ARRAY['closing_manager', 'closing_manager_tl']))
  WITH CHECK (current_user_has_role(ARRAY['closing_manager', 'closing_manager_tl']));
