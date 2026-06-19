# Stripe Landing Page Design Audit

Date: 2026-06-16  
Surface: Stripe public homepage, https://stripe.com/  
Mode: Combined product design, UX, interaction, responsive, and accessibility audit  
Destination: Local folder, `/Users/angelonrevelo/Antigravity/advo/audits/stripe-landing-audit-2026-06-16`

## Method

- Captured the current public homepage in desktop and mobile widths.
- Inspected visible nav menus, mobile menu, product modules, proof sections, developer/infrastructure section, final CTA, and footer.
- Read the page DOM inventory for headings, buttons, links, CTA labels, image/video/canvas counts, and interactive attributes.
- Used three focused subagent passes:
  - Content, IA, and conversion strategy
  - Interaction, motion, responsive behavior, and visual system
  - Accessibility and UX-risk pass
- Evidence is screenshot-led. This is not a WCAG conformance claim.

Primary source: https://stripe.com/

## Accepted Screenshot Set

Use the `*-clean.png` files for section evidence where available. Earlier non-clean section captures were kept only as raw capture artifacts because desktop nav hover introduced an intentional page blur/scrim.

1. `01-desktop-hero.png` - desktop hero and logo strip entry
2. `02-nav-products-hover.png` - Products mega menu
3. `03-nav-solutions-hover.png` - Solutions mega menu
4. `04-nav-developers-hover.png` - Developers mega menu
5. `05-nav-resources-hover.png` - Resources mega menu
6. `06-logo-strip-flexible-solutions-clean.png` - product grid entry
7. `07-payments-billing-grid-clean.png` - bento product modules
8. `08-agentic-commerce-card-clean.png` - lower product modules
9. `09-global-commerce-metrics-clean.png` - global commerce proof metrics
10. `10-business-size-proof-clean.png` - businesses of all sizes section
11. `11-enterprise-hertz-case-clean.png` - enterprise/customer story module
12. `12-startups-program-clean.png` - startup proof and programs
13. `13-platforms-section-clean.png` - SaaS/platform module
14. `14-developers-section-clean.png` - developer/infrastructure proof
15. `15-integration-paths-clean.png` - integration paths
16. `16-whats-happening-clean.png` - news/currentness section
17. `17-final-cta-footer-entry-clean.png` - final CTA and footer entry
18. `18-footer-clean.png` - footer taxonomy
19. `19-mobile-hero-clean.png` - mobile hero
20. `20-mobile-menu-open-clean.png` - mobile menu
21. `21-mobile-flexible-solutions-clean.png` - mobile product grid
22. `22-mobile-metrics-clean.png` - mobile metrics
23. `23-mobile-developers-clean.png` - mobile developer section
24. `24-mobile-footer-cta-clean.png` - mobile final CTA

## Step Health

1. Desktop hero - Strong  
   The hero owns the category with one large outcome statement, two clear self-serve CTAs, a live-feeling GDP proof line, and a huge animated gradient ribbon. The grid is visible but quiet: vertical rails align nav, hero copy, logo strip, and following content.

2. Desktop nav and mega menus - Strong  
   Surface nav is calm: Products, Solutions, Developers, Resources, Pricing, Sign in, Contact sales. Mega menus reveal the deep taxonomy only when needed. Products groups by product family; Solutions groups by stage, use case, industry, and ecosystem. Each menu uses columns, short labels, and light descriptions.

3. Mobile menu - Strong  
   Mobile uses a full-screen drawer with large rows, chevrons for drilldown, close button, and bottom-pinned Start now / Contact sales CTAs. This is a better pattern than trying to cram desktop nav into a small header.

4. Logo strip and product grid entry - Strong  
   Stripe moves directly from hero to proof logos, then into a large editorial statement. The product grid feels like a structured magazine layout: rails, cards, shared gutters, and large real-looking UI surfaces.

5. Product bento modules - Strong  
   Cards are not abstract feature blurbs. They show product truth: checkout, billing usage, commerce, issuing cards, crypto/stablecoin motion, and platform payments. The modules have expand controls and imply more depth without forcing the user into a separate page.

