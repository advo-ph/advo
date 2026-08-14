import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const wt = (name) => `C:/Users/maran/Antigravity/advo-lane-${name}`;

const lane = [
  {
    name: "staff",
    port: 6440,
    item: ["capacity-view", "junior-assign", "blackout-calendar"],
    owns_file: [
      "apps/api/src/routes/projects.routes.ts",
      "apps/api/src/utils/project-capacity.ts",
      "apps/web/src/components/admin/AdminAvailability.tsx",
      "apps/web/src/components/admin/AdminCalendar.tsx",
      "apps/web/src/components/admin/ProjectCommandCenter.tsx",
      "apps/web/src/hooks/useOrgProjects.ts",
      "apps/web/src/lib/capacity.ts",
      "apps/web/src/lib/project-assign.ts",
      "apps/web/src/test/capacity.test.ts",
      "apps/web/src/test/project-assign.test.ts",
    ],
    done_when:
      "node bench/roadmap/roadmap-remain/scoring.mjs — capacity-view, junior-assign, blackout-calendar PASS",
  },
  {
    name: "lead",
    port: 6441,
    item: ["lead-import", "targeting-rule", "proposal-tracker", "proposal-pdf"],
    owns_file: [
      "apps/web/src/components/admin/AdminLeads.tsx",
      "apps/web/src/components/admin/AdminProposals.tsx",
      "apps/api/src/routes/leads.routes.ts",
      "apps/api/src/routes/proposal.routes.ts",
      "apps/api/src/services/proposal.service.ts",
      "apps/api/migrations/010_proposal.sql",
      "apps/web/src/lib/targeting.ts",
      "apps/web/src/lib/proposal-tracker.ts",
      "scripts/import-clinic-lead.ts",
      "data/clinic-lead/sample.json",
      "apps/web/src/test/targeting.test.ts",
      "apps/web/src/test/proposal-tracker.test.ts",
    ],
    done_when:
      "node bench/roadmap/roadmap-remain/scoring.mjs — lead-import, targeting-rule, proposal-tracker, proposal-pdf PASS",
  },
  {
    name: "admin",
    port: 6442,
    item: ["library", "project-form", "client-form", "scraper-submenu", "preview-route", "r2-asset-select", "w7-scrape-delete"],
    owns_file: [
      "apps/web/src/pages/Admin.tsx",
      "apps/web/src/components/admin/AdminSidebar.tsx",
      "apps/web/src/components/admin/AdminProjects.tsx",
      "apps/web/src/components/admin/AdminClients.tsx",
      "apps/web/src/components/admin/AdminLibrary.tsx",
      "apps/web/src/components/admin/AdminBrandScraper.tsx",
      "apps/web/src/components/admin/AdminFacebookScraper.tsx",
      "apps/web/src/App.tsx",
      "apps/web/src/pages/PreviewLink.tsx",
      "apps/web/src/hooks/usePreviewLink.ts",
      "apps/api/src/routes/library.routes.ts",
      "apps/api/migrations/011_library_item.sql",
      "apps/web/src/lib/library.ts",
      "apps/web/src/lib/project-form.ts",
      "apps/web/src/test/library.test.ts",
      "apps/web/src/test/preview-link.test.ts",
    ],
    done_when:
      "node bench/roadmap/roadmap-remain/scoring.mjs — library, project-form, client-form, scraper-submenu, preview-route, r2-asset-select, w7-scrape-delete PASS",
  },
  {
    name: "wiring",
    port: 6443,
    item: ["w1-branding", "w2-admin-user", "w3-notify-rule", "w4-activity", "w5-social-stats", "r3-team-reorder", "r4-team-order"],
    owns_file: [
      "apps/web/src/components/admin/AdminSettings.tsx",
      "apps/web/src/components/admin/AdminNotifications.tsx",
      "apps/web/src/components/admin/AdminDashboard.tsx",
      "apps/web/src/components/admin/AdminSocial.tsx",
      "apps/web/src/components/admin/AdminTeam.tsx",
      "apps/web/src/lib/db.ts",
      "apps/web/src/hooks/useAdminTeam.ts",
      "apps/api/src/routes/team.routes.ts",
      "apps/api/src/routes/notifications.routes.ts",
      "apps/api/src/services/email.service.ts",
    ],
    done_when:
      "node bench/roadmap/roadmap-remain/scoring.mjs — w1-branding, w2-admin-user, w3-notify-rule, w4-activity, w5-social-stats, r3-team-reorder, r4-team-order PASS",
  },
  {
    name: "hub",
    port: 6444,
    item: ["change-order-form"],
    owns_file: [
      "apps/web/src/pages/Hub.tsx",
      "apps/web/src/components/hub/ProjectDashboard.tsx",
      "apps/api/src/routes/change-order.routes.ts",
      "apps/api/migrations/009_change_order.sql",
    ],
    done_when: "node bench/roadmap/roadmap-remain/scoring.mjs — change-order-form PASS",
  },
  {
    name: "site",
    port: 6445,
    item: ["reduced-motion-site", "viewport-site", "shell-interior", "destination-test"],
    owns_file: [
      "apps/web/src/components/landing/LandingPage.tsx",
      "apps/web/src/components/landing/landing-page.css",
      "apps/web/src/components/landing/landing-shell.tsx",
      "apps/web/src/pages/Start.tsx",
      "apps/web/src/pages/Login.tsx",
      "apps/web/src/pages/Team.tsx",
      "apps/web/src/pages/ProjectDetail.tsx",
      "apps/web/src/lib/destination.ts",
      "apps/web/src/test/destination.test.ts",
      "bench/roadmap/roadmap-remain/viewport-site.mjs",
    ],
    done_when:
      "node bench/roadmap/roadmap-remain/scoring.mjs — reduced-motion-site, viewport-site, shell-interior, destination-test PASS",
  },
  {
    name: "test",
    port: 6446,
    item: [
      "settings-public-test",
      "asset-delete-test",
      "lead-email-test",
      "ai-contract-test",
      "proof-card-test",
      "wiring-method-test",
    ],
    owns_file: [
      "apps/web/src/test/api-wiring.test.ts",
      "apps/web/src/test/e2e-flow.test.ts",
      "apps/web/src/test/proof-card.test.ts",
      "apps/web/src/test/contract-ai.test.ts",
    ],
    done_when:
      "node bench/roadmap/roadmap-remain/scoring.mjs — settings-public-test, asset-delete-test, lead-email-test, ai-contract-test, proof-card-test, wiring-method-test PASS",
  },
  {
    name: "ops",
    port: 6447,
    item: ["brand-analysis-gone", "monitor-backup", "pwa-install"],
    owns_file: [
      "apps/api/src/routes/brand-analysis.routes.ts",
      "apps/api/src/services/brand-analysis.service.ts",
      "apps/web/src/test/brand-analysis-decommission.test.ts",
      "apps/web/vite.config.ts",
      "apps/web/index.html",
      "apps/web/public/manifest.webmanifest",
      "docs/SETUP.md",
    ],
    done_when:
      "node bench/roadmap/roadmap-remain/scoring.mjs — brand-analysis-gone, monitor-backup, pwa-install PASS",
  },
];

