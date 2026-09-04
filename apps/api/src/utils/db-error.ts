/**
 * Postgres error → HTTP status + human message.
 *
 * The schema deliberately puts the real enforcement in the database, not in
 * application code: `idx_campaign_recipient_unique` is "the double-send guard",
 * `idx_signoff_revision_round` is "the double-spend guard". Those guards are the
 * thing standing between a client and two copies of the same email, or a paid
 * revision round consumed twice.
 *
 * They worked. What did not work was what the user saw when one fired. Every
 * constraint violation fell through to the catch-all handler and came back as
 * 500 "Internal server error", which is wrong twice over: the server did not
 * fail, and the caller was told nothing they could act on. A unique violation is
 * 409. A missing foreign key is 400. A row still referenced by another table is
 * 409, not a crash.
 *
 * Two rules this file holds to:
 *
 *   1. Never echo `error.detail` to the client. Postgres puts the offending
 *      VALUES in there ("Key (email)=(someone@real.address) already exists"),
 *      so passing it through would leak one user's data into another user's
 *      error toast. Column and table names are safe and are all we extract.
 *   2. A bug is still a 500. An undefined column means the code and the schema
 *      disagree, and dressing that up as a 4xx would blame the caller for our
 *      mistake. Those codes are recognised so they can be logged precisely, and
 *      still answered with 500.
 */

/** Hono's `c.json(body, status)` accepts these. Kept literal so the union narrows. */
export type DbErrorStatus = 400 | 403 | 409 | 413 | 500 | 503;

export interface DbErrorMapping {
  status: DbErrorStatus;
  /** Safe to show a user. Says what broke and what to do about it. */
  message: string;
  /** The SQLSTATE, for logs and tests. */
  code: string;
  /** True when this is our bug, not the caller's. The handler should still log loudly. */
  isServerFault: boolean;
}

/**
 * postgres.js throws `PostgresError` with snake_case fields. Other drivers
 * (node-postgres) use camelCase for some of them. Read both rather than binding
 * this file to one driver.
 */
interface RawPgError {
  code?: unknown;
  constraint_name?: unknown;
  constraint?: unknown;
  table_name?: unknown;
  table?: unknown;
  column_name?: unknown;
  column?: unknown;
  detail?: unknown;
  message?: unknown;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** A Postgres SQLSTATE is exactly five alphanumeric characters. */
function pgCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const code = str((err as RawPgError).code);
  if (!code || !/^[0-9A-Z]{5}$/.test(code)) return null;
  return code;
}

export function isPgError(err: unknown): boolean {
  return pgCode(err) !== null;
}

function constraintOf(err: RawPgError): string | null {
  return str(err.constraint_name) ?? str(err.constraint);
}

function tableOf(err: RawPgError): string | null {
  return str(err.table_name) ?? str(err.table);
}

function columnOf(err: RawPgError): string | null {
  return str(err.column_name) ?? str(err.column);
}

/**
 * Pull just the column list out of `Key (a, b)=(...) already exists.`
 *
 * Only the parenthesised group BEFORE the `=` is read. The group after it is the
 * offending value and never leaves the server.
 */
