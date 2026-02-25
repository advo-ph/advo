-- ============================================================
-- Seed team_member and portfolio_project tables
-- ============================================================

-- Team Members (from the original hardcoded Team.tsx)
INSERT INTO
    public.team_member (
        name,
        role,
        bio,
        avatar_url,
        email,
        linkedin_url,
        is_active
    )
VALUES (
        'Prince Wagan',
        'Founder',
        'Visionary leader driving ADVO''s mission to build exceptional digital products for ambitious businesses.',
        '/team-prince.png',
        'prince@advo.ph',
        NULL,
        true
    ),
    (
        'Angelo Revelo',
        'Developer',
        'Full-stack developer building apps and digital solutions. Specializes in React, Node.js, and cloud architecture.',
        NULL,
        'gelo@advo.ph',
        NULL,
        true
    ),
    (
        'Schiffier Silang',
        'Externals & Operations',
        'Handles financials, marketing, and external partnerships to drive business growth.',
        NULL,
        NULL,
        NULL,
        true
    ),
    (
        'Au Cargason',
        'Project Manager',
        'Ensures projects stay on track with strong leadership and deadline management.',
        NULL,
        NULL,
        NULL,
        true
    ),
    (
        'Anthony Gabriel Ramos',
        'Project Manager',
        'Coordinates teams and deliverables to ensure smooth project execution.',
        '/team-anthony.png',
        NULL,
        NULL,
        true
    ),
    (
        'David Remo',
        'Business Operations',
        'Manages client relationships and business operations.',
        '/team-david.png',
        NULL,
        NULL,
        true
    ) ON CONFLICT DO NOTHING;

-- Portfolio Projects (from the original hardcoded PortfolioGrid.tsx)
INSERT INTO public.portfolio_project (title, description, preview_url, image_url, tech_stack, is_featured, display_order)
VALUES
  ('VBE Eye Center', 'EMR app for an ophthalmology clinic streamlining workflow between OPD, nurses, and doctors. Transitioned from paper to digital with improved queuing and patient tracking.', '#', '/portfolio-vbe.png', ARRAY['React', 'Supabase', 'PostgreSQL', 'TypeScript'], true, 1),
  ('Sisia', 'AI-powered content generation tool for marketing teams. Generates copy, images, and campaign strategies.', '#', NULL, ARRAY['Next.js', 'OpenAI', 'Stripe', 'Vercel'], true, 2),
  ('Hiramin', 'Enterprise workforce management solution. Handles scheduling, payroll integration, and compliance tracking.', '#', NULL, ARRAY['React', 'GraphQL', 'AWS', 'Docker'], true, 3)
ON CONFLICT DO NOTHING;

-- Update site_content services to use correct icon names for Lucide map
UPDATE public.site_content SET content = '{
  "items": [
    { "title": "Web App Development", "description": "Full-stack applications built with modern frameworks. From MVP to enterprise scale.", "icon": "Code2" },
    { "title": "Mobile Solutions", "description": "Native and cross-platform mobile experiences that users love.", "icon": "Smartphone" },
    { "title": "Cloud Architecture", "description": "Infrastructure that scales with your business. Secure, reliable, cost-optimized.", "icon": "Cloud" }
  ]
}'::jsonb WHERE section_id = 'services';