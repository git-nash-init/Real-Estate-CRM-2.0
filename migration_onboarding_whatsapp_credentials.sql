-- Migration: Onboarding WhatsApp Credentials Enhancements
-- 1. Add whatsapp_number column to employees table if it does not exist
ALTER TABLE public.employees 
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

-- 2. Add user_id column to channel_partners table if it does not exist
ALTER TABLE public.channel_partners 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_channel_partners_user_id 
  ON public.channel_partners(user_id);
