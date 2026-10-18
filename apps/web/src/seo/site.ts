/**
 * What search engines and AI assistants are told about each page.
 *
 * One table, three readers:
 *   - RouteSeo sets the tab title and meta tags while a visitor browses.
 *   - scripts/prerender.mjs writes each public page's HTML, the sitemap, and
 *     llms.txt at build time, for crawlers that never run JavaScript (GPTBot,
 *     ClaudeBot, PerplexityBot).
 *   - The JSON-LD below names ADVO Technologies as one company with one address
 *     and one set of profiles.
 *
 * Every title carries "ADVO Technologies", never bare "ADVO". The bare word also
 * means an Australian court order and several unrelated companies, so the full
 * name is what lets Google and Gemini tell this ADVO apart.
 */
import { caseStudy, getCaseStudy } from "@/data/case-study";
import { getWorkMedia } from "@/data/work-media";
import { industry, heroHeading } from "@/components/landing/landing-content";
import { legalIdentity } from "@/lib/legal-identity";

export const SITE_URL = "https://advo.ph";
export const BRAND = "ADVO Technologies";

const ORG_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

/** 09xx… as printed on the legal pages, in the +63 form schema.org expects. */
const toE164 = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? `+63${digits.slice(1)}` : `+${digits}`;
};

/**
 * Mirrors business_address in data/legal-identity.json, split into the parts
 * schema.org wants. src/test/seo-site.test.ts fails if the two drift apart.
 */
export const postalAddress = {
  streetAddress: "Greenhills Heights, 136 Pinaglabanan St., Pedro Cruz",
  addressLocality: "San Juan City",
  addressRegion: "Metro Manila",
  postalCode: "1500",
  addressCountry: "PH",
};

/** Official profiles. Add each new one here; Google uses them to confirm the company. */
export const sameAs = [
  "https://www.facebook.com/profile.php?id=61587366270460",
  "https://www.instagram.com/advo_ph/",
  "https://www.linkedin.com/company/advocompany/",
  "https://github.com/advo-ph",
];

export const company = {
  name: BRAND,
  alternateName: ["ADVO", "ADVO PH", "advo.ph"],
  legalName: legalIdentity.legal_name,
  registration: `${legalIdentity.registration_body}, no. ${legalIdentity.registration_number}`,
  description:
    "ADVO Technologies is a Philippine technology company. It builds websites, web and mobile apps, business systems, and on-site hardware such as ID gates, turnstiles, and automated car parks for businesses, schools, clinics, and local governments.",
  slogan: heroHeading,
  email: legalIdentity.support_email,
  telephone: toE164(legalIdentity.support_phone),
  foundingDate: "2026-01-29",
};

/** The core services, in the words the landing page already uses. */
export const coreService = [
  { name: "Website development", copy: "Business websites with lead capture, online booking, and reporting." },
  { name: "Web and mobile app development", copy: "A dedicated website and app for an institution and its users." },
  { name: "Business systems", copy: "Billing, POS, scheduling, and data migration in one system." },
  { name: "AI automation", copy: "AI answers calls, books clients, and follows up." },
];

export const HOME_TITLE = `${BRAND} | Web and App Development in the Philippines`;
export const HOME_DESCRIPTION =
  "ADVO Technologies builds websites, apps, and business systems for Philippine companies, from school ID gates to automated car parks. Get a quote in 24 hours.";

export type PageKind = "WebPage" | "AboutPage" | "ContactPage" | "ItemPage";

export interface PageSeo {
  /** Canonical path, no trailing slash. */
  path: string;
  title: string;
  description: string;
  kind: PageKind;
  /** Breadcrumb label. The home page has none. */
  crumb?: string;
  /** Absolute share image when the page has its own; otherwise the site's og-image.jpg. */
  image?: { url: string; alt: string };
}

