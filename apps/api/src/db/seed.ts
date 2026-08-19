import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { loadEnv } from "../utils/env.js";
import { initDb, closeDb, db } from "./connection.js";
import {
  user,
  siteContent,
  siteConfig,
  client,
  project,
  deliverable,
  notification,
  teamMember,
} from "./schema.js";
import { hashPassword } from "../services/auth.service.js";

loadEnv();
initDb();

async function ensureUser(
  email: string,
  role: "admin" | "client" | "team",
  passwordHash: string,
): Promise<number> {
  const d = db();
  const [existing] = await d
    .select({ userId: user.userId })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (existing) {
    await d
      .update(user)
      .set({ passwordHash, role, isActive: true, updatedAt: new Date() })
      .where(eq(user.userId, existing.userId));
    return existing.userId;
  }
  const [created] = await d
    .insert(user)
    .values({ email, passwordHash, role, isActive: true })
    .returning({ userId: user.userId });
  if (!created) throw new Error(`Failed to create ${email}`);
  return created.userId;
}

/**
 * Insert a roster row if no team_member with that exact name exists.
 * Never updates an existing row — prod roles are edited via
 * PATCH /api/team/:id and must not be clobbered by a re-seed.
 */
async function ensureTeamMember(
  name: string,
  role: string,
  permissionRole: "admin" | "developer" | "designer" | "manager",
  avatarUrl: string,
): Promise<number> {
  const d = db();
  const [existing] = await d
    .select({ teamMemberId: teamMember.teamMemberId })
    .from(teamMember)
    .where(eq(teamMember.name, name))
    .limit(1);
  if (existing) return existing.teamMemberId;

  const [created] = await d
    .insert(teamMember)
    .values({ name, role, permissionRole, avatarUrl, isActive: true })
    .returning({ teamMemberId: teamMember.teamMemberId });
  if (!created) throw new Error(`Failed to create team member ${name}`);
  return created.teamMemberId;
}

/**
 * Align the team_member id sequence with the highest existing id.
 *
 * The live roster was created by hand and sits at ids 100-105, but the sequence
 * was never advanced past the low single digits. GET /api/team orders by
 * team_member_id, so a fresh insert would take id 7 and land the newest hire
 * ABOVE the founder on the public /team page. Advancing the sequence first keeps
 * that page founder-first without changing the query's ordering contract.
 */
async function alignTeamMemberSequence(): Promise<void> {
  await db().execute(sql`
    SELECT setval(
      pg_get_serial_sequence('team_member', 'team_member_id'),
      GREATEST((SELECT COALESCE(MAX(team_member_id), 1) FROM team_member), 1)
    )
  `);
}

