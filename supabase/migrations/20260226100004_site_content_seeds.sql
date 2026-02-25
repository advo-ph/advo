-- ============================================================
-- Populate site_content JSONB with default content shapes
-- ============================================================

UPDATE public.site_content SET content = $content${
  "headline": "We digitalize it for you.",
  "subtext": "Does your business need a website? We will handle everything for you.",
  "cta_primary_label": "Start a Project",
  "cta_primary_url": "/start",
  "status_badge_text": "Accepting Clients",
  "status_badge_visible": true
}$content$::jsonb WHERE section_id = 'hero';

UPDATE public.site_content SET content = '{
  "items": [
    { "title": "Web Development", "description": "Custom websites built from scratch", "icon": "Globe" },
    { "title": "UI/UX Design", "description": "Beautiful, intuitive interfaces", "icon": "Palette" },
    { "title": "Brand Identity", "description": "Logo, colors, and visual systems", "icon": "Sparkles" }
  ]
}'::jsonb WHERE section_id = 'services';

-- portfolio: driven by portfolio_project table
UPDATE public.site_content
SET
    content = NULL
WHERE
    section_id = 'portfolio';

-- team: driven by team_member table
UPDATE public.site_content
SET
    content = NULL
WHERE
    section_id = 'team';

UPDATE public.site_content SET content = '{
  "plans": [
    {
      "name": "Starter",
      "price_label": "₱15,000",
      "description": "Perfect for small businesses getting started",
      "features": ["Landing page", "Mobile responsive", "Contact form", "Basic SEO"],
      "is_featured": false
    },
    {
      "name": "Professional",
      "price_label": "₱35,000",
      "description": "For growing businesses that need more",
      "features": ["Multi-page website", "CMS integration", "Analytics", "Email setup", "Priority support"],
      "is_featured": true
    },
    {
      "name": "Enterprise",
      "price_label": "Custom",
      "description": "Full-scale digital solutions",
      "features": ["Custom web app", "API integrations", "Admin dashboard", "Ongoing maintenance", "Dedicated support"],
      "is_featured": false
    }
  ]
}'::jsonb WHERE section_id = 'pricing';

UPDATE public.site_content SET content = '{
  "items": [
    { "quote": "ADVO transformed our online presence completely.", "author": "Maria Santos", "company": "Santos & Co", "avatar_url": null },
    { "quote": "Professional, fast, and incredibly talented team.", "author": "John Cruz", "company": "CruzTech", "avatar_url": null }
  ]
}'::jsonb WHERE section_id = 'testimonials';

UPDATE public.site_content SET content = '{
  "email": "hello@advo.ph",
  "calendly_url": null,
  "show_form": true
}'::jsonb WHERE section_id = 'contact';

UPDATE public.site_content SET content = '{
  "welcome_message": "Welcome to your project dashboard"
}'::jsonb WHERE section_id = 'client_dashboard';