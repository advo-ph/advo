-- ============================================================
-- Project assets + contract_url
-- ============================================================

-- 1. Add contract_url to project
ALTER TABLE public.project ADD COLUMN contract_url TEXT;

-- 2. Create enum
CREATE TYPE public.project_asset_type AS ENUM (
    'progress_photo',
    'completion_photo',
    'document'
);

-- 3. Create table (ADVO Standard)
CREATE TABLE public.project_asset (
    project_asset_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES public.project (project_id) ON DELETE CASCADE,
    asset_type public.project_asset_type NOT NULL,
    url TEXT NOT NULL,
    caption TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. RLS
ALTER TABLE public.project_asset ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "Admins can manage project assets" ON public.project_asset FOR ALL USING (public.is_admin ())
WITH
    CHECK (public.is_admin ());

-- Client: read via project chain
CREATE POLICY "Clients can view project assets" ON public.project_asset FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.project p
                JOIN public.client c ON c.client_id = p.client_id
            WHERE
                p.project_id = project_asset.project_id
                AND c.user_id = auth.uid ()
        )
    );

-- Index
CREATE INDEX idx_project_asset_project_id ON public.project_asset (project_id);