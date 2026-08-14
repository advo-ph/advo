#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const read = (relativePath) => {
  const absolutePath = join(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};

const indexHtml = read("apps/web/index.html");
const landingPage = read("apps/web/src/components/landing/LandingPage.tsx");
const startPage = read("apps/web/src/pages/Start.tsx");
const loginPage = read("apps/web/src/pages/Login.tsx");
const teamPage = read("apps/web/src/pages/Team.tsx");
const projectPage = read("apps/web/src/pages/ProjectDetail.tsx");
const readme = read("README.md");
const docsRoadmap = read("docs/ROADMAP.md");

const inventedProof = [
  "Maria Cruz",
  "Joshua Lim",
  "Andrea Reyes",
  "Northstar",
  "Common Ground",
  "Fieldwork",
];

const check = [
  {
    id: "title-meta",
    title: "Document title matches the shipped landing offer",
    passed:
      !/We Digitalize It For You/i.test(indexHtml) &&
      /<title>[^<]*(ADVO|workspace|clarity|Build together)[^<]*<\/title>/i.test(indexHtml) &&
      !/og:title" content="[^"]*Digitalize/i.test(indexHtml),
    expected:
      "apps/web/index.html title and og:title drop 'We Digitalize It For You' and name the live landing offer.",
  },
  {
    id: "proof-copy",
    title: "Landing testimonials are not invented",
    passed: inventedProof.every((name) => !landingPage.includes(name)),
    expected:
      "LandingPage.tsx contains none of the placeholder people/companies (Maria Cruz, Joshua Lim, Andrea Reyes, Northstar, Common Ground, Fieldwork). Use Fourlinq or remove the block.",
  },
  {
    id: "social-wire",
    title: "Landing social icons are real URLs",
    passed: (() => {
      const socialBlock = landingPage.match(/className="landing-social"[\s\S]*?<\/div>/);
      if (!socialBlock) return false;
      return !/href="#"/ .test(socialBlock[0]) &&
        (/settings\/public/.test(landingPage) ||
          /facebook\.com|instagram\.com|linkedin\.com|advo_ph|mailto:/.test(landingPage + socialBlock[0]));
    })(),
    expected:
      "The landing-social row has no href='#'. Wire GET /api/settings/public or the same real defaults Footer.tsx already uses.",
  },
  {
    id: "start-shell",
    title: "/start uses landing chrome",
    passed: !/from ["']@\/components\/landing\/FloatingNav["']/.test(startPage),
    expected: "Start.tsx no longer imports FloatingNav. It uses the white landing shell.",
  },
  {
    id: "login-shell",
    title: "/login uses landing chrome",
    passed: !/from ["']@\/components\/landing\/FloatingNav["']/.test(loginPage),
    expected: "Login.tsx no longer imports FloatingNav. It uses the white landing shell.",
  },
  {
    id: "team-shell",
    title: "/team uses landing chrome",
    passed:
      !/from ["']@\/components\/landing\/FloatingNav["']/.test(teamPage) &&
      !/from ["']@\/components\/landing\/Footer["']/.test(teamPage),
    expected: "Team.tsx no longer imports FloatingNav or the old Footer.",
  },
  {
    id: "project-shell",
    title: "/project/:slug uses landing chrome",
    passed:
      !/from ["']@\/components\/landing\/FloatingNav["']/.test(projectPage) &&
      !/from ["']@\/components\/landing\/Footer["']/.test(projectPage),
    expected: "ProjectDetail.tsx no longer imports FloatingNav or the old Footer.",
  },
  {
    id: "readme-state",
    title: "README describes the shipped LandingPage",
    passed:
      !/Isometric 3D scene \(React Three Fiber\)/.test(readme) &&
      !/TechTicker.*Simple Icons/.test(readme) &&
      !/organic orange blob/.test(readme) &&
      /LandingPage/.test(readme),
    expected:
      "README.md no longer lists the 3D R3F scene, Simple Icons ticker, or orange blob CTA as the current public landing. It names LandingPage.",
  },
  {
    id: "docs-current",
    title: "docs/ROADMAP matches the shipped landing",
    passed:
      !/in-progress codex landing/i.test(docsRoadmap) &&
      !/only the hero\+services copy port shipped/i.test(docsRoadmap),
    expected:
      "docs/ROADMAP.md no longer says the Codex landing is in-progress or that only a hero/services copy port shipped.",
  },
];

let failed = 0;
for (const row of check) {
  const mark = row.passed ? "PASS" : "FAIL";
  if (!row.passed) failed += 1;
  console.log(`[${mark}] ${row.id} — ${row.title}`);
  if (!row.passed) console.log(`         ${row.expected}`);
}

console.log(
  `\n${failed === 0 ? "PASS" : "FAIL"} — ${check.length - failed}/${check.length} landing-follow check(s) green`,
);
process.exit(failed === 0 ? 0 : 1);
