# Phase 5 — Contracts
**Program:** admin-simplify
**Date:** 02-09-26
**Status:** READY FOR EXECUTE
**Depends on:** Phase 4 complete (tabs stable)
**Blocks:** Phase 6b (Generate Draft reads the Signed/Final contract file added here)

---

## Goal

Replace the paste-text AI review panel in the project Contracts tab with a proper file upload list. Each uploaded file gets an AI review button that runs a plain-language lawyer-style review. Reviews persist. A per-file status dropdown (Draft / Final / Signed) drives which file Phase 6b reads. Word documents (.doc, .docx) must be supported alongside PDF.

---

## Touchpoints

| File | Lines | What changes |
|------|-------|-------------|
| `apps/api/migrations/027_contract_files.sql` | new | `contract_file` table |
| `apps/api/src/db/schema.ts` | after `contract` table block | Add `contractFile` table definition |
| `apps/api/src/routes/files.routes.ts` | 16–31 (MIME whitelist) | Add Word MIME types |
| `apps/api/src/routes/contracts.routes.ts` | full rewrite | New endpoints for contract file CRUD and AI review |
| `apps/api/src/services/contract-review.service.ts` | `AI_SYSTEM` prompt + `reviewWithClaude()` | Rewrite system prompt; add Word-to-text conversion path |
| `apps/web/src/components/admin/ProjectCommandCenter.tsx` | 628–717 (Contracts tab) | Replace paste-panel with file upload list |
| `apps/web/src/components/admin/shared/FileViewerDialog.tsx` | new | Reusable file viewer popup (used here, Phase 7) |
| `apps/api/package.json` | dependencies | Add `mammoth` for Word-to-text |

---

## Blast Radius

- The existing paste-text review panel (lines 645–717 in ProjectCommandCenter.tsx) is removed entirely. No data migration needed — paste reviews were never persisted in the database.
- The existing `contract` table (schema.ts line ~401) stores project contracts by reference (contractUrl). It is NOT removed; it is left for backward compatibility. The new `contract_file` table stores the uploaded files from this phase.
- `files.routes.ts` MIME whitelist widens to include Word types. This affects all file upload endpoints, not just contracts. This is acceptable — Word files are harmless.
- `mammoth` npm package added to `apps/api/package.json`.

---

## New Database Objects

### Migration 027 — `contract_file`

```
Table: contract_file
  contract_file_id    bigserial PRIMARY KEY
  project_id          integer NOT NULL REFERENCES project(project_id) ON DELETE CASCADE
  file_url            text NOT NULL
  file_name           text NOT NULL
  mime_type           varchar(100) NOT NULL
  status              varchar(20) NOT NULL DEFAULT 'draft'
    -- allowed: draft | final | signed (app-validated varchar, not enum)
  ai_review_text      text
    -- NULL until a review is run and returned
  ai_reviewed_at      timestamptz
  created_by          integer REFERENCES "user"(user_id) ON DELETE SET NULL
  created_at          timestamptz NOT NULL DEFAULT NOW()
  updated_at          timestamptz NOT NULL DEFAULT NOW()

  CONSTRAINT chk_contract_file_status CHECK (status IN ('draft', 'final', 'signed'))
  CONSTRAINT chk_contract_file_reviewed CHECK (
    (ai_review_text IS NULL) = (ai_reviewed_at IS NULL)
  )
```

---

## Step-by-Step Changes

### Step 1 — Write and apply migration 027
Write `apps/api/migrations/027_contract_files.sql` per the schema above.
Apply to dev database.

### Step 2 — Update Drizzle schema
Add `contractFile` table definition to `apps/api/src/db/schema.ts` after the existing `contract` block.

### Step 3 — Widen MIME whitelist in files.routes.ts
In `apps/api/src/routes/files.routes.ts` lines 16–31, add to the MIME whitelist:
- `application/msword` (Word .doc)
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (Word .docx)

