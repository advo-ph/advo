-- ADVO.ph Database Schema
-- Following the ADVO Standard: BIGINT IDs, singular naming, cents for currency

-- Project Status Enum
CREATE TYPE public.project_status AS ENUM ('discovery', 'architecture', 'development', 'testing', 'shipped');

-- Core Client Table
CREATE TABLE public.client (
    client_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    company_name VARCHAR(100) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    github_org_name VARCHAR(100),
    brand_color_hex CHAR(7) DEFAULT '#22C55E',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS on client
ALTER TABLE public.client ENABLE ROW LEVEL SECURITY;

-- Client RLS Policies
CREATE POLICY "Clients can view their own record"
ON public.client FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Clients can update their own record"
ON public.client FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Clients can insert their own record"
ON public.client FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Individual Projects Table
CREATE TABLE public.project (
    project_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id BIGINT REFERENCES public.client(client_id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    repository_name VARCHAR(100),
    preview_url TEXT,
    project_status public.project_status DEFAULT 'discovery' NOT NULL,
    total_value_cents BIGINT DEFAULT 0 NOT NULL,
    amount_paid_cents BIGINT DEFAULT 0 NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    tech_stack TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS on project
ALTER TABLE public.project ENABLE ROW LEVEL SECURITY;

-- Project RLS Policies (clients can only see their own projects)
CREATE POLICY "Clients can view their own projects"
ON public.project FOR SELECT
USING (
    client_id IN (
        SELECT client_id FROM public.client WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Clients can update their own projects"
ON public.project FOR UPDATE
USING (
    client_id IN (
        SELECT client_id FROM public.client WHERE user_id = auth.uid()
    )
);

-- Progress Updates Table
CREATE TABLE public.progress_update (
    progress_update_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id BIGINT REFERENCES public.project(project_id) ON DELETE CASCADE NOT NULL,
    update_title VARCHAR(255) NOT NULL,
    update_body TEXT,
    commit_sha_reference VARCHAR(40),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS on progress_update
ALTER TABLE public.progress_update ENABLE ROW LEVEL SECURITY;

-- Progress Update RLS Policies (clients can only see updates for their projects)
CREATE POLICY "Clients can view their project updates"
ON public.progress_update FOR SELECT
USING (
    project_id IN (
        SELECT p.project_id FROM public.project p
        JOIN public.client c ON p.client_id = c.client_id
        WHERE c.user_id = auth.uid()
    )
);

-- Performance Indices
CREATE INDEX idx_project_client_id ON public.project(client_id);
CREATE INDEX idx_project_status ON public.project(project_status);
CREATE INDEX idx_progress_project_id ON public.progress_update(project_id);
CREATE INDEX idx_client_user_id ON public.client(user_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_client_updated_at
    BEFORE UPDATE ON public.client
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_project_updated_at
    BEFORE UPDATE ON public.project
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Portfolio View (public-facing projects for landing page)
CREATE TABLE public.portfolio_project (
    portfolio_project_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    preview_url TEXT,
    image_url TEXT,
    tech_stack TEXT[] DEFAULT '{}',
    is_featured BOOLEAN DEFAULT FALSE NOT NULL,
    display_order INT DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Portfolio is public (no RLS needed for read, but enable for safety)
ALTER TABLE public.portfolio_project ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view portfolio projects"
ON public.portfolio_project FOR SELECT
USING (true);
