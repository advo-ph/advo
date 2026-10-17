/**
 * The search layer: page meta, JSON-LD, and llms.txt (src/seo).
 */
import { describe, expect, it } from "vitest";
import { legalIdentity } from "@/lib/legal-identity";
import { BRAND, SITE_URL, postalAddress, publicPages, resolveSeo, structuredData } from "@/seo/site";
import { buildLlmsTxt } from "@/seo/llms";

const graphOf = (data: ReturnType<typeof structuredData>) => data["@graph"] as Record<string, unknown>[];

describe("public pages", () => {
  const pages = publicPages(["fourlinq", "felici-artisan-gelato", "camps-ph"]);

  it("name ADVO Technologies in every title, never bare ADVO alone", () => {
    for (const page of pages) expect(page.title).toContain(BRAND);
  });

  it("keep descriptions short enough for a search result", () => {
    for (const page of pages) expect(page.description.length).toBeLessThanOrEqual(160);
  });

  it("list a case study only when its client is in the portfolio", () => {
    const paths = pages.map((page) => page.path);
    expect(paths).toContain("/work/fourlinq");
    expect(paths).not.toContain("/work/tmc-registry");
    expect(paths).not.toContain("/work/camps-ph");
    expect(publicPages([]).some((page) => page.path.startsWith("/work/"))).toBe(false);
  });
});

describe("resolveSeo", () => {
  it("gives public pages a canonical URL without a trailing slash", () => {
    expect(resolveSeo("/about/").canonical).toBe(`${SITE_URL}/about`);
    expect(resolveSeo("/").canonical).toBe(`${SITE_URL}/`);
  });

  it("points a /project page at its case study when one exists", () => {
    expect(resolveSeo("/project/fourlinq").canonical).toBe(`${SITE_URL}/work/fourlinq`);
  });

  it("keeps signed-in, preview, and unknown pages out of the index", () => {
    for (const path of ["/admin", "/admin/leads", "/hub", "/members", "/clients", "/login", "/p/abc123", "/nope"]) {
      expect(resolveSeo(path).canonical).toBeNull();
    }
  });

  it("does not treat a public path that merely starts like a private one as private", () => {
    expect(resolveSeo("/administrator").title).toContain("Not Found");
  });
});

describe("structuredData", () => {
  const [home] = publicPages([]);
  const people = [
    { name: "Prince Wagan", role: "Founder & CEO", linkedin_url: "https://www.linkedin.com/in/example" },
    { name: "Angelo Revelo", role: "Senior Developer" },
  ];
  const graph = graphOf(structuredData(home, people));
  const org = graph.find((node) => node["@id"] === `${SITE_URL}/#organization`)!;

  it("describes one organization with its address, profiles, and founder", () => {
    expect(org.name).toBe(BRAND);
    expect(org.sameAs).toEqual(expect.arrayContaining([expect.stringContaining("linkedin.com/company/")]));
    expect(org.founder).toEqual([expect.objectContaining({ name: "Prince Wagan", sameAs: ["https://www.linkedin.com/in/example"] })]);
    expect(org.employee).toHaveLength(2);
  });

  it("serializes to valid JSON", () => {
    const json = JSON.stringify(structuredData(home, people));
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("adds a breadcrumb and the case study on a work page", () => {
    const work = publicPages(["fourlinq"]).find((page) => page.path === "/work/fourlinq")!;
    const types = graphOf(structuredData(work)).map((node) => node["@type"]);
    expect(types).toEqual(expect.arrayContaining(["BreadcrumbList", "CreativeWork", "ItemPage"]));
  });
});

describe("company facts", () => {
  it("split the same address the legal pages print", () => {
    const printed = legalIdentity.business_address;
    for (const part of [postalAddress.streetAddress, postalAddress.addressLocality, postalAddress.postalCode, postalAddress.addressRegion]) {
      expect(printed).toContain(part);
    }
  });
});

describe("buildLlmsTxt", () => {
  it("opens with the name and a summary, then links each page", () => {
    const pages = publicPages(["fourlinq"]);
    const text = buildLlmsTxt(pages, [], [{ name: "Prince Wagan", role: "Founder & CEO" }]);
    expect(text.startsWith(`# ${BRAND}\n\n> `)).toBe(true);
    expect(text).toContain(`(${SITE_URL}/start)`);
    expect(text).toContain(`(${SITE_URL}/work/fourlinq)`);
    expect(text).toContain("- Prince Wagan: Founder & CEO");
    expect(text).toContain(legalIdentity.support_email);
  });
});
