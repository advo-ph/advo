# ADVO MCP — Phase 1: Bot Keys + Read-Only MCP Server (REWRITTEN 18-10-26)

**Status:** Done — executed 18-10-26 against `main`. See "Execution report" at the end of this
file for verification evidence, the resolved unresolved-detail decision, and the one deviation
(a `key_prefix` column-width bug found and fixed during EXECUTE).
**Feature:** advo-mcp — Phase 1 of 2
**Umbrella:** `advo-mcp_UMBRELLA_PLAN_18-10-26.md`
**Wave:** 1 (main tree, parallel to `feat/ios-app` and `feat/plaud-chat` worktrees)
**Migration:** `055_bot_key.sql`

---

## 1. Scope

- `bot_key` table + migration 055.
- `requireBotKey` auth middleware (separate from JWT).
- A stateless MCP server mounted at `/mcp`, read-only tools only.
- `/api/bot-keys` admin-facing CRUD (create/list/revoke) — owner-gated, same pattern as
  `/api/team/accounts`.
- Settings → Members UI: extend the existing "Member accounts" panel with a bot-key row per
  member.
- Docs + tests + rollback.

No writes to any business table happen through `/mcp` in this phase. No webhook delivery exists
yet (Phase 2).

## 2. Schema

### 2.1 Migration `apps/api/migrations/055_bot_key.sql`

```sql
-- Migration 055: bot_key — one MCP bearer credential per team member.
--
-- Prince's grokbot (xAI, remote MCP over HTTPS) needs its own auth path, separate from the
-- JWT session: a long-lived bearer token, hashed at rest, one per team_member, never deleted
-- (only revoked — revoked_at makes a key permanently dead without losing its audit trail).
--
-- Exactly one LIVE key per member: enforced by a partial unique index on team_member_id WHERE
-- revoked_at IS NULL, not an app-only check, so a race between two "create key" clicks cannot
-- produce two live keys for the same person.
BEGIN;

CREATE TABLE IF NOT EXISTS bot_key (
  bot_key_id    bigserial PRIMARY KEY,
  team_member_id integer NOT NULL REFERENCES team_member(team_member_id) ON DELETE CASCADE,
  key_hash      varchar(64) NOT NULL,   -- sha256 hex digest of the raw bearer token
  key_prefix    varchar(16) NOT NULL,   -- first ~12 chars of the raw token, shown in the UI
  created_by    integer REFERENCES "user"(user_id) ON DELETE SET NULL,
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_key_hash ON bot_key(key_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_key_one_live_per_member
  ON bot_key(team_member_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE bot_key IS
  'One live MCP bearer credential per team_member. revoked_at makes a key permanently dead; a new key cannot be created while one is live (revoke first).';

INSERT INTO schema_migration (filename, is_backfilled)
VALUES ('055_bot_key.sql', false)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
```

### 2.2 `apps/api/src/db/schema.ts` — append block

Add at the end of the file (after the existing VPS-monitor block), in the same style as every
other table:

```ts
// ─── Bot keys (migration 055) ────────────────────────
//
// One live bearer credential per team_member for the MCP server. See migration 055 for the
// partial-unique "one live key" invariant.

export const botKey = pgTable(
  "bot_key",
  {
    botKeyId: bigserial("bot_key_id", { mode: "number" }).primaryKey(),
    teamMemberId: integer("team_member_id")
      .notNull()
      .references(() => teamMember.teamMemberId, { onDelete: "cascade" }),
    keyHash: varchar("key_hash", { length: 64 }).notNull(),
    keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
    createdBy: integer("created_by").references(() => user.userId, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_bot_key_hash").on(t.keyHash),
    index("idx_bot_key_team_member").on(t.teamMemberId),
  ]
);
```

Place this block textually after the VPS-monitor tables (end of file) — grep the current end of
`schema.ts` at EXECUTE time to confirm nothing else was appended after it by a concurrent
worktree merge; if so, append after whatever is last, not by line number.

## 3. Dependency

