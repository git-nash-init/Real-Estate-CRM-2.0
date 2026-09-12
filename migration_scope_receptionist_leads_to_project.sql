-- Fixes: a receptionist assigned to only one project (e.g. APR Realty) could
-- still see every lead across every project in the Leads directory. The
-- leads_select policy's receptionist clause was unconditional --
-- current_user_has_role(ARRAY['receptionist']) -- with no project-access
-- check, unlike every other clause in this policy. Scoping it to
-- has_project_access(project_id) matches how site_head and the is_own_lead
-- carve-out already work.
--
-- Run this in the Supabase Dashboard SQL Editor (Claude's direct DB
-- connection isn't available this session).

DROP POLICY IF EXISTS leads_select ON public.leads;
CREATE POLICY leads_select ON public.leads
  FOR SELECT
  TO public
  USING (
    is_super_admin()
    OR (current_user_has_role(ARRAY['receptionist']) AND has_project_access(project_id))
    OR (owner_id = auth.uid())
    OR (sourcing_manager_id = auth.uid())
    OR (telecaller_id = auth.uid())
    OR (created_by = auth.uid())
    OR (channel_partner_id = get_current_channel_partner_id())
    OR ((is_own_lead = true) AND current_user_has_role(ARRAY['site_head']))
    OR (current_user_has_role(ARRAY['site_head']) AND has_project_access(project_id))
    OR ((is_own_lead = true) AND has_project_access(project_id))
  );

NOTIFY pgrst, 'reload schema';
