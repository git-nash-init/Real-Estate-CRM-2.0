-- Fix delete policies for leads table to allow owners and super admins to delete leads

DROP POLICY IF EXISTS "leads_delete" ON public.leads;

CREATE POLICY "leads_delete"
  ON public.leads
  FOR DELETE
  USING (
    owner_id = auth.uid() OR
    has_project_access(project_id) OR
    is_super_admin() OR
    current_user_has_role(ARRAY['project_admin'::text, 'site_head'::text]) OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND r.name = 'super_admin'
    )
  );