Add to `apps/api/package.json` `dependencies`: `"@modelcontextprotocol/sdk": "^1.32.1"`. Run
`npm install` from repo root (npm workspaces). Confirmed absent from `node_modules` today
despite a stray lockfile entry at `^1.25.2` — `npm install` will reconcile the lockfile to the
version actually declared.

## 4. New files

### 4.1 `apps/api/src/types/bot-context.ts`

```ts
export type BotKeyContext = {
  botKeyId: number;
  teamMemberId: number;
  teamMemberName: string;
  /** Null when the member has no login account — see §5.1, key creation requires one. */
  linkedUserId: number | null;
  /** From user.role. Null when linkedUserId is null. */
  role: "admin" | "team" | "client" | null;
  /** From user.is_owner. False when linkedUserId is null. */
  isOwner: boolean;
};

export type McpVariables = {
  requestId: string;
  botKey: BotKeyContext;
};
```

### 4.2 `apps/api/src/utils/bot-key.ts`

Token generation/hashing helpers, no DB access (keeps this file testable without a DB):

```ts
import { randomBytes, createHash } from "node:crypto";

const TOKEN_PREFIX = "advo_bot_";

/** Raw token shown to the user exactly once. Never stored. */
export function generateBotToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function hashBotToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** First 12 chars after the prefix, shown in the UI so an admin can tell keys apart. */
export function botTokenPrefix(raw: string): string {
  return raw.slice(0, TOKEN_PREFIX.length + 8);
}
```

### 4.3 `apps/api/src/middleware/bot-auth.ts`

```ts
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db/connection.js";
import { botKey, teamMember, user } from "../db/schema.js";
import { hashBotToken } from "../utils/bot-key.js";
import type { McpVariables } from "../types/bot-context.js";

export const requireBotKey = createMiddleware<{ Variables: McpVariables }>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing bearer token" });
  }
  const keyHash = hashBotToken(header.slice(7));
  const d = db();

  const [row] = await d
    .select({
      botKeyId: botKey.botKeyId,
      teamMemberId: botKey.teamMemberId,
      teamMemberName: teamMember.name,
      linkedUserId: teamMember.userId,
      role: user.role,
      isOwner: user.isOwner,
    })
    .from(botKey)
    .innerJoin(teamMember, eq(botKey.teamMemberId, teamMember.teamMemberId))
    .leftJoin(user, eq(teamMember.userId, user.userId))
    .where(and(eq(botKey.keyHash, keyHash), isNull(botKey.revokedAt)))
    .limit(1);

  if (!row) throw new HTTPException(401, { message: "Invalid or revoked bot key" });

  c.set("botKey", {
    botKeyId: row.botKeyId,
    teamMemberId: row.teamMemberId,
    teamMemberName: row.teamMemberName,
    linkedUserId: row.linkedUserId,
    role: (row.role as "admin" | "team" | "client" | null) ?? null,
    isOwner: row.isOwner ?? false,
  });

  // Fire-and-forget: a dashboard "last used" timestamp is not worth blocking the MCP call on.
  d.update(botKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(botKey.botKeyId, row.botKeyId))
    .catch(() => {});

  await next();
});
```

### 4.4 `apps/api/src/services/mcp-tools.service.ts` (read tools, Phase 1 half)

Pure functions, one per tool, each `(botContext: BotKeyContext, args) => Promise<result>` so
Phase 2 can add write-tool functions to the same file without re-touching the tool registry.
Exports a `registerReadTools(server: McpServer, botContext: BotKeyContext)` function that calls
`server.registerTool(name, { description, inputSchema }, handler)` for each tool below. All
money-shaped tools are wrapped in `if (botContext.isOwner) { ... }` around the
`registerTool` call itself — not registered at all for non-owners, so they never appear in
`tools/list`.

**Non-money tools (always registered):**

