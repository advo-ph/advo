-- Admin RLS policies
-- These policies allow admin users (authenticated) to manage all resources
-- In a production environment, you'd check against an admin role or admin table

-- Project: Admins can insert, update, and see all projects
CREATE POLICY "Admins can insert projects" ON public.project FOR
INSERT
WITH
    CHECK (
        auth.role () = 'authenticated'
    );

CREATE POLICY "Admins can delete projects" ON public.project FOR DELETE USING (
    auth.role () = 'authenticated'
);

-- Extend SELECT to all authenticated users (admins)
-- The existing policy only allows client's own projects
CREATE POLICY "Admins can view all projects" ON public.project FOR
SELECT USING (
        auth.role () = 'authenticated'
    );

-- Client: Admins can manage all clients
CREATE POLICY "Admins can view all clients" ON public.client FOR
SELECT USING (
        auth.role () = 'authenticated'
    );

CREATE POLICY "Admins can insert clients" ON public.client FOR
INSERT
WITH
    CHECK (
        auth.role () = 'authenticated'
    );

CREATE POLICY "Admins can update all clients" ON public.client FOR
UPDATE USING (
    auth.role () = 'authenticated'
);

CREATE POLICY "Admins can delete clients" ON public.client FOR DELETE USING (
    auth.role () = 'authenticated'
);

-- Progress Update: Admins can insert updates
CREATE POLICY "Admins can insert progress updates" ON public.progress_update FOR
INSERT
WITH
    CHECK (
        auth.role () = 'authenticated'
    );

CREATE POLICY "Admins can view all progress updates" ON public.progress_update FOR
SELECT USING (
        auth.role () = 'authenticated'
    );

CREATE POLICY "Admins can delete progress updates" ON public.progress_update FOR DELETE USING (
    auth.role () = 'authenticated'
);