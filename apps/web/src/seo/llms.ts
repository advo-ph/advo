/**
 * /llms.txt: a plain Markdown summary of ADVO Technologies for AI assistants,
 * in the format proposed at https://llmstxt.org. Built at deploy time by
 * scripts/prerender.mjs from the same data the pages render, so it never says
 * something the site does not.
 */
import type { ShippedProject } from "@/hooks/usePortfolio";
import { clientGuideStages } from "@/data/client-guide";
import { getCaseStudy } from "@/data/case-study";
import { industry, industryTab, marqueeLogos, serviceChapters, servicesTitle } from "@/components/landing/landing-content";
import { BRAND, SITE_URL, company, coreService, postalAddress, sameAs, type PageSeo, type PublicPerson } from "./site";

const url = (path: string) => (path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`);

export const buildLlmsTxt = (pages: PageSeo[], portfolio: ShippedProject[], people: PublicPerson[]) => {
  const address = [
    postalAddress.streetAddress,
    `${postalAddress.addressLocality} ${postalAddress.postalCode}`,
    postalAddress.addressRegion,
    "Philippines",
  ].join(", ");

  const clients = portfolio.length
    ? portfolio.map((item) => `- ${item.title}${item.live_url ? ` (${item.live_url})` : ""}${item.blurb ? `: ${item.blurb}` : ""}`)
    : marqueeLogos.map((logo) => `- ${logo.alt}`);

  const studies = pages
    .filter((page) => page.path.startsWith("/work/"))
    .map((page) => {
      const study = getCaseStudy(page.path.slice("/work/".length));
      return `- [${study?.client ?? page.crumb}](${url(page.path)}): ${study?.outcome ?? page.description}`;
    });

  const lines = [
    `# ${BRAND}`,
    "",
    `> ${company.description} Website: ${SITE_URL}. Every project is quoted, with the scope, timeline, and price sent within 24 hours.`,
    "",
    `${BRAND} is also written ADVO or ADVO PH. It is a different entity from the Australian court order called an ADVO (Apprehended Domestic Violence Order) and from other companies named Advo.`,
    "",
    "## What we build",
    "",
    ...coreService.map((service) => `- ${service.name}: ${service.copy}`),
    "",
    ...industry.flatMap((item) => [
      `### ${item.title}: ${item.heading}`,
      "",
      item.copy,
      "",
      ...item.offer.map((offer) => `- ${offer.name}: ${offer.copy}`),
      ...(item.href ? [`- More: ${item.href}`] : []),
      "",
    ]),
    "## Industries we modernize",
    "",
    ...industryTab.map((item) => `- ${item.title} (${item.heading}): ${item.copy}`),
    "",
    `## ${servicesTitle}`,
    "",
    ...serviceChapters.map((chapter) => `- ${chapter.title}: ${chapter.line} (${chapter.chips.join(", ")})`),
    "",
    "## Clients",
    "",
    ...clients,
    "",
    ...(studies.length ? ["## Case studies", "", ...studies, ""] : []),
    ...(people.length ? ["## Team", "", ...people.map((person) => `- ${person.name}: ${person.role}`), ""] : []),
    "## How a project works",
    "",
    ...clientGuideStages.map(([title, text], index) => `${index + 1}. ${title}: ${text}`),
    "",
    `To start, describe the project at ${SITE_URL}/start or email ${company.email}.`,
    "",
    "## Company facts",
    "",
    `- Name: ${BRAND}`,
    `- Registered business name: ${company.legalName}, registered with the ${company.registration}`,
    `- Founded: January 29, 2026`,
    `- Address: ${address}`,
    `- Serves: businesses, schools, clinics, and local governments across the Philippines`,
    `- Email: ${company.email}`,
    `- Phone: ${company.telephone}`,
    ...sameAs.map((profile) => `- Profile: ${profile}`),
    "",
    "## Pages",
    "",
    ...pages
      .filter((page) => !page.path.startsWith("/work/") && !["/terms", "/privacy", "/refund", "/dispute"].includes(page.path))
      .map((page) => `- [${page.crumb ?? "Home"}](${url(page.path)}): ${page.description}`),
    "",
    "## Optional",
    "",
    `- [Full text of every page](${SITE_URL}/llms-full.txt)`,
    ...pages
      .filter((page) => ["/terms", "/privacy", "/refund", "/dispute"].includes(page.path))
      .map((page) => `- [${page.crumb}](${url(page.path)}): ${page.description}`),
    "",
  ];

  return lines.join("\n");
};