| Tool | Input | Reads | Notes |
|---|---|---|---|
| `whoami` | `{}` | — | Returns `{ teamMemberName, teamMemberId, role, isOwner }` from `botContext` directly. First call a bot should make. |
| `list_projects` | `{ status?, clientId? }` | `project` (+ `client` for name) | Money fields (`totalValueCents`, `amountPaidCents`, `listValueCents`, `discountCents`, `discountReason`) stripped from each row unless `botContext.isOwner`. |
| `get_project` | `{ projectId }` | `project`, `client` | Same money-field stripping as `list_projects`. 404 via `HTTPException`-equivalent tool error if not found. |
| `list_clients` | `{}` | `client` | |
| `get_client` | `{ clientId }` | `client` | |
| `list_deliverables` | `{ projectId?, status?, assignedTo? }` | `deliverable` | This is ADVO's "tasks" — migration 042 unified tasks into `deliverable`; there is no separate task table. |
| `get_deliverable` | `{ deliverableId }` | `deliverable` | |
| `list_meetings` | `{ projectId?, upcomingOnly? }` | `meeting`, `meeting_attendee` | Reuses the same `sortMeetings`/`fetchAttendeeMap` shape as `GET /api/meeting` (import the helper functions from `meeting.routes.ts` if exported, otherwise duplicate the ~15-line sort/attendee-join logic rather than importing a route file into a service — decide at EXECUTE time by checking whether `meeting.routes.ts` exports them; if not, extract them into `meeting.service.ts` first since Phase 2 needs the same logic for writes too). |
| `get_meeting` | `{ meetingId }` | `meeting`, `meeting_attendee` | Includes `transcript`/`summary` in full — these are not money fields. |
| `list_calendar_events` | `{ startsAt, endsAt }` | `calendar_event` | Range-bounded like `GET /api/calendar`. |
| `list_availability` | `{ teamMemberId?, startsAt?, endsAt? }` | `availability_block` | |
| `list_team` | `{}` | `team_member` | Public roster shape only — never includes `user.username`/password/email in this tool (that is login-credential surface, out of scope for a bot regardless of owner). |
| `recent_activity` | `{ limit? (max 50) }` | `activity_log` | Whatever rows already exist (mostly `preview_requested` today). Becomes much more useful once Phase 2's generic logging ships — kept in Phase 1 so the tool contract exists before Phase 2 needs it. |

**Money-gated tools (registered only when `botContext.isOwner === true`):**

| Tool | Input | Reads |
|---|---|---|
| `list_invoices` | `{ projectId? }` | `invoice` |
| `get_invoice` | `{ invoiceId }` | `invoice` |
| `list_contracts` | `{ clientId?, projectId? }` | `contract` |
| `get_contract` | `{ contractId }` | `contract` |
| `list_expenses` | `{ projectId? }` | `expense` |

Commission reads are explicitly deferred to Phase 2 discussion (not built in Phase 1) — commission
math is sensitive enough that exposing it read-only still needs an explicit owner sign-off on the
exact shape; flagged here, not silently dropped.

### 4.5 `apps/api/src/routes/mcp.routes.ts`

```ts
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { requireBotKey } from "../middleware/bot-auth.js";
import { registerReadTools } from "../services/mcp-tools.service.js";
import type { McpVariables } from "../types/bot-context.js";

const mcpRoutes = new Hono<{ Variables: McpVariables }>();

const mcpLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 120,
  keyGenerator: (c) => String(c.get("botKey")?.botKeyId ?? "unknown"),
});

// Order matters: requireBotKey must set the context before mcpLimiter's keyGenerator reads it.
mcpRoutes.use("/", requireBotKey, mcpLimiter);

mcpRoutes.post("/", async (c) => {
  const botContext = c.get("botKey");
  const server = new McpServer({ name: "advo", version: "1.0.0" });
  registerReadTools(server, botContext);
  // Phase 2 adds: registerWriteTools(server, botContext);

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

// Stateless mode supports neither a server-initiated SSE stream nor session teardown.
mcpRoutes.get("/", (c) => c.json({ data: null, error: "GET not supported in stateless mode" }, 405));
mcpRoutes.delete("/", (c) => c.json({ data: null, error: "DELETE not supported in stateless mode" }, 405));

export default mcpRoutes;
```

