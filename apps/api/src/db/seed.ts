import "dotenv/config";
import { loadEnv } from "../utils/env.js";
import { initDb, closeDb, db } from "./connection.js";
import { user, siteContent, siteConfig } from "./schema.js";
import { hashPassword } from "../services/auth.service.js";

loadEnv();
initDb();

async function seed() {
  const d = db();

  // Create admin user
  const passwordHash = await hashPassword("changeme");
  await d
    .insert(user)
    .values({
      email: "admin@advo.ph",
      passwordHash,
      role: "admin",
    })
    .onConflictDoNothing();

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

  console.log("Seed complete");
  await closeDb();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