const staticPage: PageSeo[] = [
  { path: "/", title: HOME_TITLE, description: HOME_DESCRIPTION, kind: "WebPage" },
  {
    path: "/about",
    title: `About ${BRAND}`,
    description:
      "ADVO Technologies is a Philippine team building websites and systems that make everyday work easier. Meet the people and see when we started.",
    kind: "AboutPage",
    crumb: "About",
  },
  {
    path: "/team",
    title: `Team | ${BRAND}`,
    description: "Meet the people at ADVO Technologies who design, build, and support websites and systems for Philippine businesses.",
    kind: "AboutPage",
    crumb: "Team",
  },
  {
    path: "/start",
    title: `Start a Project | ${BRAND}`,
    description: "Tell ADVO Technologies what you need to build or modernize. Get the scope, timeline, and price within 24 hours.",
    kind: "ContactPage",
    crumb: "Start a project",
  },
  {
    path: "/client-guide",
    title: `Client Guide | ${BRAND}`,
    description: "How a project with ADVO Technologies works: plan, build, review, and launch, and what we need from you.",
    kind: "WebPage",
    crumb: "Client guide",
  },
  {
    path: "/behind-the-scenes",
    title: `Hosting and Support | ${BRAND}`,
    description: "How ADVO Technologies hosts and supports your website after launch, and our business registration in the Philippines.",
    kind: "WebPage",
    crumb: "Behind the scenes",
  },
  {
    path: "/terms",
    title: `Terms and Conditions | ${BRAND}`,
    description: "The terms for software ADVO Technologies builds and operates for clients.",
    kind: "WebPage",
    crumb: "Terms",
  },
  {
    path: "/privacy",
    title: `Privacy Policy | ${BRAND}`,
    description: "What ADVO Technologies collects when you use this site or the Client Hub, and how we protect it.",
    kind: "WebPage",
    crumb: "Privacy",
  },
  {
    path: "/refund",
    title: `Refund Policy | ${BRAND}`,
    description: "How returns and refunds work for ADVO Technologies software work and hardware.",
    kind: "WebPage",
    crumb: "Refunds",
  },
  {
    path: "/dispute",
    title: `Dispute Resolution | ${BRAND}`,
    description: "How to raise a problem with a payment, a deliverable, or an account at ADVO Technologies.",
    kind: "WebPage",
    crumb: "Disputes",
  },
];

/** Cut on a word so a description never ends mid-word. */
const clip = (text: string, limit = 160) => {
  if (text.length <= limit) return text;
  const head = text.slice(0, limit - 1);
  return `${head.slice(0, head.lastIndexOf(" ")).replace(/[,;:.\s]+$/, "")}…`;
};

const workPage = (slug: string): PageSeo | null => {
  const study = getCaseStudy(slug);
  if (!study) return null;
  const share = getWorkMedia(slug)?.og;
  return {
    path: `/work/${slug}`,
    title: `${study.client} Case Study | ${BRAND}`,
    description: clip(`${study.client}, built by ADVO Technologies. ${study.outcome}`),
    kind: "ItemPage",
    crumb: study.client,
    ...(share ? { image: { url: `${SITE_URL}${share}`, alt: `${study.client}, built by ${BRAND}` } } : {}),
  };
};

/**
 * The pages to put in the sitemap and render to HTML. A case study only counts
 * once its client is in the portfolio, because /work/:slug says "No such
 * project" otherwise. With no portfolio (the API was down at build time) no
 * case study is listed, rather than risk listing a page that says "No such project".
 */
export const publicPages = (portfolioSlugs: string[]): PageSeo[] => {
  const studySlugs = Object.keys(caseStudy).filter((slug) => portfolioSlugs.includes(slug));
  return [...staticPage, ...studySlugs.map(workPage).filter((page): page is PageSeo => page !== null)];
};

/** Signed-in, preview, and auth pages. Never indexed. */
const privatePage: [prefix: string, title: string][] = [
  ["/login", "Sign in"],
  ["/members", "Members"],
  ["/clients", "Client Hub sign in"],
  ["/hub", "Client Hub"],
  ["/admin", "Admin"],
  ["/p/", "Preview"],
];

export interface ResolvedSeo {
  title: string;
  description: string;
  /** Absolute canonical URL, or null when the page must not be indexed. */
  canonical: string | null;
}

const normalize = (pathname: string) => (pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname) || "/";