These additions do not require a bucket change — they go into the existing `assets` bucket handling.

### Step 4 — Add mammoth dependency
In `apps/api/package.json` dependencies, add `"mammoth": "^1.8.0"`.
Run `npm install` or `pnpm install` in `apps/api/`.

### Step 5 — New contract file endpoints in contracts.routes.ts

Replace or extend `contracts.routes.ts` with the following endpoints:

`GET /api/contracts/files?projectId=:id` (requireAdmin)
- Returns array of contract files for the project, ordered by created_at DESC.
- Response: `{ data: [{ contractFileId, fileUrl, fileName, mimeType, status, hasReview: boolean, aiReviewedAt }] }`
- Note: `ai_review_text` is NOT returned in the list to keep payloads small.

`POST /api/contracts/files/upload` (requireAdmin)
- Accepts multipart form: `projectId`, `file` (single file).
- Validates MIME: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
- Calls the existing `POST /api/files/upload` logic internally (or duplicates the upload logic — use the helper function, not the HTTP route, to avoid chaining HTTP calls).
- Creates a `contract_file` row with `status = 'draft'`.
- Returns the created row (excluding ai_review_text).

`PATCH /api/contracts/files/:id/status` (requireAdmin)
- Body: `{ status: 'draft' | 'final' | 'signed' }`.
- Updates `contract_file.status`.
- Returns the updated row.

`GET /api/contracts/files/:id/review` (requireAdmin)
- If `ai_review_text` is already populated: returns it immediately (no AI call).
- If not: runs the AI review (see Step 6), stores the result, returns it.
- This is a synchronous request (not a background job) because the review is fast enough and the user is waiting for it.
- Response: `{ data: { contractFileId, aiReviewText, aiReviewedAt } }`.

`DELETE /api/contracts/files/:id` (requireAdmin)
- Deletes the `contract_file` row.
- Does NOT delete the physical file (disk cleanup is a maintenance task).
- Returns 204.

### Step 6 — Rewrite AI system prompt in contract-review.service.ts

The existing `AI_SYSTEM` prompt and `reviewWithClaude()` function (lines 319–387) review a text string passed in. Keep the function signature compatible — it takes a string of contract text.

Add a new exported function `extractContractText(filePath: string, mimeType: string): Promise<string>`:
- If mimeType is `application/pdf`: use Node.js `fs.readFile` + a text extraction approach. There is no PDF text extraction library installed. Add `pdf-parse` to `apps/api/package.json` as `"pdf-parse": "^1.1.1"`. Call `pdfParse(buffer).then(d => d.text)`.
- If mimeType is `application/msword` or the docx MIME: use `mammoth.extractRawText({ path: filePath })` and return `.value`.

Rewrite `AI_SYSTEM` prompt (replace the current content) with this intent:
- Act as a practical lawyer reviewing a website build contract for a small agency.
- The review is for the agency's internal use to catch things that need fixing before signing.
- Focus on: missing scope definition, no change-order clause, missing payment terms, no IP assignment, no limitation of liability, no termination clause, unrealistic delivery promises.
- Do NOT try to be exhaustive. A website build contract does not need airtight legal coverage. Return a SHORT bulleted list of things to fix or watch out for. Plain words, no legal jargon.
- Maximum 300 words in the response.

The `reviewWithClaude()` function already calls `claude-opus-5` with `max_tokens 8000`. After the prompt rewrite, reduce `max_tokens` to 1000 (the new response is much shorter).

In `contracts.routes.ts` `GET /api/contracts/files/:id/review`: 
- Read the file from disk using `file_url`.
- Call `extractContractText(filePath, mimeType)` to get text.
- Call `reviewWithClaude(text)` to get the review.
- Store `ai_review_text` and `ai_reviewed_at` in the database.

