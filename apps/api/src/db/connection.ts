import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import { env } from "../utils/env.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("db");

let _sql: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function initDb() {
  const e = env();
  _sql = postgres(e.DATABASE_URL, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: false,
  });
  _db = drizzle(_sql, { schema });
  log.info("Database connection pool initialized");
  return _db;
}

export function db() {
  if (!_db) throw new Error("db() called before initDb()");
  return _db;
}

export async function closeDb() {
  if (_sql) {
    await _sql.end();
    log.info("Database connection pool closed");
  }
}

export async function checkDb(): Promise<boolean> {
  try {
    if (!_sql) return false;
    await _sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
