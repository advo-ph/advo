-- ============================================================
-- Site content visibility toggles
-- ============================================================
-- Admin-controlled toggles that determine what sections appear
-- on the public advo.ph site and in the client portal dashboard.
-- ============================================================

CREATE TABLE public.site_content (
    section_id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    visible_public BOOLEAN NOT NULL DEFAULT true,
    visible_client_portal BOOLEAN NOT NULL DEFAULT false,
    content JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- RLS
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

-- Public can read all sections
CREATE POLICY "Anyone can view site_content" ON public.site_content FOR
SELECT USING (true);

-- Only admins can insert
CREATE POLICY "Admins can insert site_content" ON public.site_content FOR
INSERT
WITH
    CHECK (public.is_admin ());

-- Only admins can update
CREATE POLICY "Admins can update site_content" ON public.site_content FOR
UPDATE USING (public.is_admin ())
WITH
    CHECK (public.is_admin ());

-- Only admins can delete
CREATE POLICY "Admins can delete site_content" ON public.site_content FOR DELETE USING (public.is_admin ());

-- ── Seed rows ───────────────────────────────────────────────

INSERT INTO
    public.site_content (section_id, label)
VALUES ('hero', 'Hero & Landing'),
    ('services', 'Services'),
    (
        'portfolio',
        'Portfolio & Case Studies'
    ),
    ('team', 'Team Showcase'),
    ('pricing', 'Pricing Plans'),
    (
        'testimonials',
        'Testimonials'
    ),
    ('contact', 'Contact & CTA'),
    (
        'client_dashboard',
        'Client Dashboard'
    );