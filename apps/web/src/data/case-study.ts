/**
 * Case studies, extracted from each client's own repository.
 *
 * PROVENANCE — this matters more than the prose. Every feature below was read
 * out of the client's source by a headless grok agent pointed at a read-only
 * checkout of that repo (`grok -p --tools read_file,list_dir,grep`), one agent
 * per repo, and each claim carries the file that proves it. Nothing here is
 * inferred from a folder name, a dependency, or a screenshot.
 *
 * The rules that keep this honest, and that a future edit must not relax:
 *
 *  1. `proof` is a real path in the client repo. If a claim cannot name one,
 *     it does not go on the page.
 *  2. Findings the agent marked uncertain, and defects it noticed, are NOT
 *     published. They live in the session notes for ADVO to act on — a case
 *     study is not the place to disclose that a client's cart never submits.
 *  3. A client with no entry here renders no case study, and its card falls
 *     back to the live site. Silence is the correct output for VBE Eye Center
 *     Clinic, whose repository holds no shippable source.
 *
 * Keyed by the portfolio slug from `GET /api/content/portfolio`, so the CMS
 * stays the source of truth for which clients exist at all.
 */

export interface CaseFeature {
  name: string;
  detail: string;
  /** Path in the client's repository that substantiates the claim. */
  proof: string;
}

export interface CaseStudy {
  slug: string;
  client: string;
  /** One sentence, no adjectives that the code cannot back. */
  outcome: string;
  sector: string;
  stack: string[];
  feature: CaseFeature[];
  integration: string[];
  liveUrl: string | null;
}