for (const l of lane) {
  l.branch = `lane/${l.name}`;
  l.worktree = wt(l.name);
  l.builder = "grok";
  l.resume = false;
  l.forbidden_file = lane.filter((o) => o.name !== l.name).flatMap((o) => o.owns_file);
}

const plan = {
  tier: "roadmap-remain",
  execution: "parallel",
  isolation: "worktree",
  scope_item: lane.flatMap((l) => l.item),
  design_blocked: [
    { item: "lawyer", why: "Human must engage counsel." },
    { item: "legal-bind", why: "CONTRACTS.md drafts cannot bind without the lawyer." },
    { item: "anthropic-prod", why: "Owner secret on the VPS, not a lane." },
    { item: "here-now", why: "Needs here.now API key. Deferred in ROADMAP." },
    { item: "calendar-sync", why: "Phase 3 needs Google OAuth client ids." },
    { item: "pay-link", why: "Needs PayMongo/Xendit merchant account." },
    { item: "vps-move", why: "Already on host advo." },
    { item: "hospital", why: "Parked in ROADMAP." },
    { item: "daj", why: "Parked in ROADMAP." },
    { item: "inventi", why: "Parked in ROADMAP." },
    { item: "client-logo", why: "Needs real permission." },
    { item: "crm-unify", why: "Wiring-audit idea, no acceptance section." },
    { item: "prompt-admin", why: "Wiring-audit idea, no acceptance section." },
    { item: "dashboard-redesign", why: "Not a roadmap item." },
    { item: "newsletter-api", why: "No subscribe spec." },
    { item: "why-digital", why: "Old Stripe landing; / is LandingPage." },
    { item: "footer-wordmark", why: "Old Stripe landing." },
  ],
  shared_file: [
    "bench/roadmap/roadmap-remain/scoring.mjs",
    "bench/roadmap/roadmap-remain/task.md",
    "docs/ROADMAP.md",
    "docs/FEATURES.md",
    "docs/HANDOFF.md",
    "apps/api/src/db/schema.ts",
    "apps/api/src/index.ts",
  ],
  merge_order: ["staff", "hub", "lead", "admin", "wiring", "site", "ops", "test"],
  tip_gate: "node bench/roadmap/roadmap-remain/scoring.mjs && npm run build:web && npm --workspace apps/web run test",
  lane: lane.map((l) => ({
    name: l.name,
    branch: l.branch,
    worktree: l.worktree,
    item: l.item,
    owns_file: l.owns_file,
    forbidden_file: l.forbidden_file,
    done_when: l.done_when,
    builder: l.builder,
    resume: l.resume,
    port: l.port,
  })),
};

