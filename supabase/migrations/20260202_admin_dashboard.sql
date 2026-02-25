-- ADVO Admin Dashboard Schema Extension
-- Adds team members, schedule/tasks, and deliverables tracking

-- Team Member Table
CREATE TABLE public.team_member (
    team_member_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS on team_member
ALTER TABLE public.team_member ENABLE ROW LEVEL SECURITY;

-- Team members are viewable by authenticated users
CREATE POLICY "Authenticated users can view team members" ON public.team_member FOR
SELECT USING (
        auth.role () = 'authenticated'
    );

-- Deliverable Status Enum
CREATE TYPE public.deliverable_status AS ENUM ('not_started', 'in_progress', 'review', 'completed', 'blocked');

-- Deliverables Table (tasks/milestones)
CREATE TABLE public.deliverable (
    deliverable_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id BIGINT REFERENCES public.project (project_id) ON DELETE CASCADE,
    assigned_to BIGINT REFERENCES public.team_member (team_member_id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status public.deliverable_status DEFAULT 'not_started' NOT NULL,
    priority INT DEFAULT 2 NOT NULL, -- 1=low, 2=medium, 3=high
    due_date DATE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS on deliverable
ALTER TABLE public.deliverable ENABLE ROW LEVEL SECURITY;

-- Deliverables viewable by authenticated users
CREATE POLICY "Authenticated users can view deliverables" ON public.deliverable FOR
SELECT USING (
        auth.role () = 'authenticated'
    );

CREATE POLICY "Authenticated users can insert deliverables" ON public.deliverable FOR
INSERT
WITH
    CHECK (
        auth.role () = 'authenticated'
    );

CREATE POLICY "Authenticated users can update deliverables" ON public.deliverable FOR
UPDATE USING (
    auth.role () = 'authenticated'
);

CREATE POLICY "Authenticated users can delete deliverables" ON public.deliverable FOR DELETE USING (
    auth.role () = 'authenticated'
);

-- Social Media Post Table (for mockup/preview)
CREATE TABLE public.social_post (
    social_post_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    platform VARCHAR(50) NOT NULL, -- instagram, twitter, linkedin
    content TEXT NOT NULL,
    image_url TEXT,
    scheduled_for TIMESTAMPTZ,
    is_published BOOLEAN DEFAULT FALSE NOT NULL,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS on social_post
ALTER TABLE public.social_post ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage social posts" ON public.social_post FOR ALL USING (
    auth.role () = 'authenticated'
);

-- Performance Indices
CREATE INDEX idx_deliverable_project_id ON public.deliverable (project_id);

CREATE INDEX idx_deliverable_assigned_to ON public.deliverable (assigned_to);

CREATE INDEX idx_deliverable_status ON public.deliverable (status);

CREATE INDEX idx_deliverable_due_date ON public.deliverable (due_date);

-- Updated_at trigger for deliverable
CREATE TRIGGER update_deliverable_updated_at
    BEFORE UPDATE ON public.deliverable
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();