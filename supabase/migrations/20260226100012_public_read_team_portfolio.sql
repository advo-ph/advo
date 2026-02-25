-- ============================================================
-- Allow public (anon) read access to team_member and
-- portfolio_project for the landing page / team page.
-- ============================================================

-- Public can view active team members on /team page
CREATE POLICY "Public can view active team members" ON public.team_member FOR
SELECT USING (is_active = true);

-- portfolio_project already has public read via portfolio_rls migration,
-- but ensure it exists:
DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE
        tablename = 'portfolio_project'
        AND policyname = 'Public can view portfolio projects'
) THEN CREATE POLICY "Public can view portfolio projects" ON public.portfolio_project FOR
SELECT USING (true);

END IF;

END $$;