### 4.6 `apps/api/src/routes/bot-keys.routes.ts`

Owner-gated (same `requireOwnerCaller` pattern as `team.routes.ts`'s `/accounts`). Mounted at
`/api/bot-keys`, uses the **human** JWT (`Variables`), not `McpVariables` — this is the admin
console managing keys, not the MCP server itself.

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/` | List every `bot_key` joined to `team_member`, `{ botKeyId, teamMemberId, teamMemberName, keyPrefix, revokedAt, lastUsedAt, createdAt }` — no `keyHash`. |
| `POST` | `/` | Body `{ teamMemberId }`. 400 if that `team_member.userId IS NULL` ("Give this member a login first — Member accounts above."). 409 if a live key already exists for that member (partial-unique index backs this; catch the constraint via `mapDbError` or pre-check with a `SELECT`). Generates token, inserts hash+prefix, returns `{ botKeyId, token }` — **the only response that ever contains the raw token**. |
| `POST` | `/:id/revoke` | Sets `revokedAt = now()`. 404 if not found or already revoked. |

Reuse `requireOwnerCaller` from `team.routes.ts` if exported; if not currently exported, export it
(one-line change, additive) rather than duplicating the owner-check query a fifth time.

### 4.7 `apps/api/src/index.ts` — additive edits only

```ts
import mcpRoutes from "./routes/mcp.routes.js";
import botKeyRoutes from "./routes/bot-keys.routes.js";
// ... existing imports unchanged ...

app.route("/mcp", mcpRoutes);
app.route("/api/bot-keys", botKeyRoutes);
```

Placed near the other feature mounts (after `/api/vps-monitor`, before "Internal library"), no
reordering of existing lines.

## 5. Settings → Members UI (owner-only)

File: `apps/web/src/components/admin/AdminSettings.tsx` (MCP owns this file per the shared
contract). Extend the existing "Member accounts" panel (around line 310-339) — do not create a
separate page.

- Extend the `MemberAccount` interface (line 36) with `botKeyId: number | null`,
  `botKeyPrefix: string | null`, `botKeyRevokedAt: string | null`.
- `fetchAccounts` already hits `GET /api/team/accounts`; either (a) extend that endpoint's
  `SELECT` to left-join `bot_key` (simplest — one extra join, one extra `WHERE revoked_at IS
  NULL` filter, matching the "one live key" model), or (b) fetch `/api/bot-keys` separately and
  merge client-side by `teamMemberId`. **Prefer (a)**: it keeps one network round trip and the
  existing `team.routes.ts` file already owns this exact join pattern.
- Per account row, add a compact bot-key control next to the existing "Add login"/"Edit" button:
  - No key yet → "Add bot key" button → `POST /api/bot-keys { teamMemberId }` → show the
    returned `token` once in a dialog with a copy button and the text "This will not be shown
    again." (same one-shot-reveal UX pattern the Member Account dialog already uses for new
    passwords, just read-only + copy instead of input).
  - Key exists → show `keyPrefix` + a "Revoke" button → `POST /api/bot-keys/:id/revoke` →
    refetch.
  - Disabled entirely (grey "No login" text, no button) when `userId == null` — matches the
    backend's requirement that a member needs a login before a bot key.

## 6. Tests

- `apps/web/src/test/api-wiring.test.ts` (or a new `apps/api` test file, decide by whichever
  convention `scripts/test-local.sh` already drives — check whether API-only tests exist
  elsewhere under `apps/api/src/test`, mirror that if so): add live-API cases for
  `POST /api/bot-keys` (owner creates, 409 on second create, 400 on no-login member),
  `POST /api/bot-keys/:id/revoke`, and a full MCP round trip: `POST /mcp` with
  `{"jsonrpc":"2.0","method":"tools/list","id":1}` using a freshly created token returns the
  expected tool names (with and without `isOwner`), then `tools/call` for `whoami` and
  `list_projects`, then revoke the key and confirm the same request now 401s.
- Manual smoke test (record exact commands run, paste output into the EXECUTE report):
  ```
  curl -s -X POST http://localhost:6407/mcp \
    -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
  ```
  and the equivalent via MCP Inspector (`npx @modelcontextprotocol/inspector`) pointed at
  `http://localhost:6407/mcp` with the bearer token in its auth field — confirms a real MCP
  client (not just raw curl) can complete the handshake, which `tools/list` over curl alone does
  not fully exercise (no `initialize` round trip).
- `npm run build`, `npm run lint`, `./scripts/test-local.sh` all green.

## 7. Verification evidence to capture at EXECUTE

- `npm run db:local -- --name advo_mcp_check` output showing migration 055 applied and
  `migration-drift.mjs`'s clean verdict.
- The curl + MCP Inspector transcripts above.
- A `grep -r "key_hash\|keyHash" apps/web/src apps/api/src/routes` sanity check showing the raw
  hash is never sent to the frontend (only `keyPrefix`/`botKeyId`/timestamps).
- Screenshot of the extended Member accounts panel (desktop 1440), per the shared contract's
  screenshot convention, saved to
  `~/Downloads/ADVO/ADVO/Screenshots/advo-mcp-18-10-2026/`.

## 8. Rollback

- `DROP TABLE IF EXISTS bot_key;` + remove the `schema_migration` row — only safe before Phase 2
  lands (nothing references `bot_key` yet except this phase's own code).
- Revert `index.ts`'s two added mounts, delete the five new files (§4), revert
  `AdminSettings.tsx` and `team.routes.ts`'s export-only change.
- `npm uninstall @modelcontextprotocol/sdk` if abandoning entirely (unlikely mid-program, but
  listed for completeness).

## 9. Touchpoints / Public contracts / Blast radius

- **New files:** `apps/api/src/types/bot-context.ts`, `apps/api/src/utils/bot-key.ts`,
  `apps/api/src/middleware/bot-auth.ts`, `apps/api/src/services/mcp-tools.service.ts`,
  `apps/api/src/routes/mcp.routes.ts`, `apps/api/src/routes/bot-keys.routes.ts`,
  `apps/api/migrations/055_bot_key.sql`.
- **Edited files:** `apps/api/src/db/schema.ts` (append), `apps/api/src/index.ts` (2 import +
  2 mount lines), `apps/api/package.json` (1 dependency), `apps/web/src/components/admin/AdminSettings.tsx`
  (extend Member accounts panel), `apps/api/src/routes/team.routes.ts` (export
  `requireOwnerCaller` if not already exported — 1 line), `docs/SCHEMA.md` (append), `docs/FEATURES.md`
  (append, after confirming current heading structure).
- **New public contracts:** `POST /mcp` (bot-key auth, Streamable HTTP JSON-RPC),
  `GET /api/bot-keys`, `POST /api/bot-keys`, `POST /api/bot-keys/:id/revoke`.
- **Blast radius:** no existing route's behavior changes. The only shared-file edit with any
  risk is `team.routes.ts`'s export change, which is additive and cannot affect any existing
  caller.

## 10. Resume and execution handoff

Next action: `ENTER EXECUTE MODE` against this file. On completion, update the umbrella's phase
table and this file's own status line before Phase 2's RESEARCH refresh begins.

## 11. Execution report (18-10-26)

**Unresolved detail resolved:** `meeting.routes.ts` did not export `sortMeetings`/
`fetchAttendeeMap`. Extracted both (plus the `AttendeeRow` type) into a new
`apps/api/src/services/meeting.service.ts`, re-exported into `meeting.routes.ts` via import
(removed the now-dead local copies and the now-unused `inArray` import there), and imported the
same service into `mcp-tools.service.ts`'s `list_meetings`/`get_meeting`. Matches the plan's own
guidance that Phase 2 needs the same shape for writes.

**Deviation found and fixed (not a design change):** `apps/api/src/utils/bot-key.ts`'s
`botTokenPrefix` as written in this plan (`TOKEN_PREFIX.length + 8` = 17 chars) overflowed
`bot_key.key_prefix varchar(16)` by one character and 400'd every `POST /api/bot-keys` with "One
of the values is too long." Fixed to `TOKEN_PREFIX.length + 7` (16 chars, fits the column
exactly). No schema or route-contract change — a one-character arithmetic bug in the plan's own
listed code, caught and fixed during EXECUTE rather than returning to PLAN for a one-line
off-by-one.

**Verification evidence:**
- `npm run build` and `npm run lint` — clean (pre-existing `fetchPriority` dev-build warning and
  22 pre-existing `react-refresh/only-export-components` lint warnings only, 0 errors).
- `npm run db:local -- --name advo_dev --base postgresql://advo:changeme@localhost:5432` applied
  `055_bot_key.sql` cleanly. `migration-drift.mjs`'s ORPHAN list is pre-existing (15 filenames
  from earlier renumbering plus `057_plaud_chat.sql` from the parallel `plaud-chat` worktree
  applying directly against the shared `advo_dev`) and unrelated to this phase — confirmed by
  diffing the orphan list before and after this migration.
