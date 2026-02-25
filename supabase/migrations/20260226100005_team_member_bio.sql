-- ============================================================
-- Add bio and linkedin_url to team_member
-- ============================================================

ALTER TABLE public.team_member
ADD COLUMN bio TEXT,
ADD COLUMN linkedin_url TEXT;