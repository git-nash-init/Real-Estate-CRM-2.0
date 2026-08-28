-- Migration to allow Super Admins to hard delete records

-- 1. inventory
DROP POLICY IF EXISTS "Super admins can delete inventory" ON inventory;
CREATE POLICY "Super admins can delete inventory"
  ON inventory
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  );

-- 2. bookings
DROP POLICY IF EXISTS "Super admins can delete bookings" ON bookings;
CREATE POLICY "Super admins can delete bookings"
  ON bookings
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  );

-- 3. payments
DROP POLICY IF EXISTS "Super admins can delete payments" ON payments;
CREATE POLICY "Super admins can delete payments"
  ON payments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  );

-- 4. cp_commissions (Referral Fee Obligations)
DROP POLICY IF EXISTS "Super admins can delete cp_commissions" ON cp_commissions;
CREATE POLICY "Super admins can delete cp_commissions"
  ON cp_commissions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  );

-- 5. cp_payouts (Referral Fee Payouts)
DROP POLICY IF EXISTS "Super admins can delete cp_payouts" ON cp_payouts;
CREATE POLICY "Super admins can delete cp_payouts"
  ON cp_payouts
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  );

-- 6. channel_partners
DROP POLICY IF EXISTS "Super admins can delete channel_partners" ON channel_partners;
CREATE POLICY "Super admins can delete channel_partners"
  ON channel_partners
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  );

-- 7. quick_site_visits
DROP POLICY IF EXISTS "Super admins can delete quick_site_visits" ON quick_site_visits;
CREATE POLICY "Super admins can delete quick_site_visits"
  ON quick_site_visits
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  );

-- 8. projects
DROP POLICY IF EXISTS "Super admins can delete projects" ON projects;
CREATE POLICY "Super admins can delete projects"
  ON projects
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  );

-- 9. tasks
DROP POLICY IF EXISTS "Super admins can delete tasks" ON tasks;
CREATE POLICY "Super admins can delete tasks"
  ON tasks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  );