async function seed() {
  const d = db();

  const passwordHash = await hashPassword("changeme");
  await ensureUser("admin@advo.ph", "admin", passwordHash);

  // Seed site content sections
  const sections = [
    { sectionId: "hero", label: "Hero Section" },
    { sectionId: "services", label: "Services" },
    { sectionId: "portfolio", label: "Portfolio" },
    { sectionId: "team", label: "Team" },
    { sectionId: "pricing", label: "Pricing" },
    { sectionId: "testimonials", label: "Testimonials" },
    { sectionId: "contact", label: "Contact" },
    { sectionId: "client_dashboard", label: "Client Dashboard Config" },
  ];

  for (const section of sections) {
    await d
      .insert(siteContent)
      .values({
        ...section,
        content: {},
        visiblePublic: true,
        visibleClientPortal: true,
      })
      .onConflictDoNothing();
  }

  // Seed site config defaults
  const defaults = [
    { key: "agency_name", value: "ADVO" },
    { key: "domain_url", value: "https://advo.ph" },
    { key: "accent_color", value: "#ea580c" },
    { key: "auto_email_on_progress_update", value: true },
    { key: "auto_email_on_invoice", value: true },
    { key: "auto_email_on_deliverable_complete", value: true },
  ];

  for (const { key, value } of defaults) {
    await d
      .insert(siteConfig)
      .values({ key, value })
      .onConflictDoNothing();
  }

  // ─── Client fixture ──────────────────────────────────
  // A known client login (client@advo.ph / changeme) that owns exactly one
  // project, deliverable, and notification. Used by the data-scoping tests in
  // api-wiring.test.ts to prove a client cannot read another client's rows.
  const clientPasswordHash = await hashPassword("changeme");
  const clientUserId = await ensureUser("client@advo.ph", "client", clientPasswordHash);

  const [clientUser] = await d
    .select()
    .from(user)
    .where(eq(user.userId, clientUserId))
    .limit(1);

  if (clientUser) {
    const [existingClient] = await d
      .select()
      .from(client)
      .where(eq(client.userId, clientUser.userId))
      .limit(1);

    if (!existingClient) {
      const [clientRow] = await d
        .insert(client)
        .values({
          userId: clientUser.userId,
          companyName: "Seed Client Co",
          contactEmail: "client@advo.ph",
        })
        .returning();

      const [projectRow] = await d
        .insert(project)
        .values({
          clientId: clientRow.clientId,
          title: "Seed Client Project",
          description: "Owned by client@advo.ph — used by data-scoping tests.",
          projectStatus: "development",
        })
        .returning();

      await d
        .insert(deliverable)
        .values({ projectId: projectRow.projectId, title: "Seed deliverable", status: "in_progress" });

      await d
        .insert(notification)
        .values({ clientId: clientRow.clientId, title: "Seed notification", body: "Owned by client@advo.ph." });
    }
  }

  // ─── Team roster ──────────────────────────────────────
  // The full active roster. Matched by exact name, insert-only, so applying
  // this to an environment that already holds a member is a no-op.
  //
  // A missing row is not cosmetic: meeting-task.service resolves a Plaud
  // action-item owner against this table (resolveOnePerson), so an absent
  // person's tasks import unassigned; per-member capacity (lib/capacity.ts)
  // counts nothing for them; and nobody outside the roster can be paid.
  const rosterSeed: Array<{
    name: string;
    role: string;
    permissionRole: "admin" | "developer" | "designer" | "manager";
    avatarUrl: string;
  }> = [
    { name: "Prince Wagan", role: "Founder", permissionRole: "admin", avatarUrl: "/team/prince-wagan.jpg" },
    { name: "Angelo Revelo", role: "Developer", permissionRole: "developer", avatarUrl: "/team/angelo-revelo.jpg" },
    { name: "Anthony Gabriel Ramos", role: "Project Manager", permissionRole: "manager", avatarUrl: "/team/anthony-ramos.jpg" },
    { name: "Au Cargason", role: "Project Manager", permissionRole: "manager", avatarUrl: "/team/au-cargason.jpg" },
    { name: "Schiffier Silang", role: "Externals & Operations", permissionRole: "manager", avatarUrl: "/team/schiffier-silang.jpg" },
    { name: "David Remo", role: "Marketing & Partnerships", permissionRole: "manager", avatarUrl: "/team/david-remo.jpg" },
    // Missing until now — both are active contributors in the team chat.
    // Johann owns contract strategy (sign-off, standard agreements, renegotiation).
    // Placeholder initial tile, not an invented photo -- replace with a real
    // portrait when one exists, the way every other roster row carries one.
    { name: "Johann", role: "Legal & Contracts", permissionRole: "manager", avatarUrl: "/team/johann.svg" },
    // ROADMAP.md already lists Kenneth as one of the per-client junior devs.
    { name: "Kenneth Leo Dela Cruz", role: "Junior Developer", permissionRole: "developer", avatarUrl: "/team/kenneth-dela-cruz.svg" },
  ];

  // Must run BEFORE the inserts, or a new row takes a low id and sorts above the founder.
  await alignTeamMemberSequence();

  for (const member of rosterSeed) {
    await ensureTeamMember(member.name, member.role, member.permissionRole, member.avatarUrl);
  }

  console.log("Seed complete");
  await closeDb();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
