-- ============================================================
-- Fix admin RLS: replace auth.role() = 'authenticated' with is_admin()
-- ============================================================
-- Problem: All "admin" policies currently grant access to ANY
-- authenticated user, including clients. This migration:
--   1. Creates an admin_users table
--   2. Creates an is_admin() function
--   3. Drops every permissive admin policy
--   4. Re-creates them using is_admin()
--   5. Leaves client-facing policies (auth.uid() = user_id) untouched
-- ============================================================

-- 1. Admin Users table
CREATE TABLE IF NOT EXISTS public.admin_users (
    admin_user_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID REFERENCES auth.users (id) ON DELETE CASCADE UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Only admins can view the admin list (bootstrapped by the function below)
CREATE POLICY "Admins can view admin_users" ON public.admin_users FOR
SELECT USING (
        auth.uid () IN (
            SELECT user_id
            FROM public.admin_users
        )
    );

-- 2. is_admin() function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
    );
$$;

-- 3. Seed admin_users from existing ADMIN_EMAILS
-- Maps hello@advo.ph, dev@advo.ph, test2@example.com to their auth.users UUIDs
INSERT INTO
    public.admin_users (user_id)
SELECT id
FROM auth.users
WHERE
    email IN (
        'hello@advo.ph',
        'dev@advo.ph',
        'test2@example.com'
    ) ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- 4. Drop all permissive admin policies
-- ============================================================

-- From 20260225100000_admin_rls.sql (project, client, progress_update)
DROP POLICY IF EXISTS "Admins can insert projects" ON public.project;

DROP POLICY IF EXISTS "Admins can delete projects" ON public.project;

DROP POLICY IF EXISTS "Admins can view all projects" ON public.project;

DROP POLICY IF EXISTS "Admins can view all clients" ON public.client;

DROP POLICY IF EXISTS "Admins can insert clients" ON public.client;

DROP POLICY IF EXISTS "Admins can update all clients" ON public.client;

DROP POLICY IF EXISTS "Admins can delete clients" ON public.client;

DROP POLICY IF EXISTS "Admins can insert progress updates" ON public.progress_update;

DROP POLICY IF EXISTS "Admins can view all progress updates" ON public.progress_update;

DROP POLICY IF EXISTS "Admins can delete progress updates" ON public.progress_update;

-- From 20260202_admin_dashboard.sql (team_member, deliverable, social_post)
DROP POLICY IF EXISTS "Authenticated users can view team members" ON public.team_member;

DROP POLICY IF EXISTS "Authenticated users can view deliverables" ON public.deliverable;

DROP POLICY IF EXISTS "Authenticated users can insert deliverables" ON public.deliverable;

DROP POLICY IF EXISTS "Authenticated users can update deliverables" ON public.deliverable;

DROP POLICY IF EXISTS "Authenticated users can delete deliverables" ON public.deliverable;

DROP POLICY IF EXISTS "Authenticated users can manage social posts" ON public.social_post;

-- From 20260225100001_leads_table.sql (lead)
DROP POLICY IF EXISTS "Authenticated users can view leads" ON public.lead;

DROP POLICY IF EXISTS "Authenticated users can update leads" ON public.lead;

DROP POLICY IF EXISTS "Authenticated users can delete leads" ON public.lead;

-- ============================================================
-- 5. Re-create all policies using is_admin()
-- ============================================================

-- ── Project ─────────────────────────────────────────────────
CREATE POLICY "Admins can view all projects" ON public.project FOR
SELECT USING (public.is_admin ());

CREATE POLICY "Admins can insert projects" ON public.project FOR
INSERT
WITH
    CHECK (public.is_admin ());

CREATE POLICY "Admins can delete projects" ON public.project FOR DELETE USING (public.is_admin ());

-- ── Client ──────────────────────────────────────────────────
CREATE POLICY "Admins can view all clients" ON public.client FOR
SELECT USING (public.is_admin ());

CREATE POLICY "Admins can insert clients" ON public.client FOR
INSERT
WITH
    CHECK (public.is_admin ());

CREATE POLICY "Admins can update all clients" ON public.client FOR
UPDATE USING (public.is_admin ());

CREATE POLICY "Admins can delete clients" ON public.client FOR DELETE USING (public.is_admin ());

-- ── Progress Update ─────────────────────────────────────────
CREATE POLICY "Admins can view all progress updates" ON public.progress_update FOR
SELECT USING (public.is_admin ());

CREATE POLICY "Admins can insert progress updates" ON public.progress_update FOR
INSERT
WITH
    CHECK (public.is_admin ());

CREATE POLICY "Admins can delete progress updates" ON public.progress_update FOR DELETE USING (public.is_admin ());

-- ── Team Member ─────────────────────────────────────────────
CREATE POLICY "Admins can view team members" ON public.team_member FOR
SELECT USING (public.is_admin ());

CREATE POLICY "Admins can insert team members" ON public.team_member FOR
INSERT
WITH
    CHECK (public.is_admin ());

CREATE POLICY "Admins can update team members" ON public.team_member FOR
UPDATE USING (public.is_admin ());

CREATE POLICY "Admins can delete team members" ON public.team_member FOR DELETE USING (public.is_admin ());

-- ── Deliverable ─────────────────────────────────────────────
CREATE POLICY "Admins can view deliverables" ON public.deliverable FOR
SELECT USING (public.is_admin ());

CREATE POLICY "Admins can insert deliverables" ON public.deliverable FOR
INSERT
WITH
    CHECK (public.is_admin ());

CREATE POLICY "Admins can update deliverables" ON public.deliverable FOR
UPDATE USING (public.is_admin ());

CREATE POLICY "Admins can delete deliverables" ON public.deliverable FOR DELETE USING (public.is_admin ());

-- ── Social Post ─────────────────────────────────────────────
CREATE POLICY "Admins can view social posts" ON public.social_post FOR
SELECT USING (public.is_admin ());

CREATE POLICY "Admins can insert social posts" ON public.social_post FOR
INSERT
WITH
    CHECK (public.is_admin ());

CREATE POLICY "Admins can update social posts" ON public.social_post FOR
UPDATE USING (public.is_admin ());

CREATE POLICY "Admins can delete social posts" ON public.social_post FOR DELETE USING (public.is_admin ());

-- ── Lead ────────────────────────────────────────────────────
-- Note: "Anyone can insert leads" policy stays untouched (public form)
CREATE POLICY "Admins can view leads" ON public.lead FOR
SELECT USING (public.is_admin ());

CREATE POLICY "Admins can update leads" ON public.lead FOR
UPDATE USING (public.is_admin ());

CREATE POLICY "Admins can delete leads" ON public.lead FOR DELETE USING (public.is_admin ());

-- ── Performance index ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON public.admin_users (user_id);