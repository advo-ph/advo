-- ============================================================
-- RBAC: Team access & per-project permissions
-- ============================================================
-- 1. Link team_member to auth.users (nullable — not every member
--    needs a login immediately)
-- 2. Add permission_role enum for access-control role
-- 3. Create project_access table for per-project permissions
-- 4. RLS: admins can do everything; team members can see their own
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────

CREATE TYPE public.team_permission_role AS ENUM (
    'admin',
    'developer',
    'designer',
    'manager'
);

CREATE TYPE public.project_permission_level AS ENUM (
    'read',
    'write',
    'admin'
);

-- ── Alter team_member ───────────────────────────────────────

ALTER TABLE public.team_member
ADD COLUMN user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
ADD COLUMN permission_role public.team_permission_role;

-- Index for looking up team_member by auth user
CREATE INDEX idx_team_member_user_id ON public.team_member (user_id);

-- ── project_access ──────────────────────────────────────────

CREATE TABLE public.project_access (
    project_access_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    team_member_id BIGINT NOT NULL REFERENCES public.team_member (team_member_id) ON DELETE CASCADE,
    project_id BIGINT NOT NULL REFERENCES public.project (project_id) ON DELETE CASCADE,
    permission_level public.project_permission_level NOT NULL DEFAULT 'read',
    granted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE (team_member_id, project_id)
);

-- Performance indices
CREATE INDEX idx_project_access_team_member_id ON public.project_access (team_member_id);

CREATE INDEX idx_project_access_project_id ON public.project_access (project_id);

-- ── RLS on project_access ───────────────────────────────────

ALTER TABLE public.project_access ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage project_access" ON public.project_access FOR ALL USING (public.is_admin ())
WITH
    CHECK (public.is_admin ());

-- Team members can see their own access rows
CREATE POLICY "Team members can view own project_access" ON public.project_access FOR
SELECT USING (
        team_member_id IN (
            SELECT team_member_id
            FROM public.team_member
            WHERE
                user_id = auth.uid ()
        )
    );