function keyColumnsFromDetail(detail: string | null): string[] {
  if (!detail) return [];
  const match = /^Key \(([^)]+)\)=/.exec(detail);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((c) => c.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

/** `still referenced from table "invoice"` / `is not present in table "client"`. */
function referencedTableFromDetail(detail: string | null): string | null {
  if (!detail) return null;
  const match = /table "([A-Za-z0-9_]+)"/.exec(detail);
  return match ? match[1] : null;
}

/** snake_case or a quoted identifier turned into something readable in a sentence. */
function humanizeIdentifier(name: string): string {
  return name.replace(/_id$/, "").replace(/_/g, " ").trim();
}

/**
 * Constraints whose violation has a specific thing the user should do next.
 * Anything not listed still gets a correct status and a generic-but-true message.
 */
const UNIQUE_CONSTRAINT_MESSAGE: Record<string, string> = {
  // The double-send guard. One lead, one campaign, once.
  idx_campaign_recipient_unique:
    "That lead is already on this campaign. Each lead can only be sent a campaign once.",
  // The double-spend guard. One revision round consumed at most once.
  idx_signoff_revision_round:
    "That revision round is already recorded. Reload the sign-off to see the current round.",
  idx_access_unique: "That team member already has access to this project.",
  idx_meeting_plaud_file: "That recording has already been imported.",
  idx_campaign_recipient_token: "That unsubscribe link already exists. Try the send again.",
  idx_email_suppression_email: "That email address is already on the suppression list.",
  idx_email_soft_bounce_email: "That email address already has a bounce record.",
  idx_schema_migration_filename: "That migration has already been applied.",
};

/** Column-level uniques, matched when the constraint name is not one we know. */
const UNIQUE_COLUMN_MESSAGE: Record<string, string> = {
  email: "That email address is already registered. Sign in instead, or use a different address.",
  slug: "That slug is already taken. Pick a different one.",
  refresh_token: "That session token already exists. Sign in again.",
};

function uniqueMessage(err: RawPgError): string {
  const constraint = constraintOf(err);
  if (constraint && UNIQUE_CONSTRAINT_MESSAGE[constraint]) {
    return UNIQUE_CONSTRAINT_MESSAGE[constraint];
  }

  const columns = keyColumnsFromDetail(str(err.detail));
  for (const column of columns) {
    if (UNIQUE_COLUMN_MESSAGE[column]) return UNIQUE_COLUMN_MESSAGE[column];
  }

  if (columns.length === 1) {
    return `That ${humanizeIdentifier(columns[0])} is already taken. Use a different one.`;
  }
  if (columns.length > 1) {
    const list = columns.map(humanizeIdentifier).join(" and ");
    return `A record with the same ${list} already exists. Change one of them, or edit the existing record.`;
  }
  return "That record already exists. Reload the page to see the current version.";
}

function foreignKeyMapping(err: RawPgError): DbErrorMapping {
  const detail = str(err.detail);
  const other = referencedTableFromDetail(detail);

  // Deleting a row something else still points at.
  if (detail && detail.includes("still referenced from")) {
    return {
      status: 409,
      message: other
        ? `This is still in use by ${humanizeIdentifier(other)} records. Remove those first, then try again.`
        : "This is still in use by other records. Remove those first, then try again.",
      code: "23503",
      isServerFault: false,
    };
  }

  // Inserting a row that points at something absent.
  const columns = keyColumnsFromDetail(detail);
  const what = columns.length === 1 ? humanizeIdentifier(columns[0]) : other ? humanizeIdentifier(other) : null;
  return {
    status: 400,
    message: what
      ? `That ${what} does not exist. Pick one from the list and try again.`
      : "A record this refers to does not exist. Reload the page and try again.",
    code: "23503",
    isServerFault: false,
  };
}

function notNullMapping(err: RawPgError): DbErrorMapping {
  const column = columnOf(err);
  return {
    status: 400,
    message: column
      ? `${humanizeIdentifier(column).replace(/^./, (ch) => ch.toUpperCase())} is required.`
      : "A required field is missing.",
    code: "23502",
    isServerFault: false,
  };
}

function checkMapping(err: RawPgError): DbErrorMapping {
  const constraint = constraintOf(err);
  return {
    status: 400,
    message: constraint
      ? `That value is not allowed by the ${humanizeIdentifier(constraint)} rule. Check the field and try again.`
      : "That value is not allowed. Check the fields and try again.",
    code: "23514",
    isServerFault: false,
  };
}

/**
 * Map a caught error to an HTTP answer.
 *
 * Returns null when the error is not a Postgres error at all, which leaves the
 * caller's existing behaviour untouched.
 */
export function mapDbError(err: unknown): DbErrorMapping | null {
  const code = pgCode(err);
  if (!code) return null;
  const pg = err as RawPgError;

  switch (code) {
    // ── Integrity: the caller asked for something the data model forbids ──
    case "23505":
      return { status: 409, message: uniqueMessage(pg), code, isServerFault: false };
    case "23503":
      return foreignKeyMapping(pg);
    case "23502":
      return notNullMapping(pg);
    case "23514":
      return checkMapping(pg);
    case "23P01":
      return {
        status: 409,
        message: "That overlaps an existing entry. Pick a different time or range.",
        code,
        isServerFault: false,
      };

    // ── Bad input that got past validation ──
    case "22P02":
      return {
        status: 400,
        message: "One of the values is the wrong type. Check the form and try again.",
        code,
        isServerFault: false,
      };
    case "22001":
      return {
        status: 400,
        message: "One of the values is too long. Shorten it and try again.",
        code,
        isServerFault: false,
      };
    case "22003":
      return {
        status: 400,
        message: "A number is outside the allowed range.",
        code,
        isServerFault: false,
      };
    case "22007":
    case "22008":
      return {
        status: 400,
        message: "That date or time could not be read. Check the format and try again.",
        code,
        isServerFault: false,
      };

    // ── Transient: worth retrying, and not the caller's fault ──
    case "40001":
    case "40P01":
      return {
        status: 409,
        message: "Another change hit the same records at the same time. Try again.",
        code,
        isServerFault: false,
      };
    case "53300":
    case "53400":
      return {
        status: 503,
        message: "The database is at capacity. Try again in a moment.",
        code,
        isServerFault: true,
      };
    case "57014":
      return {
        status: 503,
        message: "That took too long and was stopped. Try again, or narrow the request.",
        code,
        isServerFault: true,
      };
    case "08000":
    case "08003":
    case "08006":
    case "08001":
    case "08004":
      return {
        status: 503,
        message: "The database is unreachable right now. Try again in a moment.",
        code,
        isServerFault: true,
      };

    // ── Permission ──
    case "42501":
      return {
        status: 403,
        message: "This account is not allowed to make that change.",
        code,
        isServerFault: false,
      };

    // ── Our bug, not theirs. Recognised so it can be logged precisely, still a 500. ──
    case "42703": // undefined_column
    case "42P01": // undefined_table
    case "42883": // undefined_function
    case "42601": // syntax_error
    case "42804": // datatype_mismatch
      return {
        status: 500,
        message: "Internal server error",
        code,
        isServerFault: true,
      };

    default:
      return null;
  }
}

/** One-line summary for the server log. Includes the constraint, never the values. */
export function describeDbError(err: unknown): string {
  const code = pgCode(err);
  if (!code) return "not a postgres error";
  const pg = err as RawPgError;
  const parts = [`code=${code}`];
  const constraint = constraintOf(pg);
  const table = tableOf(pg);
  const column = columnOf(pg);
  if (constraint) parts.push(`constraint=${constraint}`);
  if (table) parts.push(`table=${table}`);
  if (column) parts.push(`column=${column}`);
  return parts.join(" ");
}