6. Global commerce metrics - Strong  
   Metrics are arranged as a proof band, followed by an animated infrastructure visual. Numbers are large, simple, and tied to the product claim. The section gives Stripe scale without relying on paragraphs.

7. Customer/business proof - Strong  
   Stripe layers proof by audience: enterprise, startup, platform. Customer stories are not decorative. They include named customer, outcome metrics, products used, and story CTAs.

8. Developer/infrastructure section - Strong  
   The developer section switches visual language to dark mode, code/infrastructure diagrams, data pipeline blocks, API scale metrics, docs/GitHub CTAs, and integration paths. It feels like a second mode of the same brand, not a separate microsite.

9. News/currentness section - Healthy  
   The "What’s happening" area gives freshness: annual letter, events, reports, regulations, crypto, AI commerce, retail. This helps the page feel alive and prevents it from being only evergreen sales copy.

10. Final CTA and footer - Strong  
   Final CTA offers Start now and Contact sales, then immediately routes practical next questions: pricing and integration options. Footer is dense but organized by product/pricing, solutions, integrations, resources, company, support, and region.

11. Mobile responsive behavior - Mostly strong, with caution  
   The mobile homepage keeps the hero, CTAs, logo strip, and product modules readable. The drawer is excellent. One risk observed by the interaction pass: some narrow-width states can feel close to clipping because the hero and CTA system is dense. ADVO should be stricter than Stripe here.

## Visual System Findings

### Grid / Layout

Stripe uses an editorial product grid, not just a decorative background grid.

- Vertical rails are consistent across hero, logo strip, product grid, metrics, and footer.
- Section boundaries are drawn with fine horizontal rules.
- Product cards align to columns and share borders/gutters.
- Large text frequently spans a limited column range instead of filling the full viewport.
- White space is generous, but the page still feels dense because each grid cell carries useful content.

For ADVO: use rails as structure. Align headlines, proof, modules, and footer columns to the same container grid. Avoid floating cards that ignore the rails.

### Color

- Stripe uses a bright white base, deep navy text, and a high-energy purple/orange/pink gradient.
- The gradient is not applied everywhere. It appears as a signature energy field behind hero and selected product/proof visuals.
- Dark mode appears only when it supports developer/infrastructure credibility.

For ADVO: keep the dark Linear-inspired canvas, but use controlled gradient moments behind real product surfaces, not as whole-section decoration.

### Typography

- Hero type is huge, plain, and confident.
- Body copy is moderate and restrained.
- Section headlines are often two-tone: one dark claim plus softer continuation text.
- Product cards use large, readable headings and short labels.

For ADVO: reserve huge type for a few main claims. Inside product modules, keep headings smaller and tighter.

### Imagery / Product Surfaces

- The strongest visual assets are product-specific: checkout UI, usage billing cards, payment method lists, customer story imagery, dashboard/platform diagrams, and developer infrastructure visuals.
- Stripe repeatedly shows what the product does instead of illustrating a metaphor.

For ADVO: show website/client/admin truth: live site previews, client portal, admin queue, project timeline, analytics, content editor, and deployment status.

## Interaction Inventory

Observed or detected interaction patterns:

- Desktop mega menus with blur/scrim background.
- Mobile full-screen navigation drawer with nested rows.
- Product bento cards with expand controls.
- Large metric/stat controls in global commerce section.
- Customer story accordion/tabs that swap active story content.
- Testimonial carousel controls.
- News/currentness carousel controls.
- Region/country selector in footer.
- Multiple CTA pathways: self-serve, sales, docs, GitHub, pricing, guides, stories.

Interaction principle: Stripe hides complexity behind progressive disclosure. The page first shows a simple path, then opens detail in place.

For ADVO:

- Use expandable cards for "Website", "Client Hub", "Admin", "Launch", or "Care Plan".
- Use in-place proof accordions for case studies or before/after outcomes.
- Use a full-screen mobile drawer with bottom-pinned Start a Project / Client Hub CTAs.
- Do not make every feature a separate route. Let the homepage explain depth inline.

## Content / IA / Conversion Findings

### Messaging

