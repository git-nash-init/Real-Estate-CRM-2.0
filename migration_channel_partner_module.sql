-- Idempotent Migration for Channel Partner Module (CRM Integration)

-- 1. Upgrade existing channel_partners table with missing columns
ALTER TABLE public.channel_partners ADD COLUMN IF NOT EXISTS cp_code TEXT UNIQUE;
ALTER TABLE public.channel_partners ADD COLUMN IF NOT EXISTS partner_name TEXT;
ALTER TABLE public.channel_partners ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE public.channel_partners ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.channel_partners ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.channel_partners ADD COLUMN IF NOT EXISTS pincode TEXT;
ALTER TABLE public.channel_partners ADD COLUMN IF NOT EXISTS valid_from DATE;
ALTER TABLE public.channel_partners ADD COLUMN IF NOT EXISTS valid_to DATE;
ALTER TABLE public.channel_partners ADD COLUMN IF NOT EXISTS rera_valid_from DATE;
ALTER TABLE public.channel_partners ADD COLUMN IF NOT EXISTS rera_valid_to DATE;
ALTER TABLE public.channel_partners ADD COLUMN IF NOT EXISTS pan_number TEXT;
ALTER TABLE public.channel_partners ADD COLUMN IF NOT EXISTS gst_number TEXT;
ALTER TABLE public.channel_partners ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.channel_partners ADD COLUMN IF NOT EXISTS bank_account_name TEXT;
ALTER TABLE public.channel_partners ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE public.channel_partners ADD COLUMN IF NOT EXISTS bank_ifsc TEXT;
ALTER TABLE public.channel_partners ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.channel_partners ADD COLUMN IF NOT EXISTS commission_type TEXT DEFAULT 'PERCENTAGE';
ALTER TABLE public.channel_partners ADD COLUMN IF NOT EXISTS commission_value NUMERIC DEFAULT 0;
ALTER TABLE public.channel_partners ADD COLUMN IF NOT EXISTS default_commission_rate NUMERIC DEFAULT 0;
ALTER TABLE public.channel_partners ADD COLUMN IF NOT EXISTS default_commission_amount NUMERIC DEFAULT 0;

-- Ensure indexes exist on channel_partners columns
CREATE INDEX IF NOT EXISTS idx_cp_status ON public.channel_partners(status);
CREATE INDEX IF NOT EXISTS idx_cp_code ON public.channel_partners(cp_code);
CREATE INDEX IF NOT EXISTS idx_cp_partner_code ON public.channel_partners(partner_code);

-- 2. Create channel_partner_projects table for project-wise settings
CREATE TABLE IF NOT EXISTS public.channel_partner_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_partner_id UUID NOT NULL REFERENCES public.channel_partners(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  commission_type TEXT DEFAULT 'PERCENTAGE',
  commission_rate NUMERIC DEFAULT 0,
  commission_amount NUMERIC DEFAULT 0,
  effective_from DATE,
  effective_to DATE,
  status TEXT DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_cp_project_link UNIQUE (channel_partner_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_cpp_partner ON public.channel_partner_projects(channel_partner_id);
CREATE INDEX IF NOT EXISTS idx_cpp_project ON public.channel_partner_projects(project_id);

-- 3. Create channel_partner_commissions table
CREATE TABLE IF NOT EXISTS public.channel_partner_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_partner_id UUID NOT NULL REFERENCES public.channel_partners(id) ON DELETE CASCADE,
  booking_id UUID UNIQUE NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  customer_id UUID,
  commission_type TEXT NOT NULL,
  commission_rate NUMERIC DEFAULT 0,
  commission_base_amount NUMERIC DEFAULT 0,
  commission_amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'PENDING',
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpcom_partner ON public.channel_partner_commissions(channel_partner_id);
CREATE INDEX IF NOT EXISTS idx_cpcom_booking ON public.channel_partner_commissions(booking_id);
CREATE INDEX IF NOT EXISTS idx_cpcom_project ON public.channel_partner_commissions(project_id);
CREATE INDEX IF NOT EXISTS idx_cpcom_status ON public.channel_partner_commissions(status);

-- 4. Create commission_payments table
CREATE TABLE IF NOT EXISTS public.commission_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_partner_id UUID NOT NULL REFERENCES public.channel_partners(id) ON DELETE CASCADE,
  commission_id UUID NOT NULL REFERENCES public.channel_partner_commissions(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_mode TEXT NOT NULL,
  reference_number TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copay_partner ON public.commission_payments(channel_partner_id);
CREATE INDEX IF NOT EXISTS idx_copay_commission ON public.commission_payments(commission_id);

-- 5. Add nullable Channel Partner foreign keys to Leads, Site Visits, and Bookings tables
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS channel_partner_id UUID REFERENCES public.channel_partners(id) ON DELETE SET NULL;
ALTER TABLE public.site_visits ADD COLUMN IF NOT EXISTS channel_partner_id UUID REFERENCES public.channel_partners(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS channel_partner_id UUID REFERENCES public.channel_partners(id) ON DELETE SET NULL;

-- Indexes for CP references in transactional tables
CREATE INDEX IF NOT EXISTS idx_leads_cp ON public.leads(channel_partner_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_cp ON public.site_visits(channel_partner_id);
CREATE INDEX IF NOT EXISTS idx_bookings_cp ON public.bookings(channel_partner_id);

-- 6. Basic RLS policies configuration
ALTER TABLE public.channel_partner_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_partner_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_payments ENABLE ROW LEVEL SECURITY;

-- Setup RLS Policies to allow access to authenticated users
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'policy_cp_proj_auth') THEN
    CREATE POLICY policy_cp_proj_auth ON public.channel_partner_projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'policy_cp_comm_auth') THEN
    CREATE POLICY policy_cp_comm_auth ON public.channel_partner_commissions FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'policy_cp_pay_auth') THEN
    CREATE POLICY policy_cp_pay_auth ON public.commission_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END
$$;
