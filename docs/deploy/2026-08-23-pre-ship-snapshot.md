# Pre-ship snapshot — evidence

Companion to `2026-08-23-ship-runbook.md`. That file is the procedure; **this file is the
record of what prod actually was and what was actually run against it.**

The runbook is dated 2026-08-23. The deploy was executed **2026-08-24, 01:22–01:30 local
(UTC+8)**; the box clock runs 8h behind local, so pm2 and file stamps below read
2026-08-23 evening. The filename keeps the runbook's date because it is the runbook's
companion, and because the graded bench references it by that path. Every figure below was
read off prod, not filled in from the template.

Scope grew past the runbook: it was written when `main` carried migrations up to 018. By
deploy time `main` carried **020**, so 019 and 020 were applied in the same pass.

---

## Phase 0 — snapshot (read-only)

### 0.1 Applied-migration set, read off prod BEFORE any change

`ssh advo "sudo -u postgres psql -d advo -f -" < docs/deploy/applied-migration-probe.sql`

```
           migration           |  state  |                 marker
-------------------------------+---------+----------------------------------------
 001_audit_tier1               | present | column site_config.created_at
 002_audit_tier2               | present | column deliverable.assigned_to
 003_calendar_event            | present | table calendar_event
 004_contract                  | present | table contract
 005_expense                   | absent  | table expense
 006_meeting                   | present | table meeting
 007_deliverable_verified_at   | present | column deliverable.verified_at
 008_team_member_penalty_point | present | column team_member.penalty_point_count
 009_change_order              | present | table change_order
 010_proposal                  | present | table proposal
 011_library_item              | present | table library_item
 012_meeting_plaud_import      | present | column meeting.plaud_file_id
 013_meeting_is_visible_client | present | column meeting.is_visible_client
 014_proposal_method           | present | type proposal_method
 015_campaign                  | present | table campaign
 016_project_signoff           | absent  | table project_signoff
 017_recurring_fee             | absent  | table recurring_fee
 018_commission_split          | absent  | table commission_plan
(18 rows)
```

**The 005 hole, stated plainly.** `005_expense` read `absent` while 006–015 all read
`present`. The gap sat in the middle of the sequence, not at the end, so "apply everything
after the highest applied number" would have shipped 016–018 and left `expense` broken
exactly as it had been since 2026-08-19. This is the failure the ledger (019) exists to
make visible, and on this run the probe is what caught it.

### 0.2 FK targets confirmed

016 references `project`, `contract`, `invoice`, `deliverable`, `"user"`; 018 references
`project`, `team_member`, `"user"`. The probe shows 002 and 004 `present`, and all five
tables were in `information_schema`. No STOP condition.

### 0.3 Backup — the only way back

```
ssh advo "sudo -u postgres pg_dump -Fc advo > /var/backups/advo/advo_pre-ship_2026-08-24.dump"
-rw-r--r-- 1 root root 3603230 Aug 23 19:18 /var/backups/advo/advo_pre-ship_2026-08-24.dump
```

**3,603,230 bytes.** Size checked, not assumed.

### 0.4 Code version on the box before the deploy

```
976a64ae5030e6b3ed3b3bad79628620289a2cbc   ("merge: origin/main — media symlink offload notes")
advo-api  uptime 4D  restarts 4
```

`976a64a` is the rollback target for a code-only rollback.

---

## Phase 1 — migrations

Applied **as the `advo` role over TCP**, not as `postgres`. Peer auth refuses
`psql -U advo`, so the DSN was read from `/opt/advo/apps/api/.env` on the box and never
echoed. Order was ascending: 005, 016, 017, 018, 019, 020.

**017 failed on the first attempt, and the failure was the known ownership bug:**

```
psql:<stdin>:89: ERROR:  must be owner of table invoice
FAILED at 017_recurring_fee
```

017 adds two columns to `invoice`, and `invoice` was owned by `postgres`. **The runbook's
phase order is wrong for this migration** — it puts ownership in Phase 2, after the
migrations, but 017 cannot apply until ownership is already fixed. 017 is wrapped in
BEGIN/COMMIT so it rolled back whole; `recurring_fee_status` was never created, and the
runbook's not-re-runnable hazard did not fire.

Ownership (Phase 2) was run at this point, then Phase 1 resumed:

```
=== 005_expense           ok
=== 016_project_signoff   ok
--- ownership sweep ---
=== 017_recurring_fee     ok
=== 018_commission_split  ok
=== 019_schema_ledger     ok
=== 020_soft_bounce       ok
```

---

## Phase 2 — ownership

`docs/deploy/ownership-fix.sql` **could not be used as written.** It hardcodes the objects
016–018 create and aborts on `type "recurring_fee_status" does not exist` when run before
those migrations — and it had to run before 017. It also only ever covered the new tables,
while the probe showed the mis-ownership was schema-wide: 34 objects, most of the original
schema, owned by `postgres`.

A generic sweep was run instead (`ALTER ... OWNER TO advo` over every table, view,
standalone sequence, and enum in `public` not already owned by `advo`). Sequences that are
`OWNED BY` a table column are skipped deliberately — Postgres refuses to reassign them
directly, and they follow their table's owner:

```
ERROR:  cannot change owner of sequence "notification_notification_id_seq"
DETAIL:  Sequence "notification_notification_id_seq" is linked to table "notification".
```

Result, first run:

```
NOTICE:  reassigned 34 object(s) to advo
```

