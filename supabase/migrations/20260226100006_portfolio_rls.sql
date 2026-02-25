-- ============================================================
-- Add admin write policies to portfolio_project
-- ============================================================
-- SELECT is already public. Add INSERT/UPDATE/DELETE for admins.

CREATE POLICY "Admins can insert portfolio_project" ON public.portfolio_project FOR
INSERT
WITH
    CHECK (public.is_admin ());

CREATE POLICY "Admins can update portfolio_project" ON public.portfolio_project FOR
UPDATE USING (public.is_admin ())
WITH
    CHECK (public.is_admin ());

CREATE POLICY "Admins can delete portfolio_project" ON public.portfolio_project FOR DELETE USING (public.is_admin ());