CREATE POLICY "cp_commission_payouts_insert" ON "public"."cp_commission_payouts"
AS PERMISSIVE FOR INSERT
TO public
WITH CHECK (is_super_admin() OR current_user_has_role(ARRAY['project_admin'::text, 'site_head'::text]));
