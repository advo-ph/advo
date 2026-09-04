# Phase 10 — Plain-Language Pass Over the Whole Internal Site
**Program:** admin-simplify
**Date:** 02-09-26
**Status:** READY FOR EXECUTE
**Depends on:** Phase 9 complete (all UI changes from phases 1–9 are done first so this pass sees the final state)
**Blocks:** nothing (final phase)

---

## Goal

Go through every admin section and every screen. Fix confusing names, cut jargon, shorten button labels, improve empty states, and clarify error messages. Produce a rename table as a deliverable for owner review before any renames are applied.

The target audience is a person who has never used project management software and has no business or technical background. The site exists to track what needs doing and to finish it.

---

## Touchpoints

Every file in `apps/web/src/components/admin/` is in scope. The sidebar (`AdminSidebar.tsx`) is the starting point. Then each page component in order.

| File | Scope |
|------|-------|
| `apps/web/src/components/admin/AdminSidebar.tsx` | Sidebar item labels |
| `apps/web/src/components/admin/AdminDashboard.tsx` | Section titles, stat labels |
| `apps/web/src/components/admin/AdminProjects.tsx` | Table headers, button labels, empty states |
| `apps/web/src/components/admin/ProjectCommandCenter.tsx` | Tab labels, section headings, button labels |
| `apps/web/src/components/admin/AdminClients.tsx` | Labels and actions |
| `apps/web/src/components/admin/AdminLibrary.tsx` | Section titles, empty states |
| `apps/web/src/components/admin/AdminTeam.tsx` | Column headers, role labels |
| `apps/web/src/components/admin/AdminSchedule.tsx` | Page title, column headers, empty states |
| `apps/web/src/components/admin/AdminCalendar.tsx` | Labels |
| `apps/web/src/components/admin/AdminAvailability.tsx` | Labels |
| `apps/web/src/components/admin/AdminSignoff.tsx` | Section title, button labels |
| `apps/web/src/components/admin/AdminMeetings.tsx` | Page title, button labels, empty states |
| `apps/web/src/components/admin/AdminFinance.tsx` | Section titles, column headers |
| `apps/web/src/components/admin/AdminContentStudio.tsx` | Page title, section labels |
| `apps/web/src/components/admin/AdminPortfolio.tsx` | Labels |
| `apps/web/src/components/admin/AdminSocial.tsx` | Labels |
| `apps/web/src/components/admin/AdminLeads.tsx` | Column headers, status labels |
| `apps/web/src/components/admin/AdminProposals.tsx` | Labels |
| `apps/web/src/components/admin/AdminCampaign.tsx` | Labels |
| `apps/web/src/components/admin/AdminNotifications.tsx` | Labels |
| `apps/web/src/components/admin/AdminBrandScraper.tsx` | Page title, labels |
| `apps/web/src/components/admin/AdminFacebookScraper.tsx` | Page title, labels |
| `apps/web/src/components/admin/AdminSettings.tsx` | Section titles, labels |
| `apps/web/src/components/admin/AdminCommission.tsx` | Labels (mostly done in Phase 8) |

---

## Blast Radius

- Only text strings (labels, button text, headings, empty states, error messages) change in this phase.
- No API endpoints change.
- No schema changes.
- No new migrations.
- No routing changes.
- If a sidebar item is renamed, the `<Link>` href does not change — only the visible label text changes.

---

## Step-by-Step Changes

### Step 1 — DELIVERABLE: Rename Table (produce this before making any changes)

Before touching any file, produce the following rename table as a comment at the top of this plan and as a section in the EXECUTE agent's output. The owner reviews and approves the table before implementation continues.

**Jargon Audit and Proposed Rename Table:**