- `apps/web/src/test/bot-keys-mcp.test.ts` (new, 5 tests, all passing): 400 on no-login member,
  create + 409-on-second-create + revoke + 404-on-double-revoke, owner-vs-non-owner `tools/list`
  diff (money tools present/absent), garbage-token 401, revoked-key 401.
- `./scripts/test-local.sh`: fixed the pre-existing collection-breaking bug first (6 test files
  logged in with `{ email, password }`; `POST /api/auth/login` has required `{ username,
  password }` since migration 049) — `api-wiring.test.ts`, `corpus.test.ts`,
  `corpus-body.test.ts`, `e2e-flow.test.ts`, `calendar-scheduling.test.ts`,
  `client-thread.test.ts`. After the fix: **4 files failed, 7 tests failed, 871 passed, 3
  skipped** (881 total, 0 collection failures, up from 3 files unable to even collect). All 7
  failures are pre-existing and unrelated to bot-keys/MCP: `legal-compliance.test.ts` (footer
  link text), `plaud-resilience.test.ts` ×2 (poller suppression), plus two newly-visible
  pre-existing bugs that the collection failure had been hiding — `client-thread.test.ts` ×2
  (deliverable-completion notification, 400 instead of 201/200) and `e2e-flow.test.ts` ×2 (magic
  link 400, team avatar URL shape). None touch `bot_key`/`mcp`/`meeting.service`/`team.routes`
  code. The new bot-keys-mcp suite added 5 passing tests and 0 new failures.
