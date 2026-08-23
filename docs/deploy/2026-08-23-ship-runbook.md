# Ship runbook — 2026-08-23

Deploy the three features that are merged to `main` but answer 404 on prod, and
close the migration hole underneath a fourth.

**This file is the PROCEDURE. It is not the evidence.** The evidence is
`2026-08-23-pre-ship-snapshot.md`, and it is written by running Phase 0 below and
pasting the real output. A snapshot filled in from this template without running
anything is worse than no snapshot at all: it reads as a record of prod and is a
record of nothing.

## What is actually wrong

Probed live 2026-08-23 11:32 UTC against `https://api.advo.ph`:

| route | observed | why |
|---|---|---|
| `/api/project-signoff` | 404 | prod is running code from 2026-08-19 (uptime 363401 s); migration 016 also unapplied |
| `/api/recurring-fee` | 404 | same — code + migration 017 |
| `/api/commission` | 404 | same — code + migration 018 |
| `/api/expense` | 401 | route IS mounted; the table under it is not. Health error buffer still carries `relation "expense" does not exist` from 2026-08-19 |

Two distinct faults, and it matters that they are distinct:

1. **Prod's code is stale.** All four routes are mounted in `apps/api/src/index.ts`
   on `main`. Three answer 404 because the box has never seen that code. A code
   deploy alone fixes the 404s — and would then produce three routes returning
   500 over missing tables.
2. **Prod's applied-migration history has a HOLE.** 015 is present, 005 is absent.
   The set was never sequential, so "apply everything after the highest number"
   is the wrong mental model and would leave `expense` broken forever. Phase 0
   reads the true set rather than assuming it.

This deploy proceeds against that hole knowingly, without waiting for the drift
detector. That is the operator's call, and it is exactly why Phase 0 is
mandatory rather than a courtesy.

## Preconditions

- `ssh advo` works (`62.146.237.12`, Contabo Singapore).
- Local gate is green: `npx tsc --noEmit && npm run lint && npm run build:web`.
- You have read this whole file. Phases 1–3 change production.

---

## Phase 0 — snapshot. Read-only. Do not skip.

Nothing below this line is reversible without the output of this phase.

**0.1 — Read the applied-migration set and the ownership map off prod.**

```bash
ssh advo "sudo -u postgres psql -d advo -f -" \
  < docs/deploy/applied-migration-probe.sql \
  | tee /tmp/advo-preflight-2026-08-23.txt
```

Paste the full table into the snapshot. Every `absent` row is a hole; 005 is the
known one, and if the probe shows others they are in scope for this deploy or
they are a deliberate, written-down exclusion.

**0.2 — Confirm the FK targets 016/018 need already exist.** 016 references
`project`, `contract`, `invoice`, `deliverable`, `"user"`; 018 references
`project`, `team_member`, `"user"`. If the probe shows 004 (`contract`) or 002
absent, STOP — 016 will fail mid-transaction.

**0.3 — Back up. This is the only way back.**

```bash
ssh advo "sudo -u postgres pg_dump -Fc advo \
  > /var/backups/advo/advo_pre-ship_2026-08-23.dump && \
  ls -l /var/backups/advo/advo_pre-ship_2026-08-23.dump"
```

Record the path and the byte size in the snapshot. A dump you did not check the
size of is not a backup.

**0.4 — Record the code version currently on the box**, so the rollback has
something to roll back *to*:

```bash
ssh advo "cd /opt/advo && git rev-parse HEAD 2>/dev/null; pm2 describe advo-api | head -20"
```

---

## Phase 1 — migrations

Apply in ascending order. **As the `advo` role, not as `postgres`.** Running as
`postgres` reproduces the 2026-08-19 bug where the objects exist but the app
cannot read them.

```bash
for m in 005_expense 016_project_signoff 017_recurring_fee 018_commission_split; do
  echo "=== $m"
  ssh advo "psql -U advo -d advo -v ON_ERROR_STOP=1 -f -" \
    < "apps/api/migrations/$m.sql" || { echo "FAILED at $m"; break; }
done
```

Each file is wrapped in `BEGIN`/`COMMIT`, so a failure inside one leaves that
migration fully unapplied — but earlier files in the loop have already committed.
The loop `break`s rather than pressing on.