export const caseStudy: Record<string, CaseStudy> = {
  fourlinq: {
    slug: "fourlinq",
    client: "FourlinQ",
    sector: "Manufacturing · Windows & doors",
    outcome:
      "A windows-and-doors platform for the Philippine market: a 21-system catalogue, a five-step configurator backed by real 3D models, a retrieval-grounded assistant that will not quote a number it cannot cite, and a staff CMS with a lead inbox behind it.",
    liveUrl: "https://fourlinq.ph",
    stack: [
      "React 18 · TypeScript · Vite · React Router 6",
      "Express 5 API · PostgreSQL via node-postgres",
      "pgvector 768-d embeddings for retrieval",
      "Three.js · @react-three/fiber · drei",
      "MapLibre GL · Tailwind 3 · shadcn/ui",
      "PM2 cluster, CORS-locked to fourlinq.ph",
    ],
    feature: [
      {
        name: "Five-step design tool",
        detail:
          "Type, material, finish, glass and size from 400 to 3000 mm in 50 mm steps, with panel layouts for sliding doors. It saves to the API and always writes local storage as well, so a configuration survives an API failure rather than being lost.",
        proof: "src/pages/DesignTool.tsx",
      },
      {
        name: "Interactive 3D system viewer",
        detail:
          "One owned GLB per system. The chosen finish is applied to the frame meshes only — hardware and glass keep their own materials — and the baked open/close animation plays on demand.",
        proof: "src/components/3d/Window3D.tsx",
      },
      {
        name: "LinQ assistant, grounded in the catalogue",
        detail:
          "A streaming assistant that answers from retrieved catalogue content and accepts a photo of the visitor's wall. The prompt explicitly forbids inventing prices, U-values, decibel figures or warranty terms — the failure mode that matters most for a manufacturer.",
        proof: "src/components/chat/ChatPanel.tsx",
      },
      {
        name: "Scroll-pinned benefit sequence",
        detail:
          "A 186-frame window animation that advances by highlighted component rather than raw scroll position, so the explanation stays legible. Desktop pins the section; mobile switches to swipe.",
        proof: "src/components/home/ScrollWindow.tsx",
      },
      {
        name: "Consent-gated analytics",
        detail:
          "Page views, scroll depth, clicks and configurator changes are first-party and only ever sent after the visitor accepts. Declining, or not answering, sends nothing at all.",
        proof: "src/components/shared/CookieBanner.tsx",
      },
      {
        name: "Showroom maps and consultation booking",
        detail:
          "Three branches on MapLibre with directions links, sales numbers that open Viber on mobile, and a six-step qualifier covering project type, timeline, product interest, location and presentation mode.",
        proof: "src/pages/Brand.tsx",
      },
      {
        name: "Staff CMS and lead inbox",
        detail:
          "Role-gated admin over projects, news, products, aluminium systems, documents and media. Contact, quote and configuration enquiries land in one inbox and move through new, contacted, quoted, then won or lost.",
        proof: "src/pages/Admin.tsx",
      },
      {
        name: "Gallery that fails safe",
        detail:
          "The project gallery starts from the static catalogue and merges CMS rows over it, so a missing or broken CMS record can never delete a live gallery item. Admin cover art and ordering still win when present.",
        proof: "src/pages/Inspiration.tsx",
      },
    ],
    integration: [
      "PostgreSQL with pgvector cosine retrieval",
      "Nodemailer SMTP notifications; the enquiry still saves when mail is unconfigured",
      "MapLibre GL with keyless CARTO basemap tiles",
      "Multi-provider LLM chain, first configured key wins",
      "Viber deep links and Google Maps directions",
    ],
  },

  "tmc-registry": {
    slug: "tmc-registry",
    client: "TMC Registry",
    sector: "Hospital · Endocrinology",
    outcome:
      "A pituitary disease registry for The Medical City that enrols patients by scanning the printed Clinical Pathway form into 16 structured clinical sections, encrypts patient names, and publishes k-anonymity aggregates plus research CSV export.",
    liveUrl: "https://medicalregistry.ph",
    stack: [
      "Next.js 16 App Router · React 19 · TypeScript",
      "PostgreSQL via Prisma 7 (@prisma/adapter-pg)",
      "Tailwind 4 · shadcn/ui · Zod 4 server-action validation",
      "pdf-lib · pdf-parse · mupdf WASM · OpenCV.js · tesseract.js",
      "AES-256-GCM field encryption · scrypt password hashes",
    ],
    feature: [
      {
        name: "Paper form to structured record",
        detail:
          "Staff upload a photo, scan, PDF or DOCX of the Clinical Pathway for Pituitary Work-Up. The extractor takes the cheapest route that works: AcroForm fields via pdf-lib, DOCX table cells, born-digital PDF text, and only then optical mark recognition.",
        proof: "src/lib/template/scraper.ts",
      },
      {
        name: "Optical mark recognition for ballpen forms",
        detail:
          "For a hand-marked printed form: mupdf rasterises at 150 DPI, OpenCV applies grayscale and Otsu thresholding, Tesseract reads the row labels, then ink density decides each Yes/No and select box against the median empty ring.",
        proof: "src/lib/template/omr.ts",
      },
      {
        name: "Eligibility decided on the server",
        detail:
          "Exclusion is derived server-side rather than trusted from the browser. An excluded enrolment is stored with demographics and eligibility only; an included one writes consent, diagnosis, baseline visit and every filled clinical child in a single transaction.",
        proof: "src/app/api/patients/process-enrollment/route.ts",
      },
      {
        name: "Encrypted patient names",
        detail:
          "First and last names are AES-256-GCM ciphertext stored as bytes, decrypted only for authorised users. Everywhere else the patient is a sequential registry number — TMC-PIT-0001 onward.",
        proof: "src/lib/encryption.ts",
      },
      {
        name: "k-anonymity statistics",
        detail:
          "Age, sex, ICD, tumour type, Knosp grade, surgical approach, resection extent and outcome distributions, with every cell below a count of five suppressed. The same computation serves the in-app dashboard and the public page.",
        proof: "src/lib/statistics.ts",
      },
      {
        name: "Research CSV export, de-identified",
        detail:
          "Twelve selectable clinical domains with registry and date filters. Demographics export as registry ID and five-year age band, never names, and every export writes a DATA_EXPORTED row to the audit log.",
        proof: "src/features/exports/actions/export-data.ts",
      },
      {
        name: "Role-gated portal and audit trail",
        detail:
          "Administrator, Doctor and Encoder roles gate the sidebar and the data. Enrolment, patient edits, document uploads, visit saves, role changes and exports all append to an audit log an administrator can page through.",
        proof: "src/app/(dashboard)/admin/audit-log/page.tsx",
      },
    ],
    integration: [
      "PostgreSQL via Prisma, PgBouncer-oriented pooling",
      "Optional Clerk auth, env-gated; custom scrypt + HMAC cookie otherwise",
      "Optional Supabase Storage for original uploads",
      "Optional Upstash Redis cache for aggregate statistics",
    ],
  },

  "felici-artisan-gelato": {
    slug: "felici-artisan-gelato",
    client: "Felici Artisan Gelato",
    sector: "Food & beverage · Rizal",
    outcome:
      "A scroll-driven marketing site for the gelato brand of Reign Capunfuerza, built as a static React SPA: landing video, canvas word sequences, a 16-flavour selector, and two store locations.",
    liveUrl: "https://felicigelato.ph",
    stack: [
      "Vite 5 · React 18 SPA · react-router-dom 7",
      "GSAP 3 + ScrollTrigger · Lenis smooth scroll",
      "Canvas 2D image-sequence player via createImageBitmap",
      "Self-hosted webfonts · static client-only build",
    ],
    feature: [
      {
        name: "Orientation-aware landing video",
        detail:
          "A full-viewport muted loop that swaps between landscape and portrait sources on orientation change, overlaid with film grain and a wordmark that fades out once the visitor scrolls past 80 pixels.",
        proof: "src/sections/LandingVideo.jsx",
      },
      {
        name: "Canvas word sequences",
        detail:
          "The hero plays a 177-frame sequence at 40fps and the story band a 151-frame one, decoded through createImageBitmap onto a 2D canvas rather than shipped as video, so the type stays crisp at any density.",
        proof: "src/sections/Hero.jsx",
      },
      {
        name: "16-flavour selector",
        detail:
          "A pinned section where cone buttons and a thumbnail grid swap the centre cup, the giant italic name and the stage colour. Flavours carry real status badges — Bestseller, New, Must Try, and Not Available for Asin Tibuok.",
        proof: "src/sections/FlavorStage.jsx",
      },
      {
        name: "Two-store locator",
        detail:
          "Postcards for the Cainta cafe and the Angono gelato counter, each with its own opening hours, a muted loop that plays only once scrolled into view, and an outbound Google Maps link.",
        proof: "src/sections/Locations.jsx",
      },
      {
        name: "Contact form with a mail fallback",
        detail:
          "Validated name, email, subject and message. It POSTs JSON when a contact endpoint is configured and otherwise opens a prefilled mailto, so the form still works with no backend deployed.",
        proof: "src/pages/Contact.jsx",
      },
      {
        name: "Mobile memory and iOS viewport work",
        detail:
          "Not a visible feature, but the reason the site survives a phone: a frozen viewport unit so the iOS URL bar cannot resize full-screen sections, capped device pixel ratio, a 32-frame ring buffer, and ImageBitmaps closed after playback so the tab is not killed.",
        proof: "src/components/FrameSequence.jsx",
      },
    ],
    integration: [
      "Google Maps as outbound search links, not an embed",
      "Instagram and Facebook brand profiles",
      "mailto delivery by default, optional POST endpoint",
    ],
  },

  "coffee-rush-eastridge": {
    slug: "coffee-rush-eastridge",
    client: "Coffee Rush Eastridge",
    sector: "Cafe · Angono, Rizal",
    outcome:
      "A three-page site for the Angono cafe: a scroll-locked photographic intro through the drinks and the kitchen, a fully priced menu, and a browser-side order builder.",
    liveUrl: "https://coffee-rush-one.vercel.app",
    stack: [
      "Vanilla HTML, CSS and JavaScript — no bundler, no framework",
      "Three static pages: index, menu, order",
      "IntersectionObserver scroll reveals",
    ],
    feature: [
      {
        name: "Scroll-locked drink intro",
        detail:
          "Scrolling into the intro locks the page and steps through eight drink photographs by wheel, touch or arrow key. After the last one the cups morph into a ring around the logo and zoom out.",
        proof: "script.js",
      },
      {
        name: "Kitchen strip",
        detail:
          "A horizontal run of eight plated dishes tracks scroll position and releases the lock at the end. Scrolling back up re-enters the scene rather than skipping it.",
        proof: "script.js",
      },
      {
        name: "Priced menu",
        detail:
          "Sixteen categories from Hot Coffee Classics to Open-Face Sandwiches, rendered from a catalogue in the page with real peso prices, plus Cloud Series cards listing each flavour.",
        proof: "menu.html",
      },
      {
        name: "Order builder",
        detail:
          "Roughly 97 items across category tabs with quantity steppers, a sticky cart with line totals and subtotal, and a mobile bar that appears once the cart is not empty.",
        proof: "order.html",
      },
      {
        name: "Visit details",
        detail:
          "The cafe's own copy: Eastridge in Angono, Rizal, open 7AM to 2AM daily, with the Azotea VIP function room for private and corporate bookings.",
        proof: "index.html",
      },
    ],
    integration: [
      "Google Fonts for Fraunces and Hanken Grotesk",
      "Outbound Instagram profile links",
    ],
  },
};

export const getCaseStudy = (slug: string | null | undefined) =>
  slug ? caseStudy[slug] ?? null : null;
