-- Migration to add financial charges breakdown to the public.bookings table

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS consideration_amount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS gst_amount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS stamp_duty NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS registration_charges NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS development_charges NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS maintenance_charges NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS other_charges NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS parking_charges NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS total_additional_charges NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS total_payable_amount NUMERIC NOT NULL DEFAULT 0;

-- Backfill existing records: 
-- 1. Set consideration_amount from booking_amount if it is currently 0.
-- 2. Calculate total_additional_charges and total_payable_amount.
UPDATE public.bookings
SET 
  consideration_amount = COALESCE(booking_amount, 0),
  gst_amount = 0,
  stamp_duty = 0,
  registration_charges = 0,
  development_charges = 0,
  maintenance_charges = 0,
  other_charges = 0,
  parking_charges = 0,
  total_additional_charges = 0,
  total_payable_amount = COALESCE(booking_amount, 0)
WHERE total_payable_amount = 0 OR total_payable_amount IS NULL;
