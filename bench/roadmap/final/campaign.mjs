#!/usr/bin/env node
/**
 * Lane `campaign` — source-reading, idempotent scoring.
 * No clock, no random, no network. Same shape as roadmap-remain/scoring.mjs.
 *
 * Grades the v1 acceptance table in docs/ROADMAP.md § "Acceptance — email campaign
 * sender (v1)". Scope is batch send + suppression; sequences, reply detection, A/B, and
 * click tracking are deliberately out and are NOT checked here.
 *
 * The four invariants, and why each is a check rather than a code comment:
 *
 *   1. SEPARATE IDENTITY — email.service.ts carries client magic-links. If cold outreach
 *      to a scraped list shares that transport, a spam-folder verdict on outreach takes
 *      client logins down with it. So outreach must have its own transport and its own
 *      from-address, and must NEVER silently borrow the transactional one.
 *   2. SUPPRESSION IS A GATE — a filter in the segment query is not enough: the send loop
 *      can run for hours, and the list grows underneath it. The check must sit next to
 *      the actual send.
 *   3. THROTTLED / RESUMABLE — an unbounded fan-out over 5000 addresses reproduces the
 *      exact ENOBUFS socket exhaustion recorded in docs/HANDOFF.md (2026-08-16) that is
 *      currently blocking this repo's own deploy.
 *   4. HONEST DRY-RUN — a preview count that is not post-suppression teaches the operator
 *      to distrust the number, which is worse than showing none.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relativePath) => {
  const absolutePath = join(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};
const has = (relativePath) => existsSync(join(repoRoot, relativePath));

const service = read("apps/api/src/services/campaign.service.ts");
const email = read("apps/api/src/services/email.service.ts");
const route = read("apps/api/src/routes/campaign.routes.ts");
const migration = read("apps/api/migrations/015_campaign.sql");
const schema = read("apps/api/src/db/schema.ts");
const index = read("apps/api/src/index.ts");
const adminPage = read("apps/web/src/components/admin/AdminCampaign.tsx");
const test = read("apps/web/src/test/campaign.test.ts");

/** The body of sendCampaign(), so "inside the send loop" can be asserted structurally. */
const sendLoop = (() => {
  const at = service.indexOf("for (const recipient of queued)");
  return at === -1 ? "" : service.slice(at);
})();

