/**
 * Share image and screenshots for each shipped product, keyed by the
 * portfolio slug from `GET /api/content/portfolio`.
 *
 * `og` is the product's own 1200x630 share frame: the site's real og:image
 * where it ships one (Felici), otherwise the home page captured at that
 * size. `shot` is two inner pages captured at 1440 wide. A slug with no entry
 * falls back to the single CMS screenshot, which is the honest output for
 * VBE Eye Center Clinic, whose site has no public URL.
 *
 * Captured 2026-09-02 from the live sites, cookie banners dismissed. Camps
 * PH's home page errors server-side, so its frame is the listing page.
 */
export interface WorkMedia {
  og: string;
  shot: string[];
}

export const workMedia: Record<string, WorkMedia> = {
  fourlinq: { og: "/work/fourlinq/og.jpg", shot: ["/work/fourlinq/shot-1.jpg", "/work/fourlinq/shot-2.jpg"] },
  "felici-artisan-gelato": {
    og: "/work/felici-artisan-gelato/og.jpg",
    shot: ["/work/felici-artisan-gelato/shot-1.jpg", "/work/felici-artisan-gelato/shot-2.jpg"],
  },
  "coffee-rush-eastridge": {
    og: "/work/coffee-rush-eastridge/og.jpg",
    shot: ["/work/coffee-rush-eastridge/shot-1.jpg", "/work/coffee-rush-eastridge/shot-2.jpg"],
  },
  "tmc-registry": { og: "/work/tmc-registry/og.jpg", shot: ["/work/tmc-registry/shot-1.jpg", "/work/tmc-registry/shot-2.jpg"] },
  "camps-ph": { og: "/work/camps-ph/og.jpg", shot: ["/work/camps-ph/shot-1.jpg", "/work/camps-ph/shot-2.jpg"] },
};

export const getWorkMedia = (slug: string | null | undefined) => (slug ? workMedia[slug] ?? null : null);
