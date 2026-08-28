-- ============================================================
-- Migration: Channel Partner Request/Approval Flow
-- Run this once in Supabase SQL Editor (project: umuctbiofbyjwnqavxus)
-- ============================================================

-- 1. Add whatsapp_number column to channel_partners (if not already present)
ALTER TABLE channel_partners
  ADD COLUMN IF NOT EXISTS whatsapp_number text;

-- 2. Create channel_partner_requests table
CREATE TABLE IF NOT EXISTS channel_partner_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_by_name   text,
  partner_name        text NOT NULL,
  company_name        text,
  contact_person      text,
  phone               text NOT NULL,
  whatsapp_number     text,
  email               text,
  address             text,
  city                text,
  state               text,
  pincode             text,
  rera_number         text,
  pan_number          text,
  gst_number          text,
  notes               text,
  project_ids         uuid[],
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason    text,
  reviewed_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 3. Enable RLS on the new table
ALTER TABLE channel_partner_requests ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Any authenticated user can INSERT their own request
CREATE POLICY "cp_requests_insert" ON channel_partner_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = submitted_by OR submitted_by IS NULL);

-- Any authenticated user can read all pending requests
-- (super_admin/site_head need to see all; others see their own)
CREATE POLICY "cp_requests_select_own" ON channel_partner_requests
  FOR SELECT
  TO authenticated
  USING (
    submitted_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND r.name IN ('super_admin', 'site_head')
    )
  );

-- Only super_admin and site_head can UPDATE (approve/reject)
CREATE POLICY "cp_requests_update_admins" ON channel_partner_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND r.name IN ('super_admin', 'site_head')
    )
  )
  WITH CHECK (true);

-- 5. Enable Realtime on channel_partner_requests
ALTER TABLE channel_partner_requests REPLICA IDENTITY FULL;

-- Done.
