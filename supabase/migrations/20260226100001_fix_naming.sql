-- ============================================================
-- Fix naming: admin_users → admin_user (ADVO Standard: singular naming)
-- ============================================================

-- 1. Drop policies that reference the old table name
DROP POLICY IF EXISTS "Admins can view admin_users" ON public.admin_users;

-- 2. Rename the table
ALTER TABLE public.admin_users RENAME TO admin_user;

-- 3. Rename the PK column to match (already correct: admin_user_id)
-- No change needed — admin_user_id already follows the convention.

-- 4. Rename the index
ALTER INDEX IF EXISTS idx_admin_users_user_id
RENAME TO idx_admin_user_user_id;

-- 5. Re-create the RLS policy with the correct table name
CREATE POLICY "Admins can view admin_user" ON public.admin_user FOR
SELECT USING (
        auth.uid () IN (
            SELECT user_id
            FROM public.admin_user
        )
    );

-- 6. Update is_admin() to reference admin_user (singular)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_user WHERE user_id = auth.uid()
    );
$$;