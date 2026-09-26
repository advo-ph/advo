import "dotenv/config";
import { eq } from "drizzle-orm";
import { loadEnv } from "../utils/env.js";
import { initDb, closeDb, db } from "./connection.js";
import { user } from "./schema.js";
import { hashPassword } from "../services/auth.service.js";

/**
 * Provision (or re-provision) an admin account.
 *
 * The credentials are read from the environment at run time, never hardcoded, so a real
 * password is never committed to the repo. Idempotent: if the email already exists it is
 * promoted to admin and its password is reset; otherwise a new admin row is inserted.
 *
 *   ADMIN_EMAIL=admin@advo.ph ADMIN_PASSWORD='<the password>' npm run db:create-admin
 *
 * isOwner is set true only for admin@advo.ph, matching the schema's "single owner account"
 * contract (migration 026 / 033). Every other admin is a non-owner admin.
 */

const OWNER_EMAIL = "admin@advo.ph";
const MIN_PASSWORD_LENGTH = 10;

async function main() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";

  if (!email || !password) {
    console.error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment. Example:\n" +
        "  ADMIN_EMAIL=admin@advo.ph ADMIN_PASSWORD='...' npm run db:create-admin",
    );
    process.exit(1);
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error(`ADMIN_EMAIL is not a valid email address: ${email}`);
    process.exit(1);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters. ` +
        "Pick a strong, unique password — this is an admin account.",
    );
    process.exit(1);
  }

  loadEnv();
  initDb();

  const d = db();
  const passwordHash = await hashPassword(password);
  const isOwner = email === OWNER_EMAIL;

  const [existing] = await d
    .select({ userId: user.userId })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existing) {
    await d
      .update(user)
      .set({ passwordHash, role: "admin", isActive: true, isOwner, updatedAt: new Date() })
      .where(eq(user.userId, existing.userId));
    console.log(`Updated existing account ${email} -> role=admin, isOwner=${isOwner}`);
  } else {
    const [created] = await d
      .insert(user)
      .values({ email, passwordHash, role: "admin", isActive: true, isOwner })
      .returning({ userId: user.userId });
    if (!created) throw new Error(`Failed to create ${email}`);
    console.log(`Created account ${email} -> role=admin, isOwner=${isOwner}`);
  }

  await closeDb();
}

main().catch((err) => {
  console.error("create-admin failed:", err);
  process.exit(1);
});