### Step 7 — Build FileViewerDialog shared component
Create `apps/web/src/components/admin/shared/FileViewerDialog.tsx`.
Props:
```
url: string
fileName: string
onDelete: () => void
onClose: () => void
```
Content:
- Dialog header: the file name as an editable inline input. On blur/enter: calls a rename endpoint if the name changed. (Rename endpoint: `PATCH /api/contracts/files/:id` with `{ fileName }` — add this endpoint in Step 5 if not already present.)
- Main area: an `<iframe src={url}>` for PDF; for Word files, show a "Download to view" message because browsers cannot render Word inline.
- Footer: "Download" button (anchor with download attribute), "Delete" button (calls `onDelete`, which should trigger ConfirmDeleteDialog in the parent before calling this).
- X button closes the dialog (calls `onClose`).

### Step 8 — Replace Contracts tab in ProjectCommandCenter.tsx
In lines 628–717, replace the entire Contracts tab content with:

1. "Upload contract" button (opens a file picker accepting PDF and Word files). On file select: calls the upload endpoint and refreshes the list.
2. A list of uploaded contract files. Each row:
   - File name (left).
   - Status button/badge (right) — a dropdown with options Draft / Final / Signed. Current status shown as the button label. On select: calls the status endpoint.
   - "View file" button — opens `<FileViewerDialog>`.
   - "Review" button — calls `GET /api/contracts/files/:id/review`. While loading: button shows a spinner. Once a review exists: button changes label to "See review" and opens a dialog showing the `ai_review_text` in a scrollable text area.
3. Empty state: "No contracts uploaded yet." with the upload button repeated.

Delete the paste-text review panel (lines 645–717) entirely.

---

## Public Contracts

New endpoints:
- `GET /api/contracts/files?projectId=:id` → `{ data: [...] }`
- `POST /api/contracts/files/upload` → `{ data: { contractFileId, ... } }`
- `PATCH /api/contracts/files/:id/status` → `{ data: { contractFileId, status } }`
- `PATCH /api/contracts/files/:id` → `{ data: { contractFileId, fileName } }` (rename)
- `GET /api/contracts/files/:id/review` → `{ data: { contractFileId, aiReviewText, aiReviewedAt } }`
- `DELETE /api/contracts/files/:id` → 204

---

## Verification Evidence

1. Run `pnpm test --filter web`. All tests pass.
2. Apply migration 027. Confirm table exists: `psql -c "\d contract_file"`.
3. Upload a PDF contract to a project. Confirm a row appears in the list.
4. Upload a Word (.docx) contract. Confirm it uploads without error.
5. Try uploading an .mp3 file to the contracts section. Confirm rejection with a readable error.
6. Click "Review" on the PDF contract. Wait for the result. Confirm a bulleted list of issues appears (not empty, not a 500 error).
7. Refresh the page. Click "See review". Confirm the review text from before is still there (persisted in DB, not re-run).
8. Click "View file". Confirm the FileViewerDialog opens with the file name editable, an iframe showing the PDF, and a Download button.
9. Change the status dropdown from "Draft" to "Signed". Confirm the status updates.
10. Delete a contract file. Confirm ConfirmDeleteDialog appears. Confirm the row disappears after confirm.
11. Confirm the paste-text panel is completely gone from the Contracts tab.

---

## Rollback

- Revert `ProjectCommandCenter.tsx` (Contracts tab JSX).
- Revert `contracts.routes.ts`, `contract-review.service.ts`, `files.routes.ts`.
- Delete `FileViewerDialog.tsx`.
- Drop migration: `DROP TABLE contract_file;`
- Remove `mammoth` and `pdf-parse` from `apps/api/package.json`.

---

## Resume and Execution Handoff

File to pass to vc-execute-agent: `process/features/admin-simplify/active/phase-05_contracts_02-09-26.md`
Next phase after completion: `process/features/admin-simplify/active/phase-06_background-jobs_02-09-26.md`
Archive this file to `process/features/admin-simplify/completed/` when done.
