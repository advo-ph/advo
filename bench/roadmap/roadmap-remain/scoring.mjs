#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relativePath) => {
  const absolutePath = join(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};
const has = (relativePath) => existsSync(join(repoRoot, relativePath));

const projectRoute = read("apps/api/src/routes/projects.routes.ts");
const availability = read("apps/web/src/components/admin/AdminAvailability.tsx");
const calendar = read("apps/web/src/components/admin/AdminCalendar.tsx");
const command = read("apps/web/src/components/admin/ProjectCommandCenter.tsx");
const adminLeads = read("apps/web/src/components/admin/AdminLeads.tsx");
const sidebar = read("apps/web/src/components/admin/AdminSidebar.tsx");
const adminPage = read("apps/web/src/pages/Admin.tsx");
const app = read("apps/web/src/App.tsx");
const adminProjects = read("apps/web/src/components/admin/AdminProjects.tsx");
const adminClients = read("apps/web/src/components/admin/AdminClients.tsx");
const adminSettings = read("apps/web/src/components/admin/AdminSettings.tsx");
const adminNotify = read("apps/web/src/components/admin/AdminNotifications.tsx");
const adminDash = read("apps/web/src/components/admin/AdminDashboard.tsx");
const adminSocial = read("apps/web/src/components/admin/AdminSocial.tsx");
const adminTeam = read("apps/web/src/components/admin/AdminTeam.tsx");
const dbTs = read("apps/web/src/lib/db.ts");
const useAdminTeam = read("apps/web/src/hooks/useAdminTeam.ts");
const hubDash = read("apps/web/src/components/hub/ProjectDashboard.tsx");
const hubPage = read("apps/web/src/pages/Hub.tsx");
const landingPage = read("apps/web/src/components/landing/LandingPage.tsx");
const loginPage = read("apps/web/src/pages/Login.tsx");
const startPage = read("apps/web/src/pages/Start.tsx");
const wiring = read("apps/web/src/test/api-wiring.test.ts");
const setup = read("docs/SETUP.md");
const indexTs = read("apps/api/src/index.ts");
const emailService = read("apps/api/src/services/email.service.ts");
const brandRoute = read("apps/api/src/routes/brand-analysis.routes.ts");
const scrapeUi = read("apps/web/src/components/admin/AdminBrandScraper.tsx");

