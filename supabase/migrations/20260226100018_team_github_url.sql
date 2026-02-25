-- Add github_url to team_member for social links
ALTER TABLE public.team_member
ADD COLUMN IF NOT EXISTS github_url TEXT;