writeFileSync(join(here, "plan.json"), JSON.stringify(plan, null, 2) + "\n");
writeFileSync(join(here, "batch.json"), JSON.stringify({ tier: "roadmap-remain", lane: lane.map((l) => l.name), builder: "grok", resume: false }, null, 2) + "\n");

const ship = {
  staff: "Admin can see per-member project capacity and assign a junior; calendar shows school blackout.",
  lead: "Clinic leads can be imported (sample fixture), filtered by outdated systems, and turned into tracked template proposals.",
  admin: "Library, full-page project/client forms, collapsed Tools scrapers, /p/:token preview, controlled asset type, scraper history delete.",
  wiring: "Settings branding hydrates; Add Admin creates a user; notify rules work or are labeled; dashboard activity is real; social stats are not fake live; team reorder/order are correct.",
  hub: "A client can file a change-order from /hub.",
  site: "Public marketing routes share one reduced-motion white shell; destinationFor is tested.",
  test: "The open coverage table has automated tests (this lane's deliverable is the tests).",
  ops: "Vertex brand-analysis is gone; PWA is installable; backup docs stay green.",
};

for (const l of lane) {
  const body = `# Lane ${l.name}

branch: \`lane/${l.name}\`
worktree: \`${l.worktree}\`
port: \`${l.port}\`
builder: \`grok\`

## Ships

${ship[l.name]}

Surface: see each item in \`task.md\`. Preview \`http://127.0.0.1:${l.port}/\`.

## Item

${l.item.map((id) => `- \`${id}\``).join("\n")}

## Owns

${l.owns_file.map((f) => `- \`${f}\``).join("\n")}

## Forbidden

Every file owned by the other seven lanes (see \`plan.json\`). Shared: \`schema.ts\`, \`apps/api/src/index.ts\` (your route line only), \`docs/ROADMAP.md\`, \`docs/FEATURES.md\`, \`docs/HANDOFF.md\`.

## Done when

\`\`\`bash
node bench/roadmap/roadmap-remain/scoring.mjs
\`\`\`

${l.done_when}
`;
  writeFileSync(join(here, "lane", `${l.name}.md`), body);
}

console.log("wrote plan.json, batch.json, lane/*.md");
