BEGIN;

DROP POLICY IF EXISTS "leads_select" ON "public"."leads";

CREATE POLICY "leads_select" ON "public"."leads"
FOR SELECT USING (
  is_super_admin() 
  OR current_user_has_role(ARRAY['receptionist'::text]) 
  OR (owner_id = auth.uid()) 
  OR (sourcing_manager_id = auth.uid()) 
  OR (telecaller_id = auth.uid()) 
  OR (created_by = auth.uid()) 
  OR (channel_partner_id = get_current_channel_partner_id()) 
  OR ((is_own_lead = true) AND current_user_has_role(ARRAY['site_head'::text]))
  OR (current_user_has_role(ARRAY['site_head'::text]) AND has_project_access(project_id))
);

COMMIT;