const check = [
  {
    id: "capacity-view",
    passed:
      /teamMemberId/.test(projectRoute) &&
      /capacit/i.test(availability) &&
      has("apps/web/src/lib/capacity.ts"),
    expected: "projects list exposes teamMemberId; Availability shows capacity.",
  },
  {
    id: "junior-assign",
    passed:
      /\/team/.test(projectRoute) &&
      (/assign/i.test(command) || /assign/i.test(adminProjects)) &&
      has("apps/web/src/lib/project-assign.ts"),
    expected: "POST/DELETE project team + UI assign exist.",
  },
  {
    id: "blackout-calendar",
    passed: /blackout/i.test(calendar),
    expected: "Calendar surfaces a school/blackout layer (not only Availability type colors).",
  },
  {
    id: "lead-import",
    passed: has("scripts/import-clinic-lead.ts") && has("data/clinic-lead/sample.json"),
    expected: "Importer script + sample fixture.",
  },
  {
    id: "targeting-rule",
    passed: has("apps/web/src/lib/targeting.ts") && /outdated|zero.?system/i.test(adminLeads + read("apps/web/src/lib/targeting.ts")),
    expected: "Leads can filter to zero/outdated systems.",
  },
  {
    id: "proposal-tracker",
    passed: has("apps/web/src/components/admin/AdminProposals.tsx") && /proposal/i.test(adminPage + sidebar),
    expected: "Admin Proposals section exists and is mounted.",
  },
  {
    id: "proposal-pdf",
    passed: has("apps/api/src/services/proposal.service.ts") && has("apps/api/migrations/010_proposal.sql"),
    expected: "Template-fill proposal service + migration 010.",
  },
  {
    id: "library",
    passed: has("apps/web/src/components/admin/AdminLibrary.tsx") && /library/i.test(adminPage + sidebar),
    expected: "Admin Library MVP mounted.",
  },
  {
    id: "project-form",
    passed: /ProjectForm|full-page|isPage/i.test(adminProjects) || has("apps/web/src/lib/project-form.ts"),
    expected: "Projects CRUD is a page form, not only a modal.",
  },
  {
    id: "client-form",
    passed: /ClientForm|full-page|isPage/i.test(adminClients),
    expected: "Clients CRUD is a page form, not only a modal.",
  },
  {
    id: "scraper-submenu",
    passed: /isToolOpen|toolsExpanded/.test(sidebar),
    expected: "Scrapers sit behind a collapsible Tools control (isToolOpen / toolsExpanded).",
  },
  {
    id: "preview-route",
    passed: /path=["']\/p\/:token["']/.test(app) && has("apps/web/src/pages/PreviewLink.tsx"),
    expected: "App mounts /p/:token.",
  },
  {
    id: "r2-asset-select",
    passed: !/typeEl\?\.textContent/.test(adminProjects) && /assetType/.test(adminProjects),
    expected: "Add-asset type is controlled state; no typeEl?.textContent.",
  },
  {
    id: "w7-scrape-delete",
    passed: /delete/i.test(scrapeUi) && /history/i.test(scrapeUi),
    expected: "Brand scraper history can be deleted in the UI.",
  },
  {
    id: "w1-branding",
    passed: /get\([^)]*\/api\/settings\/agency_name/.test(adminSettings),
    expected: "Settings branding GETs /api/settings/agency_name to hydrate.",
  },
  {
    id: "w2-admin-user",
    passed: /role:\s*["']admin["']|role:\s*"admin"/.test(adminSettings + read("apps/api/src/routes/team.routes.ts") + read("apps/api/src/routes/auth.routes.ts")),
    expected: "Add Admin creates a user with role admin.",
  },
  {
    id: "w3-notify-rule",
    passed: /auto.?rule|inactive|not yet/i.test(adminNotify + emailService + read("apps/api/src/routes/notifications.routes.ts")),
    expected: "Auto-rules are honored or labeled inactive.",
  },
  {
    id: "w4-activity",
    passed: /getRecentProgressUpdates/.test(dbTs) && !/data: \[\]/.test((dbTs.match(/getRecentProgressUpdates[\s\S]{0,800}/) || [""])[0]),
    expected: "getRecentProgressUpdates no longer returns { data: [] }.",
  },
  {
    id: "w5-social-stats",
    passed: !/1\.2K/.test(adminSocial) && !/followers: "856"/.test(adminSocial),
    expected: "Hardcoded follower counts (1.2K / 856) are gone or not shown as live.",
  },
  {
    id: "r3-team-reorder",
    passed: !/\[\.\.\.displayMembers\]/.test(adminTeam) && /allMembers/.test(adminTeam),
    expected: "Reorder mutates allMembers, not the filtered displayMembers.",
  },
  {
    id: "r4-team-order",
    passed: /settings\/public/.test(useAdminTeam),
    expected: "useAdminTeam reads team_order from /api/settings/public.",
  },
  {
    id: "change-order-form",
    passed:
      /change.?order/i.test(hubDash + hubPage) &&
      (has("apps/api/src/routes/change-order.routes.ts") || /change.?order/i.test(projectRoute)),
    expected: "Hub change-order form + API.",
  },
  {
    id: "reduced-motion-site",
    passed: /useReducedMotion|prefers-reduced-motion/.test(landingPage) && /reduceMotion/.test(read("apps/web/src/components/landing/landing-shell.tsx")),
    expected: "LandingPage + landing-shell honor reduced motion.",
  },
  {
    id: "viewport-site",
    passed: has("bench/roadmap/roadmap-remain/viewport-site.mjs"),
    expected: "Viewport/source check for the shipped LandingPage.",
  },
  {
    id: "shell-interior",
    passed: !/hsl\(var\(--border\)\)/.test(loginPage) && !/hsl\(var\(--border\)\)/.test(startPage),
    expected: "Login/Start interiors no longer use the dark Linear grid.",
  },
  {
    id: "destination-test",
    passed: has("apps/web/src/lib/destination.ts") && has("apps/web/src/test/destination.test.ts"),
    expected: "destinationFor is extracted and tested.",
  },
  {
    id: "settings-public-test",
    passed: /settings\/public/.test(wiring),
    expected: "api-wiring covers GET /api/settings/public.",
  },
  {
    id: "asset-delete-test",
    passed: /assets\/:assetId|assets\/\$\{/.test(wiring) && /DELETE/.test(wiring),
    expected: "api-wiring covers scoped asset DELETE.",
  },
  {
    id: "lead-email-test",
    passed: /sendLeadNotification|lead.*email|mailer/i.test(wiring),
    expected: "Lead create asserts the mailer side-effect.",
  },
  {
    id: "ai-contract-test",
    passed: has("apps/web/src/test/contract-ai.test.ts") || /method.*ai|anthropic/i.test(wiring),
    expected: "AI contract path has a mocked test.",
  },
  {
    id: "proof-card-test",
    passed: has("apps/web/src/test/proof-card.test.ts") || /getProof/.test(read("apps/web/src/test/proof-card.test.ts")),
    expected: "Portfolio getProof fallbacks are tested.",
  },
  {
    id: "wiring-method-test",
    passed:
      /leads\/bulk/.test(wiring) &&
      /convert/.test(wiring) &&
      /team\/reorder/.test(wiring) &&
      /broadcast/.test(wiring) &&
      /availability/.test(wiring),
    expected: "api-wiring covers bulk, convert, reorder, broadcast, availability.",
  },
  {
    id: "brand-analysis-gone",
    passed: !has("apps/api/src/routes/brand-analysis.routes.ts") || !/brand-analysis/.test(indexTs),
    expected: "Vertex brand-analysis route is gone or unmounted.",
  },
  {
    id: "monitor-backup",
    passed: /pg_dump|nightly|backup/i.test(setup) && has("apps/api/backup.sh"),
    expected: "SETUP documents backup/health; backup.sh exists.",
  },
  {
    id: "pwa-install",
    passed: has("apps/web/public/manifest.webmanifest") && /vite-plugin-pwa|manifest/.test(read("apps/web/vite.config.ts") + read("apps/web/index.html")),
    expected: "PWA manifest + plugin/link.",
  },
];

let failed = 0;
for (const row of check) {
  const mark = row.passed ? "PASS" : "FAIL";
  if (!row.passed) failed += 1;
  console.log(`[${mark}] ${row.id}`);
  if (!row.passed) console.log(`         ${row.expected}`);
}
console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${check.length - failed}/${check.length} roadmap-remain check(s) green`);
process.exit(failed === 0 ? 0 : 1);