const check = [
  {
    id: "outreach-transport-separate",
    passed:
      /export function outreachConfig/.test(email) &&
      /OUTREACH_SMTP_HOST/.test(email) &&
      /OUTREACH_FROM/.test(email) &&
      /export function isOutreachConfigured/.test(email),
    expected:
      "email.service.ts exposes an outreach transport configured independently of the transactional one (OUTREACH_SMTP_HOST + OUTREACH_FROM).",
  },
  {
    id: "transactional-path-untouched",
    passed:
      /host:\s*"smtp\.resend\.com"/.test(email) &&
      /sendMagicLinkEmail/.test(email) &&
      /sendLeadNotificationEmail/.test(email),
    expected:
      "The existing transactional transport and its templates still work unchanged when no outreach transport is configured.",
  },
  {
    id: "no-silent-outreach-fallback",
    passed:
      /export async function sendOutreachEmail/.test(email) &&
      /throw new Error\(\s*\n?\s*"Outreach transport is not configured/.test(email) &&
      /does not fall back/i.test(service),
    expected:
      "sendOutreachEmail THROWS when unconfigured; a campaign send refuses rather than logging-and-succeeding or borrowing the transactional transport.",
  },
  {
    id: "campaign-sends-via-outreach-only",
    passed:
      /sendOutreachEmail/.test(service) &&
      !/\bsendNotificationEmail\b/.test(service) &&
      !/\bsendMagicLinkEmail\b/.test(service),
    expected: "campaign.service.ts sends only through the outreach path, never a transactional template.",
  },
  {
    id: "suppression-enforced-in-send",
    passed: sendLoop.length > 0 && /await isSuppressed\(recipient\.email\)/.test(sendLoop),
    expected:
      "Suppression is re-checked INSIDE the send loop, immediately before each send — not only when the segment is resolved.",
  },
  {
    id: "suppression-case-insensitive",
    passed:
      /lower\(email\)/.test(migration) &&
      /normalizeEmail/.test(service) &&
      /toLowerCase\(\)/.test(service),
    expected:
      "Suppression is stored and matched lowercased, at the DB level too, so casing cannot defeat it.",
  },
  {
    id: "unsubscribe-public-one-click",
    passed: (() => {
      const unsubscribeAt = route.indexOf('campaignRoutes.get("/unsubscribe/:token"');
      const authAt = route.indexOf("requireAuth, requireTeam");
      return unsubscribeAt > -1 && authAt > -1 && unsubscribeAt < authAt;
    })(),
    expected:
      "The unsubscribe route is mounted BEFORE the auth middleware — an unsubscribe that needs a login is not an unsubscribe.",
  },
  {
    id: "unsubscribe-token-opaque",
    passed:
      /randomBytes\(\d+\)\.toString\("hex"\)/.test(service) &&
      !/unsubscribeToken:\s*.*email/.test(service) &&
      /does NOT encode the address/i.test(migration + service),
    expected:
      "The unsubscribe token is random per recipient and does not encode the raw address.",
  },
  {
    id: "unsubscribe-in-every-outreach-body",
    passed:
      /export function wrapOutreach/.test(email) &&
      /Unsubscribe/.test(email) &&
      /wrapOutreach\(/.test(service),
    expected:
      "Every outreach body is wrapped with a mandatory unsubscribe footer; the campaign send uses that wrapper.",
  },
  {
    id: "send-throttled",
    passed:
      /ratePerHour/.test(service) &&
      /setTimeout/.test(sendLoop) &&
      !/Promise\.all\s*\(\s*queued/.test(service) &&
      !/Promise\.allSettled\s*\(\s*queued/.test(service),
    expected:
      "The send is paced by a per-hour rate cap and iterates one recipient at a time. No unbounded fan-out over the recipient list (see the ENOBUFS incident in HANDOFF.md).",
  },
  {
    id: "send-resumable",
    passed:
      /eq\(campaignRecipient\.status,\s*"queued"\)/.test(service) &&
      /onConflictDoNothing/.test(service),
    expected:
      "Only queued rows are sent and recipient materialization is idempotent, so an API restart resumes instead of re-sending.",
  },
  {
    id: "no-double-send",
    passed:
      /CREATE UNIQUE INDEX[\s\S]*campaign_recipient \(campaign_id, lead_id\)/.test(migration) &&
      /uniqueIndex\("idx_campaign_recipient_unique"\)/.test(schema),
    expected:
      "A unique index on (campaign_id, lead_id) makes a double-send impossible at the DB level, not just by application care.",
  },
  {
    id: "dry-run-honest",
    passed:
      /export async function previewCampaign/.test(service) &&
      /recipientCount/.test(service) &&
      /suppressionSet\(\)/.test(service) &&
      !/sendOutreachEmail/.test(service.slice(
        service.indexOf("export async function previewCampaign"),
        service.indexOf("// ─── Campaign lifecycle"),
      )),
    expected:
      "previewCampaign() returns a post-suppression count and sends nothing — the count shown is the count that will send.",
  },
  {
    id: "per-recipient-status",
    passed:
      /campaign_recipient_status AS ENUM/.test(migration) &&
      /'queued',[\s\S]*'sent',[\s\S]*'bounced',[\s\S]*'unsubscribed',[\s\S]*'complained'/.test(migration) &&
      /recordDeliveryFailure/.test(service),
    expected:
      "Recipient status covers queued/sent/failed/bounced/unsubscribed/complained/suppressed, and bounce plus complaint feed suppression.",
  },
  {
    id: "campaign-admin-surface",
    passed:
      has("apps/web/src/components/admin/AdminCampaign.tsx") &&
      /Dry run/i.test(adminPage) &&
      /suppress/i.test(adminPage) &&
      /{activeSection === "campaign" && <AdminCampaign \/>}/.test(
        read("apps/web/src/pages/Admin.tsx"),
      ) &&
      /id: "campaign"/.test(read("apps/web/src/components/admin/AdminSidebar.tsx")),
    expected:
      "The campaign surface is reachable at /admin -> Campaigns with a dry-run control. A benchmark measures the deliverable; it is never the deliverable.",
  },
  {
    id: "route-registered-minimally",
    passed:
      /app\.route\("\/api\/campaign", campaignRoutes\);/.test(index) &&
      (index.match(/campaignRoutes/g) ?? []).length === 2,
    expected:
      "index.ts is a shared one-line-per-entry registry: the campaign lane adds exactly one import and one app.route line, nothing else.",
  },
  {
    id: "campaign-test-stubbed",
    passed:
      has("apps/web/src/test/campaign.test.ts") &&
      /isOutreachConfigured/.test(test) &&
      /rejects\.toThrow/.test(test) &&
      !/smtp\.resend\.com/.test(test) &&
      !/createTransport/.test(test),
    expected:
      "campaign.test.ts proves the paths without constructing a transport — no test can put mail on the wire.",
  },
];

let failed = 0;
for (const row of check) {
  const mark = row.passed ? "PASS" : "FAIL";
  if (!row.passed) failed += 1;
  console.log(`[${mark}] ${row.id}`);
  if (!row.passed) console.log(`         ${row.expected}`);
}
console.log(
  `\n${failed === 0 ? "PASS" : "FAIL"} — ${check.length - failed}/${check.length} campaign check(s) green`,
);
process.exit(failed === 0 ? 0 : 1);
