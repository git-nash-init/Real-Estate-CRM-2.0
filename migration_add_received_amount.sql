ALTER TABLE public.personal_expenses
ADD COLUMN IF NOT EXISTS received_amount numeric DEFAULT 0;
