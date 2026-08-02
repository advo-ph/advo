# ADVO landing-page fidelity audit

## Overall verdict

The page is not a literal 1:1 recreation of the supplied reference set. It is an ADVO adaptation that preserves much of the white editorial layout, orange accent system, bordered card language, and section rhythm. The strongest visual matches are the CTA/footer and five-stage workflow. The largest departures are the hero, metrics/integration content, testimonial structure, and engagement layout.

The supplied images also represent a mix of references rather than one single continuous source. This audit compares each implemented section to the reference the user selected for that region.

## Fresh audit evidence

- Current section contact sheet: `C:\Users\maran\Antigravity\advo\audit-current\00-contact-sheet.png`
- Source contact sheet: `C:\Users\maran\Antigravity\advo\audit-current\source-contact-sheet.png`
- Hero/features comparison: `C:\Users\maran\Antigravity\advo\audit-current\comparison-a.png`
- Services/workflow/integrations comparison: `C:\Users\maran\Antigravity\advo\audit-current\comparison-b.png`
- Engagement/FAQ/footer comparison: `C:\Users\maran\Antigravity\advo\audit-current\comparison-c.png`
- Browser capture viewport: 980 × 860 CSS pixels, density 1.

## Section verdict

1. Hero and navigation — major drift
   - The current page keeps the centered SaaS composition, orange action, warm dashboard frame, and compact navigation.
   - It does not match the source copy, logo scale, navigation labels, hero width, button sizing, floating status cards, dashboard UI, or above-the-fold spacing.
   - The current hero is visually heavier and taller. Its dashboard is an ADVO-specific recreation rather than the source dashboard image.

2. Feature cards — close direction, not 1:1
   - The four-column bordered layout and illustration-first card hierarchy match.
   - The current Plan/Create/Approve/Deliver content differs from the source Automated Execution/Smart Organization/Connected Tools/Flexible Workflows content.
   - The generated raster illustrations share the intended line-and-orange style but differ in geometry, scale, line detail, and subject composition.
   - Current headings are larger and heavier, and the cards use more vertical space.

3. Services and three-step process — close direction, visible drift
   - The split introduction, four service cards, and three process cards match the selected ADVO reference structurally.
   - Service illustration size and whitespace are close but not pixel-identical.
   - Process icons are Tabler symbols; the reference uses different custom outline symbols. Copy wrapping and card height also differ.

4. Five-stage workflow — strong match, not pixel-identical
   - The left introduction, orange frame, five centered stages, connectors, and orange Launch state match well.
   - The icons, frame thickness, internal padding, text width, and exact orange tint differ slightly.
   - Motion adds a stagger and float not represented by the static source.

5. Metrics and integrations — major content and icon drift
   - The four-metric strip, split visual/copy block, and 3×3 integration grid match the reference structure.
   - Metric values and labels are entirely different.
   - The reference uses Gmail, Google Calendar, Notion, Slack, Trello, Google Drive, Zoom, Asana, and Microsoft Teams with colored brand marks. The current grid uses a different tool set and monochrome Tabler icons.
   - The current heading is larger, and the warm raster backdrop has a different crop and texture.

6. Testimonials — major drift
   - The source shows a denser horizontal testimonial treatment with more cards. The current implementation uses three wider cards, different quotes, initials, spacing, and footer treatment.
   - There is no isolated selected testimonial reference, so precise typography and card dimensions cannot be certified.

7. Engagement options — moderate-to-major drift
   - The four offer types, prices, outlined actions, and dark Enterprise card match the selected ADVO direction.
   - The reference places the introduction beside the card row; the current implementation places it above the row.
   - Icon subjects, card proportions, copy wrapping, and vertical density differ.

8. FAQ — structurally close, asset mismatch
   - The two-column question layout, accordion rules, and left heading are close.
   - The current FAQ illustration is constructed from UI borders and an icon rather than using a source-matched illustration asset.
   - Heading scale, question spacing, expanded-answer density, and icon treatment differ.

9. CTA and footer — strongest match
   - At the supplied 846 × 605 reference size, the CTA top/bottom, two-line headline, clipboard tile, stacked actions, footer column starts, newsletter label, and input position align closely.
   - It is still not a pixel-identical copy: Geist renders differently from the source typeface, the paper texture differs, and the implementation continues into footer metadata and the landscape below the reference crop.

## Cross-cutting fidelity findings

### Typography

- The implementation explicitly uses `Geist, system-ui, sans-serif`.
- The source appears to use a different neutral grotesk or different font metrics. The current display text is generally heavier, tighter, and larger.
- Browser measurement at 980px: the current H1 is 54.39px at weight 590.
- Therefore the fonts are stylistically compatible but not 1:1.

### Icons and illustrations

- The page currently mixes Tabler icons, Lucide icons, generated raster illustrations, and the ADVO logo.
- The sources mix custom line illustrations and colored brand logos.
- This mixed current icon system is coherent enough visually but cannot be considered source-identical.

### Color and borders

- White, near-black, hairline gray, cream, and vivid orange are consistently applied.
- The current orange token is `#ff5b22`; it is visually close to the source.
- Border weights and CTA/footer geometry are strongest. Several earlier card sections are taller and more spacious than their sources.

### Accessibility and implementation health

- Positive: one H1, logical H2/H3 hierarchy, no broken images, all images have `alt`, no unnamed links, no horizontal overflow at 980px, and reduced-motion support is present.
- Risk: several labels and card descriptions render at 9–10px, which is too small for comfortable reading.
- Risk: focus treatment is explicit for the newsletter input but not consistently designed for every link and button.
- Browser console showed no runtime error. Only React Router future-version warnings were present.
- Screenshot review cannot certify keyboard order, screen-reader announcements, contrast in every animated state, or full WCAG compliance.

## Priority order for a true source match

1. Lock the exact typeface and type scale across every section.
2. Rebuild the hero around the selected source proportions and remove/adapt the floating ADVO-specific status cards.
3. Match the original integration tool list and colored brand marks.
4. Match testimonial count and engagement-section grid geometry.
5. Replace remaining Lucide/code-constructed visuals with the selected Tabler or source-matched asset system.
6. Run a final equal-viewport pixel comparison for every section after those changes.

