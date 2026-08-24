-- Safe, Idempotent Migration to update the employees table
-- Run this script in your Supabase Dashboard SQL Editor.

-- 1. Add resigned value to public.employment_status enum if it does not exist
ALTER TYPE public.employment_status ADD VALUE IF NOT EXISTS 'resigned';

-- 2. Add missing columns to public.employees table
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS employee_id TEXT UNIQUE;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS profile_photo TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS alternate_mobile TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS personal_email TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'Full Time';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS branch TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS pincode TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS notes TEXT;

-- 3. Ensure Super Admin profile exists in public.user_profiles
INSERT INTO public.user_profiles (id, full_name, email, status)
SELECT 
    id, 
    COALESCE(raw_user_meta_data->>'full_name', 'Super Admin'), 
    email, 
    'active'
FROM auth.users
WHERE id = '53812816-2e5f-4909-8163-2261cb2013bd'
ON CONFLICT (id) DO UPDATE 
SET full_name = EXCLUDED.full_name, email = EXCLUDED.email;

-- 4. Ensure Super Admin role mapping exists in public.user_roles
INSERT INTO public.user_roles (user_id, role_id)
SELECT 
    '53812816-2e5f-4909-8163-2261cb2013bd',
    id
FROM public.roles
WHERE name = 'super_admin'
ON CONFLICT (user_id) DO NOTHING;

-- 5. Enable RLS on employees
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS Policy for employees
DROP POLICY IF EXISTS policy_employees_all ON public.employees;
CREATE POLICY policy_employees_all ON public.employees
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 7. Enable RLS and create policies on user_profiles
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS policy_user_profiles_all ON public.user_profiles;
CREATE POLICY policy_user_profiles_all ON public.user_profiles
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 8. Enable RLS and create policies on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS policy_user_roles_all ON public.user_roles;
CREATE POLICY policy_user_roles_all ON public.user_roles
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 9. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