/** Meta for any path the router can show, including private and unknown ones. */
export const resolveSeo = (pathname: string): ResolvedSeo => {
  const path = normalize(pathname);

  const known = staticPage.find((page) => page.path === path);
  if (known) return { title: known.title, description: known.description, canonical: `${SITE_URL}${known.path}` };

  const work = path.match(/^\/(work|project)\/([^/]+)$/);
  if (work) {
    const [, kind, slug] = work;
    const page = workPage(slug);
    if (page) return { title: page.title, description: page.description, canonical: `${SITE_URL}${page.path}` };
    return {
      title: `Our Work | ${BRAND}`,
      description: HOME_DESCRIPTION,
      canonical: `${SITE_URL}/${kind}/${slug}`,
    };
  }

  const hidden = privatePage.find(([prefix]) => path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
  if (hidden) return { title: `${hidden[1]} | ${BRAND}`, description: HOME_DESCRIPTION, canonical: null };

  return { title: `Page Not Found | ${BRAND}`, description: HOME_DESCRIPTION, canonical: null };
};

// ─── JSON-LD ──────────────────────────────────────────────────────────────────

/** A team member as the public team page shows them. */
export interface PublicPerson {
  name: string;
  role: string;
  linkedin_url?: string | null;
  github_url?: string | null;
}

const personNode = (person: PublicPerson) => {
  const profiles = [person.linkedin_url, person.github_url].filter((profile): profile is string => Boolean(profile));
  return { "@type": "Person", name: person.name, jobTitle: person.role, ...(profiles.length ? { sameAs: profiles } : {}) };
};

const organizationNode = (people: PublicPerson[]) => ({
  "@type": ["Organization", "ProfessionalService"],
  "@id": ORG_ID,
  name: company.name,
  alternateName: company.alternateName,
  legalName: company.legalName,
  url: `${SITE_URL}/`,
  logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-512.png`, width: 512, height: 512 },
  image: `${SITE_URL}/og-image.jpg`,
  description: company.description,
  slogan: company.slogan,
  email: company.email,
  telephone: company.telephone,
  foundingDate: company.foundingDate,
  address: { "@type": "PostalAddress", ...postalAddress },
  areaServed: { "@type": "Country", name: "Philippines" },
  sameAs,
  ...(people.some((person) => /founder/i.test(person.role))
    ? { founder: people.filter((person) => /founder/i.test(person.role)).map(personNode) }
    : {}),
  ...(people.length ? { employee: people.map(personNode) } : {}),
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "sales",
    email: company.email,
    telephone: company.telephone,
    areaServed: "PH",
    url: `${SITE_URL}/start`,
  },
  knowsAbout: [
    "Website development",
    "Web application development",
    "Mobile app development",
    "Point of sale systems",
    "Clinic management systems",
    "Electronic medical records",
    "Parking management systems",
    "License plate recognition",
    "Student ID authentication",
    "Flood monitoring",
    "AI automation",
  ],
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: `What ${BRAND} builds`,
    itemListElement: [
      ...coreService.map((service) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: service.name, description: service.copy, provider: { "@id": ORG_ID } },
      })),
      ...industry.map((item) => ({
        "@type": "OfferCatalog",
        name: `${item.title}: ${item.heading}`,
        description: item.copy,
        itemListElement: item.offer.map((offer) => ({
          "@type": "Offer",
          itemOffered: { "@type": "Service", name: offer.name, description: offer.copy, provider: { "@id": ORG_ID } },
        })),
      })),
    ],
  },
});

const websiteNode = () => ({
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  name: BRAND,
  alternateName: ["ADVO", "advo.ph"],
  url: `${SITE_URL}/`,
  inLanguage: "en-PH",
  publisher: { "@id": ORG_ID },
});

/** The full JSON-LD graph for one public page. `people` is the public team, when the API answered. */
export const structuredData = (page: PageSeo, people: PublicPerson[] = []) => {
  const url = page.path === "/" ? `${SITE_URL}/` : `${SITE_URL}${page.path}`;
  const graph: Record<string, unknown>[] = [
    organizationNode(people),
    websiteNode(),
    {
      "@type": page.kind,
      "@id": `${url}#webpage`,
      url,
      name: page.title,
      description: page.description,
      inLanguage: "en-PH",
      isPartOf: { "@id": WEBSITE_ID },
      about: { "@id": ORG_ID },
      publisher: { "@id": ORG_ID },
      primaryImageOfPage: page.image?.url ?? `${SITE_URL}/og-image.jpg`,
      ...(page.crumb ? { breadcrumb: { "@id": `${url}#breadcrumb` } } : {}),
    },
  ];

  if (page.crumb) {
    graph.push({
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: BRAND, item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: page.crumb, item: url },
      ],
    });
  }

  const study = page.path.startsWith("/work/") ? getCaseStudy(page.path.slice("/work/".length)) : null;
  if (study) {
    graph.push({
      "@type": "CreativeWork",
      "@id": `${url}#work`,
      name: `${study.client} by ${BRAND}`,
      description: study.outcome,
      genre: study.sector,
      creator: { "@id": ORG_ID },
      about: { "@type": "Organization", name: study.client, ...(study.liveUrl ? { url: study.liveUrl } : {}) },
      mainEntityOfPage: { "@id": `${url}#webpage` },
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
};
