import "dotenv/config";
import { eq } from "drizzle-orm";
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

  console.log("Seed complete");
  await closeDb();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
