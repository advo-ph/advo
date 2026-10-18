#!/usr/bin/env node
/**
 * One-time reset for the existing accounts being moved to username login.
 *
 * This operation is kept out of the schema migration: bcrypt creates a separate
 * salt for every account, and the migration can be deployed independently before
 * the application is restarted. It refuses to run without an explicit flag.
 *
 * Usage:
 *   RESET_PASSWORD=<temporary-password> node scripts/reset-existing-user-passwords.mjs --confirm-account-reset
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { config as loadDotEnv } from "dotenv";
import postgres from "postgres";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const apiEnvPath = join(repoRoot, "apps/api/.env");
const CONFIRMATION = "--confirm-account-reset";

if (!process.argv.includes(CONFIRMATION)) {
  console.error(`Refusing to reset accounts. Re-run with ${CONFIRMATION} to confirm.`);
  process.exit(2);
}

const resetPassword = process.env.RESET_PASSWORD;
if (!resetPassword || resetPassword.length > 255) {
  console.error("Set RESET_PASSWORD to the new password before running this operation.");
  process.exit(2);
}

if (!process.env.DATABASE_URL && existsSync(apiEnvPath)) {
  loadDotEnv({ path: apiEnvPath });
}

if (!process.env.DATABASE_URL) {
  console.error("No DATABASE_URL is available in the environment or apps/api/.env.");
  process.exit(2);
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  connect_timeout: 10,
  prepare: false,
});

try {
  const reset = await sql.begin(async (tx) => {
    const [migration] = await tx`
      SELECT filename
      FROM schema_migration
      WHERE filename = '049_username_login.sql'
      LIMIT 1
    `;
    if (!migration) {
      throw new Error("Apply 049_username_login.sql before resetting account passwords");
    }

    // Keep account and session writes from racing the reset. Readers continue to work.
    await tx`LOCK TABLE "user" IN SHARE ROW EXCLUSIVE MODE`;
    await tx`LOCK TABLE session IN SHARE ROW EXCLUSIVE MODE`;

    const accounts = await tx`SELECT user_id FROM "user" ORDER BY user_id`;
    for (const account of accounts) {
      const passwordHash = await bcrypt.hash(resetPassword, 12);
      await tx`
        UPDATE "user"
        SET password_hash = ${passwordHash},
            magic_token = NULL,
            magic_token_expires_at = NULL,
            updated_at = now()
        WHERE user_id = ${account.user_id}
      `;
    }

    const sessions = await tx`DELETE FROM session RETURNING session_id`;
    return { accountCount: accounts.length, sessionCount: sessions.length };
  });

  console.log(
    `Reset ${reset.accountCount} account password(s) and revoked ${reset.sessionCount} saved session credential(s).`,
  );
} catch (error) {
  console.error(`Account password reset failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