Stripe leads with buyer outcome and category ownership, not a product list. The page positions Stripe as infrastructure for revenue, then supports that claim with payments, financial services, custom revenue models, and scale.

For ADVO: lead with the transformation, not "website building service." Example direction: "Launch a website and client system that turns attention into booked work."

### Audience Routing

Stripe serves many visitor types without making the top level feel chaotic:

- New/self-serve visitors: Get started / Sign up with Google
- Enterprise: Contact sales
- Technical evaluators: docs, GitHub, SDKs, API scale
- Platforms: embedded payments and platform sections
- Startups: startup proof and Stripe Atlas/programs
- Price-conscious visitors: pricing details

For ADVO:

- Start a project
- See packages
- View work
- Client login
- Talk to us
- Maybe "I need a site fast", "I need a redesign", "I need a client portal", "I need ongoing care"

### Proof Strategy

Stripe layers proof:

- Brand logos near hero
- Hard infrastructure metrics
- Customer case studies
- Product-used lists
- Startup and platform examples
- Testimonials
- News/currentness

For ADVO:

- Client logos or industries served
- Before/after screenshots
- Launch timeline
- Conversion or lead outcome metrics
- "What we shipped" modules
- Testimonials tied to exact work delivered
- "Built on your stack" proof

## Accessibility Findings

Confirmed strengths:

- Descriptive page title.
- Main and footer landmarks detected.
- Mostly sensible H1/H2/H3 hierarchy.
- Mobile/tablet/desktop reflow looked generally healthy in sampled widths.
- Primary CTAs are large enough for comfortable touch.
- Many top-level focus states visibly use a purple outline.
- Nav menus expose `aria-expanded`.
- Some customer images have meaningful alt text.

Likely risks:

- Empty-name links were detected in the accessibility pass, likely around logo/news/customer image links.
- Some illustrative text may fail contrast, especially tiny text inside product graphics.
- Footer and inline text links are small; they may pass exceptions but are less comfortable on touch.
- Some large interactive panels may need manual focus-state verification.
- Motion is substantial. Reduced-motion behavior should be verified, and auto-updating content should be pausable if it conveys meaningful information.
- Repeated links such as "Read the story" need screen-reader context verification.

Evidence limits:

- No screen-reader pass was performed.
- No legal WCAG compliance claim is made.
- Stripe’s page may vary by region, experiment, viewport, cookie state, and time.

## ADVO Translation

### Borrow

- Structural editorial grid with visible rails.
- Calm top nav with deeper mega menu or drawer routing.
- Real product surfaces inside cards.
- Expandable modules instead of static cards.
- In-place proof sections.
- Large final CTA followed by practical routes.
- Bottom-pinned mobile actions.
- Dark developer/system proof section as a mode shift.

### Avoid

- Copying Stripe’s length or product density.
- Decorative gradients without product evidence.
- Tiny hover-only controls.
- Horizontal clipping on mobile.
- Generic "launch sequence" cards.
- Carousels where the most important proof is hidden.

### Suggested ADVO Page Architecture

1. Hero: outcome statement + live website/client-system preview.
2. Proof strip: clients, industries, or launch facts.
3. Flexible solutions grid: Website, Client Hub, Admin Dashboard, Care Plan.
4. Self-hosted/private stack: ADVO infrastructure proof, visualized cleanly.
5. Work/results: case studies with before/after and measurable outcomes.
6. Process: connected grid, not floating cards.
7. Packages/routes: fast site, redesign, portal, ongoing growth.
8. Final CTA: Start a project, see packages, client login.
9. Big wordmark footer with structured sitemap.

## Recommended Next Actions For ADVO

1. Replace abstract service cards with real-looking ADVO product surfaces.
2. Build a consistent 4-column rail system across landing sections.
3. Add one expandable card pattern and reuse it for services/proof.
4. Make mobile nav full-screen with bottom-pinned actions.
5. Add proof artifacts before adding more animation.
6. Test 360, 390, 768, 1280, and 1440 widths before shipping visual changes.
7. Audit focus states and reduced-motion behavior once ADVO animations are finalized.
