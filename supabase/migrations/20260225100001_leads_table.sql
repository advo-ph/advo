-- Lead Table for project inquiries from the website
CREATE TABLE public.lead (
    lead_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    company VARCHAR(100),
    project_type VARCHAR(100),
    budget VARCHAR(50),
    description TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS on lead
ALTER TABLE public.lead ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a lead (public insert for website form)
CREATE POLICY "Anyone can insert leads" ON public.lead FOR
INSERT
WITH
    CHECK (true);

-- Only authenticated users (admins) can view/manage leads
CREATE POLICY "Authenticated users can view leads" ON public.lead FOR
SELECT USING (
        auth.role () = 'authenticated'
    );

CREATE POLICY "Authenticated users can update leads" ON public.lead FOR
UPDATE USING (
    auth.role () = 'authenticated'
);

CREATE POLICY "Authenticated users can delete leads" ON public.lead FOR DELETE USING (
    auth.role () = 'authenticated'
);

-- Index for ordering
CREATE INDEX idx_lead_submitted_at ON public.lead (submitted_at);