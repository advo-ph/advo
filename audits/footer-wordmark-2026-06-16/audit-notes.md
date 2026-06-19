# ADVO Footer Wordmark Audit

## Audit scope

- Product surface: ADVO marketing footer at `http://127.0.0.1:6100/`.
- User goal: make the footer feel like a branded closing scene, not a generic SaaS footer.
- Destination: local folder, `audits/footer-wordmark-2026-06-16/`.
- Capture tool: Codex in-app Browser.

## Screenshots

1. `01-current-footer.png` - current ADVO footer implementation.
2. `02-revised-footer.png` - revised ADVO footer with dedicated cropped wordmark stage.
3. `03-raw-wordmark-footer.png` - final ADVO footer with the fade/mask removed.
4. `reference-advo-dark-wordmark.png` - dark footer with oversized cropped ADVO wordmark.
5. `reference-antigravity-wordmark.png` - light footer where the wordmark is the dominant visual object.
6. `reference-mitra-footer.png` - tonal footer transition with large cropped brand wordmark.
7. `reference-footer-gallery.png` - footer gallery reference showing footer-as-hero composition.

## Step List

1. Footer landing state - needs revision.
   The current footer content is readable and structured, but the composition still feels like a conventional link grid with a dim logo layer underneath.
2. Revised footer state - healthier.
   The revised version gives the logo a dedicated stage, increases its visual presence, and keeps utility links readable without horizontal overflow.
3. Raw wordmark state - healthiest.
   The final version removes the fade/mask effect so the oversized ADVO wordmark reads as plain cropped letterforms, closer to the provided references.

## Strengths

- The current footer preserves the site language: dark surface, subtle grid, small uppercase metadata, and restrained link styling.
- The ADVO mark is present at large scale and already avoids horizontal overflow in the captured viewport.
- Links, email, and social icons remain discoverable.

## UX Risks

- The footer still reads as a generic information block first. The oversized mark appears after the useful content rather than defining the footer.
- The wordmark is too faint and too background-like. In the references, the large brand form is the composition, not a decorative watermark.
- The top link layout remains too evenly distributed and predictable, which weakens the "special closing moment" the footer should create.
- The fixed floating nav can visually intrude into footer captures near the transition from the CTA into the footer, reducing the intended end-of-page reveal.

## Accessibility Risks

- The oversized decorative wordmark is correctly hidden from assistive technology in the current implementation, but the clickable home link needs a clear accessible label if retained.
- Low-contrast decorative logo treatment is acceptable only if decorative. Footer links and metadata should not inherit that low contrast.
- Screenshot evidence cannot confirm keyboard focus order, focus ring visibility, or screen reader announcement behavior.

## Recommendations

1. Make the wordmark a dedicated footer stage with fixed responsive height, bottom anchoring, and viewport-spanning width.
2. Increase the wordmark presence enough to read as a brand object while keeping it secondary to accessible text links.
3. Compress the utility content into a lighter top row so the lower half belongs to ADVO.
4. Keep the grid subtle, but let the cropped wordmark create the main "wow" rather than adding more lines or panels.
5. After implementation, capture desktop and mobile footer states and confirm no horizontal overflow.