If `psql -U advo` is refused for lack of `CREATE` on schema `public`, fall back to
`sudo -u postgres` for that file and treat Phase 2 as **mandatory**, not
belt-and-braces.

**Known hazard — 017 is not re-runnable.** `CREATE TYPE recurring_fee_status`
carries no `IF NOT EXISTS`, so a second run of 017 aborts on the type before it
reaches anything else. If you need to re-run it, create the type guarded first:

```sql
DO $$ BEGIN
  CREATE TYPE recurring_fee_status AS ENUM ('active','paused','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

Everything else in all four files is `IF NOT EXISTS` and re-runs cleanly.

---

## Phase 2 — ownership

```bash
ssh advo "sudo -u postgres psql -d advo -v ON_ERROR_STOP=1 -f -" \
  < docs/deploy/ownership-fix.sql
```

It ends in a `DO` block that RAISES if any table or sequence in `public` is still
owned by anything but `advo`. A silent success here is a real success. Copy the
`ALTER ... OWNER TO advo` statements you ran, and the verification line, into the
snapshot.

---

## Phase 3 — code

```bash
./deploy.sh --api-only
```

Rsyncs `apps/api/` to `/opt/advo/apps/api`, installs, restarts PM2 `advo-api`.
It does not touch the remote `.env`. Add the web deploy (`./deploy.sh`) only if
this tier ships frontend too — it does not.

Note this restart CLEARS the health error buffer, including the 2026-08-19
`relation "expense" does not exist` entries. That buffer going quiet is a
consequence of the restart and is **not evidence the table exists**. Phase 4.2 is.

---

## Phase 4 — verify

**4.1 — Routes are mounted and auth-gated.** 401/403 is the pass. 404 means the
code did not land; 500 means it landed over a missing table.

```bash
for p in /api/project-signoff /api/recurring-fee /api/commission /api/expense; do
  printf '%-24s %s\n' "$p" \
    "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://api.advo.ph$p)"
done
```

**4.2 — Read the `expense` relation back on prod.** Positive evidence, as the
app role. An unauthenticated HTTP probe cannot reach the query, so this is the
only honest check:

```bash
ssh advo "psql -U advo -d advo -c '\dt expense' -c 'SELECT count(*) FROM expense;'"
```

Paste the output into the snapshot verbatim.

**4.3 — Health.**

```bash
curl -s https://api.advo.ph/api/health | python -m json.tool
```

Expect `status: ok`, `db: true`, and `degradedReason` containing the pre-existing
Plaud entry and **nothing else**. Any new degraded reason means this deploy broke
something — go to Rollback.

**4.4 — Re-run the probe** from 0.1 and confirm 005/016/017/018 now read
`present` and the ownership query returns no rows.

**4.5 — The bench.**

```bash
ADVO_API_URL=https://api.advo.ph npm run bench:ship
```

10/10, or it did not ship.

---

## Rollback

Fastest first.

**Code only** (routes 404/500 but the DB is fine) — redeploy the previous commit:

```bash
git checkout <sha from 0.4> -- apps/api && ./deploy.sh --api-only
```

**Schema** — restore the Phase 0.3 dump. This is destructive and discards
everything written to prod since the dump was taken, so check the clock first:

```bash
ssh advo "pm2 stop advo-api"
ssh advo "sudo -u postgres pg_restore --clean --if-exists -d advo \
  /var/backups/advo/advo_pre-ship_2026-08-23.dump"
ssh advo "pm2 start advo-api"
```

**Surgical alternative** — if only one migration is bad, its objects can be
dropped without a full restore, because none of 016/017/018 is referenced by
anything pre-existing. 017 is the exception: it added two columns to `invoice`,
and dropping them is fine only while no invoice row carries a non-NULL
`recurring_fee_id`.

```sql
DROP TABLE IF EXISTS commission_share, commission_plan;                 -- 018
DROP TABLE IF EXISTS signoff_revision, project_signoff;                 -- 016
DROP TABLE IF EXISTS recurring_fee;                                     -- 017
ALTER TABLE invoice DROP COLUMN IF EXISTS recurring_fee_id,
                    DROP COLUMN IF EXISTS period_start_on;
DROP TYPE IF EXISTS recurring_fee_status;
```

Do not drop `expense` (005) on rollback — it is the fix, not the risk.