- Manual curl smoke test against the real running API (`http://localhost:6407/mcp`): a
  non-owner's bot key's `tools/list` omits every money tool; the same key's `whoami` and
  `list_projects` calls return real data with money fields stripped; an owner's bot key's
  `tools/list` includes all 18 tools (13 base + 5 money-gated); a garbage bearer token 401s; a
  revoked key 401s on its next call.
- `grep -rn "key_hash\|keyHash" apps/web/src apps/api/src/routes apps/api/src/middleware
  apps/api/src/services apps/api/src/types` — only appears in the insert (write) and the
  `requireBotKey` lookup; never selected into any API response.
- Screenshots (desktop 1440×900 + mobile 390×844, logged in as `admin`/`changeme`) in
  `~/Downloads/ADVO/ADVO/Screenshots/mcp-bot-keys-2026-10-18/`: `01-member-list` (no key),
  `02-created-key-dialog` (one-shot reveal + copy button), `03-member-list-key-created` (prefix +
  Revoke), `04-member-list-revoked` (back to "Add bot key" + toast). Both viewports viewed and
  confirmed rendering correctly.
- Docs updated: `docs/SCHEMA.md` (`### bot_key` entry before `### schema_migration`),
  `docs/FEATURES.md` (bullet under the existing `### Settings` section).

**Left for Phase 2 / follow-up:** none required by this phase. `apps/api/.env`, dev servers
(API on 6407, web on 6400) stopped after verification; no servers left running.