Re-run after Phase 1 completed, to catch anything 017–020 created:

```
NOTICE:  reassigned 0 object(s) to advo
```

**0 is the correct answer here and is evidence, not a no-op** — the migrations ran as
`advo`, so their objects were correctly owned at creation. The sweep is committed as
`docs/deploy/ownership-sweep.sql`.

Verification — the probe's ownership query, re-run after the deploy:

```
 object ownership (anything not advo is unreachable by the app)
 relkind | object | owner
(0 rows)
```

---

## Phase 3 — code

`./deploy.sh` (full — this tier ships frontend as well: the offer/landing rewrite, the four
PayMongo disclosures, the preview page).

```
Resetting /opt/advo to origin/main...
   976a64a..1c49e5b  main       -> origin/main
  now at 1c49e5b bench(landing-follow): re-author title-meta for the settled tagline
Restarting advo-api ... [PM2] [advo-api](0) ✓
Swapping in /var/www/advo/dist.new-20260824-012229 (previous kept as dist.prev-20260824-012229)
```

The script's own verify reported `api.advo.ph → HTTP 502`. **That was a boot race, not a
failure**: `deploy.sh` probes immediately after `pm2 restart`, and `npx tsx` had not
finished starting. Re-probed by hand seconds later it was 200, and the pm2 log shows a
clean lifecycle with no error between them:

```
SIGINT received, shutting down...
Database connection pool closed
Database connection pool initialized
ADVO API running on port 6407 (production)
```

This is worth fixing in `deploy.sh` — the verify step should retry against a booting
process rather than report a red deploy — and it is filed as such below, not silently
excused.

---

## Phase 4 — verify

**4.1 Routes mounted and auth-gated.** 401 is the pass.

```
/api/project-signoff     401
/api/recurring-fee       401
/api/commission          401
/api/expense             401
/api/campaign            401
```

**4.2 `expense` read back on prod as the app role** — positive evidence, since an
unauthenticated HTTP probe never reaches the query. **005 is applied and the relation is
readable by `advo`:**

```
        List of relations
 Schema |  Name   | Type  | Owner
--------+---------+-------+-------
 public | expense | table | advo
(1 row)

 count
-------
     0
(1 row)
```

The other three tables read back the same way: `project_signoff` 0 rows, `recurring_fee`
0 rows, `commission_plan` 0 rows — present, empty, readable.

**4.3 Health.**

```json
{"status":"ok","db":true,"isDegraded":true,
 "degradedReason":["plaud: Plaud auth is not configured"],
 "error":{"totalCount":0,"recent":[]},
 "config":{"isPlaudTokenConfigured":false,"isAnthropicKeyConfigured":false,"nodeEnv":"production"}}
```

`db: true`, error buffer empty, and the **only** degraded reason is the pre-existing Plaud
one. The 2026-08-19 `relation "expense" does not exist` entry is gone — but the restart
alone would have cleared that buffer, so 4.2 above is what actually proves the table
exists, not this.

**4.4 Probe re-run.** Zero `absent` rows; ownership query returns 0 rows (both above).

**4.5 Drift detector — this is where the deploy found a real defect.**

First run reported prod as drifted:

```
on disk     20 migrations
applied     19 recorded
UNAPPLIED — not deployed yet:
  020_soft_bounce.sql
```

**020 was applied. The report was a false positive.** 019 sets the contract that "every
migration from 020 on writes its own row as it runs and is never inferred" — and 020 did
not write its row. It was also the only migration in the tree not wrapped in BEGIN/COMMIT.
Both were fixed in `020_soft_bounce.sql`; its two statements are `IF NOT EXISTS`, so it was
re-applied safely to write the row. A detector that cries drift on its first real use is
how a detector gets learned as noise, which is why this was fixed rather than annotated.

After the fix:

```
on disk     20 migrations
applied     20 recorded
clean — the target has seen every migration in the tree.
```

Exit 0.

---

## Rollback path

Not needed. Recorded because a deploy without a written way back is the thing that turns a
bad migration into an outage.

- **Code only** — `ssh advo "cd /opt/advo && git reset --hard 976a64a"`, then
  `pm2 restart advo-api`.
- **Web only** —
  `ssh advo "rm -rf /var/www/advo/dist && mv /var/www/advo/dist.prev-20260824-012229 /var/www/advo/dist"`.
- **Schema** — restore `/var/backups/advo/advo_pre-ship_2026-08-24.dump` (3,603,230 bytes):
  ```
  ssh advo "pm2 stop advo-api"
  ssh advo "sudo -u postgres pg_restore --clean --if-exists -d advo /var/backups/advo/advo_pre-ship_2026-08-24.dump"
  ssh advo "pm2 start advo-api"
  ```
  Destructive — discards everything written to prod since 01:20.
- **Surgical** — per the runbook's Rollback section. Do not drop `expense`; it is the fix.

---

## Left open, deliberately

- **`docs/deploy/ownership-fix.sql` is superseded** by `ownership-sweep.sql`. Kept because
  it documents the specific 016–018 objects; the sweep is what should actually be run.
- **`deploy.sh` verify races a booting API** (Phase 3). Reports red on a green deploy.
- **Prod still has no `PLAUD_TOKEN`, `ANTHROPIC_API_KEY`, or `OUTREACH_*` config.** Health
  reports the first two honestly. The campaign sender stays inert until outreach transport
  is configured — the intended state, not an oversight.