| Location | Old Name | New Name | Why |
|----------|----------|----------|-----|
| Sidebar | Dashboard | Dashboard | Keep — universally understood |
| Sidebar | Tasks | Tasks | Keep — clear enough |
| Sidebar | Projects | Projects | Keep |
| Sidebar | Clients | Clients | Keep |
| Sidebar | Library | Files | "Library" sounds like a media center. "Files" is what it is. |
| Sidebar | Team | Team | Keep |
| Sidebar | Deliverables | Deliverables | Keep — changed meaning is explained in the tab |
| Sidebar | Schedule | Work Schedule | The current label "Schedule" is ambiguous. "Work Schedule" is clearer. |
| Sidebar | Calendar | Calendar | Keep |
| Sidebar | Availability | Availability | Keep |
| Sidebar | Contracts | Contracts | Keep |
| Sidebar | Meetings | Meetings | Keep |
| Sidebar | Finance | Finance | Keep |
| Sidebar | Content Studio | Content | "Studio" is jargon. Just "Content". |
| Sidebar | Portfolio | Portfolio | Keep |
| Sidebar | Social | Social | Keep |
| Sidebar | Leads | Leads | Keep — common enough |
| Sidebar | Proposals | Proposals | Keep |
| Sidebar | Campaigns | Campaigns | Keep |
| Sidebar | Notifications | Notifications | Keep |
| Sidebar | Brand Scraper | Brand Research | "Scraper" is a technical term. "Brand Research" says what it does. |
| Sidebar | FB Scraper | Facebook Research | Same reason. |
| Sidebar | Settings | Settings | Keep |
| ProjectCommandCenter.tsx | "Dev & Deploy" tab | "Website" | Already renamed in Phase 4. Confirm it is done. |
| ProjectCommandCenter.tsx | "Sign-off" tab | "Approval" | "Sign-off" sounds like an internal HR term. "Approval" is what the client does. |
| ProjectCommandCenter.tsx | "Contracts" tab | "Contracts" | Keep |
| ProjectCommandCenter.tsx | "Meetings" tab | "Meetings" | Keep |
| ProjectCommandCenter.tsx | "Files" tab | "Files" | Keep |
| ProjectCommandCenter.tsx | "Finance" tab | "Money" | "Finance" is formal. "Money" is direct and clear for this audience. |
| ProjectCommandCenter.tsx | "Deliverables" tab | "Tasks" | The standalone Deliverables page and this tab have created confusion; "Tasks" is more intuitive in this context. NOTE: owner must approve this — it conflicts with the Tasks sidebar item. Present as an option, not a decision. |
| AdminSchedule.tsx | "Deliverables" page title | "Work Items" | Avoids the word "Deliverables" which has a professional/formal tone |
| AdminSchedule.tsx | "Add deliverable" button | "Add work item" | Matches the page title |
| AdminMeetings.tsx | "MoM" | "Meeting notes" | "MoM" (Minutes of Meeting) is jargon. |
| AdminSignoff.tsx | "Sign-off" | "Client Approval" | Less internal-sounding. |
| AdminLeads.tsx | "Pipeline" (if present) | "Prospects" | "Pipeline" is a sales jargon term. |
| AdminLeads.tsx | "Stage" column | "Status" | More familiar. |
| AdminFinance.tsx | any "Stage" label for invoice | "Type" | "Stage" on an invoice means "Downpayment" or "Full" — "Type" is clearer. |
| AdminCommission.tsx | "Commission" | "Commission" | Keep — this audience understands what commission means in a business context. |
| AdminContentStudio.tsx | Page title "Content Studio" | "Content" | Same as sidebar |
| General | "No [X] yet." empty states | "[Action] to get started." | Empty states should prompt action, not just report absence. Each empty state gets its own specific prompt. |
| General | Error messages containing "Something went wrong" | "We hit an issue. Try again." | Friendlier. |
| General | "Create" buttons | "Add" or specific verb | "Create" is technical. "Add a client", "Add a task", etc. |
| General | "Submit" buttons | Specific verb | "Submit" is a form concept. Use "Save", "Confirm", or the action name. |

**Owner approval is required before Step 2 begins.** Present the table to the owner and wait for a "go" or edits.

### Step 2 — Apply approved sidebar renames
In `AdminSidebar.tsx`: update the visible label text for each approved rename. Do not change route paths, icon names, or key values.

### Step 3 — Apply page title and heading renames
For each component in the Touchpoints table: update the `<PageHeader title="...">` and any `<h1>` or `<h2>` strings that match the approved rename table.

### Step 4 — Apply button label renames
For each component: rename buttons per the approved table. Priority targets:
- All "Create" buttons → "Add [noun]" or the specific action.
- All "Submit" buttons → "Save" or the action name.
- Any "New MoM" remaining → "Upload recording" (should already be done in Phase 6 — verify).
- Any "Draft sign-off" remaining → "Generate Draft" (should be done in Phase 6 — verify).

### Step 5 — Improve empty states
For each component, replace every generic "No [X] yet." with an actionable prompt. Examples:
- "No clients yet." → "Add your first client to start tracking projects."
- "No tasks yet." → "Add a task to get started."
- "No invoices uploaded yet." → already set in Phase 7 — verify.
- "No contracts uploaded yet." → already set in Phase 5 — verify.
The prompt must include a button or a link to the action, not just text.

### Step 6 — Review error messages
Search for "Something went wrong", "Error", "Failed", and similar generic error strings across all admin components. Replace each with a specific, actionable message:
- "Something went wrong." → "We hit an issue. Try again."
- "Failed to load." → "Could not load [what]. Check your connection and try again."
- "Unauthorized" (shown to users) → "You do not have permission to do this."

### Step 7 — Cut unnecessary information
Review every section for information nobody acts on. Remove or hide (behind a "more" toggle) anything that passes this test: "If I remove this, does the user lose the ability to make a decision or take an action?" If the answer is no, remove it.

Specific targets:
- Any raw database IDs shown to users.
- Any technical status codes (HTTP status numbers, enum values in raw form).
- Any developer-facing fields accidentally left in the UI (check for `repositoryName` or `githubUrl` shown in client-facing sections — those should be in the Website tab only).

### Step 8 — Fewer buttons per row
For any row with more than 2 action buttons, move rare actions to a dropdown "More" menu (three-dot icon, Radix DropdownMenu). Primary action stays as a button. Secondary action can stay as a button. Tertiary and below go into the dropdown. Apply this to any row discovered during the audit that was not already addressed in Phases 1–9.

---

## Deliverable: Rename Table (embedded for execution)

The table in Step 1 above is the Phase 10 deliverable. It must be presented to the owner before any file edits begin. The EXECUTE agent must produce the table in its first output, then pause and ask "Do you approve this rename table? Say 'approved' or share edits."

---

## Verification Evidence

1. Run `pnpm test --filter web`. All tests pass.
2. Walk through the sidebar. Confirm every renamed item shows the new label.
3. Open every page listed in the Touchpoints table. Spot-check:
   - Page title matches the approved rename.
   - Button labels use plain words (no "Create", "Submit").
   - Empty states have an actionable prompt.
   - No raw IDs or enum values visible.
4. For any row that had more than 2 buttons pre-Phase-10: confirm rare actions are in a dropdown.
5. The rename table was approved by the owner before edits were applied.

---

## Rollback

Revert any changed files. No database or API changes to roll back.

---

## Resume and Execution Handoff

File to pass to vc-execute-agent: `process/features/admin-simplify/active/phase-10_plain-language_02-09-26.md`
This is the final phase. After completion, archive all phase files to `process/features/admin-simplify/completed/`.
Enter UPDATE PROCESS mode to capture learnings and update context.
