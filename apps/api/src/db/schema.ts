import {
  pgTable,
  pgEnum,
  bigserial,
  bigint,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  date,
  jsonb,
  numeric,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "team",
  "client",
]);

export const projectStatusEnum = pgEnum("project_status", [
  "discovery",
  "architecture",
  "development",
  "testing",
  "shipped",
]);

export const deliverableStatusEnum = pgEnum("deliverable_status", [
  "todo",
  "ongoing",
  "review",
  "finished",
]);


export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "qualified",
  "proposal_sent",
  "closed_won",
  "closed_lost",
]);

export const proposalStatusEnum = pgEnum("proposal_status", [
  "sent",
  "opened",
  "replied",
  "signed",
]);

export const proposalMethodEnum = pgEnum("proposal_method", ["template", "ai"]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "unpaid",
  "paid",
  "overdue",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "progress_update",
  "invoice_issued",
  "deliverable_completed",
  "project_status_change",
  "custom",
]);

export const permissionRoleEnum = pgEnum("permission_role", [
  "admin",
  "developer",
  "designer",
  "manager",
]);

export const permissionLevelEnum = pgEnum("permission_level", [
  "read",
  "write",
  "admin",
]);

export const assetTypeEnum = pgEnum("asset_type", [
  "progress_photo",
  "completion_photo",
  "document",
]);

export const libraryItemTypeEnum = pgEnum("library_item_type", [
  "website",
  "prompt",
  "module",
  "asset",
  "doc",
]);

// ─── Auth ─────────────────────────────────────────────

export const user = pgTable("user", {
  userId: bigserial("user_id", { mode: "number" }).primaryKey(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  passwordHash: varchar("password_hash", { length: 255 }),
  role: userRoleEnum("role").notNull().default("client"),
  isActive: boolean("is_active").notNull().default(true),
  /** Migration 026. True for the single owner account (admin@advo.ph). Phase 8 money visibility reads this. */
  isOwner: boolean("is_owner").notNull().default(false),
  magicToken: varchar("magic_token", { length: 255 }),
  magicTokenExpiresAt: timestamp("magic_token_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    sessionId: bigserial("session_id", { mode: "number" }).primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => user.userId, { onDelete: "cascade" }),
    refreshToken: varchar("refresh_token", { length: 255 }).unique().notNull(),
    userAgent: text("user_agent"),
    ipAddress: varchar("ip_address", { length: 45 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** One login lineage; every rotation of the same login shares it. Migration 022. */
    familyId: varchar("family_id", { length: 64 }).notNull(),
    /** NULL means live. Set when superseded, which is what makes the grace window possible. */
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    /** Non-rotating per-browser credential behind one-tap login. Survives logout. */
    isDeviceKey: boolean("is_device_key").notNull().default(false),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_session_user").on(t.userId),
    index("idx_session_family").on(t.familyId),
  ]
);

// ─── Core Business ────────────────────────────────────

export const client = pgTable(
  "client",
  {
    clientId: bigserial("client_id", { mode: "number" }).primaryKey(),
    userId: integer("user_id").references(() => user.userId, { onDelete: "set null" }),
    companyName: varchar("company_name", { length: 255 }).notNull(),
    contactEmail: varchar("contact_email", { length: 255 }),
    githubOrgName: varchar("github_org_name", { length: 100 }),
    brandColorHex: varchar("brand_color_hex", { length: 7 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_client_user").on(t.userId),
  ]
);

export const project = pgTable(
  "project",
  {
    projectId: bigserial("project_id", { mode: "number" }).primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => client.clientId, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    repositoryName: varchar("repository_name", { length: 100 }),
    previewUrl: varchar("preview_url", { length: 500 }),
    contractUrl: varchar("contract_url", { length: 500 }),
    projectStatus: projectStatusEnum("project_status").notNull().default("discovery"),
    totalValueCents: integer("total_value_cents").notNull().default(0),
    amountPaidCents: integer("amount_paid_cents").notNull().default(0),
    /** The price before any discount; null when there was none. list − discount = total (migration 028). */
    listValueCents: integer("list_value_cents"),
    discountCents: integer("discount_cents").notNull().default(0),
    discountReason: varchar("discount_reason", { length: 120 }),
    techStack: text("tech_stack").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_project_client").on(t.clientId),
  ]
);

export const progressUpdate = pgTable(
  "progress_update",
  {
    progressUpdateId: bigserial("progress_update_id", { mode: "number" }).primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => project.projectId, { onDelete: "cascade" }),
    updateTitle: varchar("update_title", { length: 255 }).notNull(),
    updateBody: text("update_body"),
    commitShaReference: varchar("commit_sha_reference", { length: 40 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_progress_project").on(t.projectId),
  ]
);

export const teamMember = pgTable(
  "team_member",
  {
    teamMemberId: bigserial("team_member_id", { mode: "number" }).primaryKey(),
    userId: integer("user_id").references(() => user.userId, { onDelete: "set null" }),
    name: varchar("name", { length: 255 }).notNull(),
    role: varchar("role", { length: 100 }).notNull(),
    email: varchar("email", { length: 255 }),
    avatarUrl: varchar("avatar_url", { length: 500 }),
    previewImageUrl: varchar("preview_image_url", { length: 500 }),
    bio: text("bio"),
    linkedinUrl: varchar("linkedin_url", { length: 500 }),
    githubUrl: varchar("github_url", { length: 500 }),
    permissionRole: permissionRoleEnum("permission_role").notNull().default("developer"),
    isActive: boolean("is_active").notNull().default(true),
    /** Manual tally; auto-accrual deferred (rules open). Admin PATCH only. */
    penaltyPointCount: integer("penalty_point_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_team_user").on(t.userId),
  ]
);

// ─── Project Role Assignments (migration 025) ────────────────────────────────
//
// Tracks which team member holds which named job role on which project.
// This is the source of truth for Commission (Phase 8) and the per-project
// people list in ProjectCommandCenter.
//
// The five allowed role values are app-validated varchar (not a DB enum) so the
// list can grow without a migration:
//   referral | project_manager | lead_developer | assistant_developer | creatives_developer
//
// Partial unique indexes live in 025_project_role_assignment.sql:
//   • (project_id, team_member_id, project_role) — same role twice on one project rejected.
//   • (project_id) WHERE project_role = 'referral' — exactly one referral per project.

export const projectRoleAssignment = pgTable(
  "project_role_assignment",
  {
    projectRoleAssignmentId: bigserial("project_role_assignment_id", { mode: "number" }).primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => project.projectId, { onDelete: "cascade" }),
    teamMemberId: integer("team_member_id")
      .notNull()
      .references(() => teamMember.teamMemberId, { onDelete: "restrict" }),
    /** app-validated: referral | project_manager | lead_developer | assistant_developer | creatives_developer */
    projectRole: varchar("project_role", { length: 40 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer("created_by").references(() => user.userId, { onDelete: "set null" }),
  },
  (t) => [
    index("idx_project_role_assignment_project").on(t.projectId),
    index("idx_project_role_assignment_member").on(t.teamMemberId),
    // The partial unique indexes (one role per person per project; one referral per project)
    // live in 025_project_role_assignment.sql — drizzle cannot express the WHERE predicate here.
  ],
);

export const projectAccess = pgTable(
  "project_access",
  {
    projectAccessId: bigserial("project_access_id", { mode: "number" }).primaryKey(),
    teamMemberId: integer("team_member_id")
      .notNull()
      .references(() => teamMember.teamMemberId, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => project.projectId, { onDelete: "cascade" }),
    permissionLevel: permissionLevelEnum("permission_level").notNull().default("read"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_access_unique").on(t.teamMemberId, t.projectId),
  ]
);

export const deliverable = pgTable(
  "deliverable",
  {
    deliverableId: bigserial("deliverable_id", { mode: "number" }).primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => project.projectId, { onDelete: "cascade" }),
    assignedTo: integer("assigned_to").references(() => teamMember.teamMemberId, { onDelete: "set null" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    priority: integer("priority").default(0),
    status: deliverableStatusEnum("status").notNull().default("todo"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Team QA sign-off; independent of status/completed_at. Null = unverified. */
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    /** Optional PDF/file attachment URL for the deliverable (migration 036). */
    attachmentUrl: varchar("attachment_url", { length: 500 }),
    /** When the assignee last read the comment thread (migration 036). Null = never read. */
    commentsReadAt: timestamp("comments_read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_deliverable_project").on(t.projectId),
    index("idx_deliverable_assigned").on(t.assignedTo),
  ]
);

// ─── Deliverable comments (migration 036) ────────────────────────────────────
//
// An owner can send a deliverable in "review" back to "ongoing" with a comment
// explaining what needs to change. The assignee reads it via GET /:id/comments.
// comments_read_at on the deliverable row tracks when the assignee last read the
// thread, enabling the hasUnreadComments flag on list endpoints.

export const deliverableComment = pgTable(
  "deliverable_comment",
  {
    commentId: bigserial("comment_id", { mode: "number" }).primaryKey(),
    deliverableId: integer("deliverable_id")
      .notNull()
      .references(() => deliverable.deliverableId, { onDelete: "cascade" }),
    /** Null when the author account has been deleted. */
    authorUserId: integer("author_user_id").references(() => user.userId, { onDelete: "set null" }),
    /** Snapshot of the author's display name at write time; survives user deletion. */
    authorName: varchar("author_name", { length: 255 }).notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_deliverable_comment_deliverable").on(t.deliverableId),
  ]
);


export const invoice = pgTable(
  "invoice",
  {
    invoiceId: bigserial("invoice_id", { mode: "number" }).primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => project.projectId, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    status: invoiceStatusEnum("status").notNull().default("unpaid"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    notes: text("notes"),
    /**
     * Migration 017. Null = an ordinary one-shot milestone invoice, exactly as before.
     * Non-null = generated by a recurringFee. Recurring rows are excluded from project
     * contract-value / collection aggregates — the contract states the Total Fee "does
     * not cover the ongoing costs".
     */
    recurringFeeId: integer("recurring_fee_id").references(() => recurringFee.recurringFeeId, {
      onDelete: "set null",
    }),
    /** The billing period this row settles. Null for one-shot invoices. */
    periodStartOn: date("period_start_on"),
    /**
     * Migration 022. WHICH collection attempt settled this invoice. Null means paid
     * out-of-band (or not paid) — both stay valid, because `status` remains the single
     * source of truth and this column only records HOW.
     *
     * Declared without a drizzle `.references()` on purpose: invoice ⇄ payment_intent is
     * a reference cycle, and drizzle cannot order the two table literals to express it.
     * The real FK (ON DELETE SET NULL) is in 022_payment.sql, where it belongs.
     */
    settledPaymentIntentId: integer("settled_payment_intent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_invoice_project").on(t.projectId),
    // The partial indexes on recurring_fee_id (unique double-bill guard +
    // lookup) live in 017_recurring_fee.sql — drizzle cannot express the
    // WHERE recurring_fee_id IS NOT NULL predicate here.
  ]
);

export const calendarEvent = pgTable(
  "calendar_event",
  {
    calendarEventId: bigserial("calendar_event_id", { mode: "number" }).primaryKey(),
    projectId: integer("project_id").references(() => project.projectId, { onDelete: "set null" }),
    title: varchar("title", { length: 255 }).notNull(),
    category: varchar("category", { length: 50 }).notNull().default("event"),
    description: text("description"),
    location: varchar("location", { length: 255 }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    isAllDay: boolean("is_all_day").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_calendar_event_starts").on(t.startsAt),
    index("idx_calendar_event_project").on(t.projectId),
  ]
);

// Expense ledger (migration 005, updated by 032).
// amount_cents is integer cents.
// receipt_url removed in migration 032 — is_reimbursable (derived as receipt_url IS NOT NULL)
// no longer exists. expense_paid_status ('paid' | 'unpaid') replaces it.
// expense_type ('development_expenses' | 'general_expenses') classifies each expense.
// category is kept for backward compat but is no longer shown in the Phase 8 UI.
export const expense = pgTable(
  "expense",
  {
    expenseId: bigserial("expense_id", { mode: "number" }).primaryKey(),
    projectId: integer("project_id").references(() => project.projectId, { onDelete: "set null" }),
    teamMemberId: integer("team_member_id").references(() => teamMember.teamMemberId, { onDelete: "set null" }),
    purpose: text("purpose").notNull(),
    authorizedBy: varchar("authorized_by", { length: 255 }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    location: varchar("location", { length: 255 }),
    /** migration 032: 'development_expenses' | 'general_expenses' */
    expenseType: varchar("expense_type", { length: 40 }).notNull().default("general_expenses"),
    /** migration 032: 'paid' | 'unpaid' */
    expensePaidStatus: varchar("expense_paid_status", { length: 20 }).notNull().default("unpaid"),
    category: varchar("category", { length: 50 }).notNull().default("other"),
    createdBy: integer("created_by").references(() => user.userId, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_expense_project").on(t.projectId),
    index("idx_expense_created_by").on(t.createdBy),
    index("idx_expense_created_at").on(t.createdAt),
  ]
);

// Contracts / MOAs / SOWs / NDAs / retainers (migration 004). `contractType`
// and `status` are app-validated varchar (growable sets). signed_at/expires_at
// derive into GET /api/calendar at read time, not stored in calendar_event.
export const contract = pgTable(
  "contract",
  {
    contractId: bigserial("contract_id", { mode: "number" }).primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => client.clientId, { onDelete: "cascade" }),
    projectId: integer("project_id").references(() => project.projectId, { onDelete: "set null" }),
    title: varchar("title", { length: 255 }).notNull(),
    contractType: varchar("contract_type", { length: 50 }).notNull().default("contract"),
    status: varchar("status", { length: 50 }).notNull().default("draft"),
    valueCents: integer("value_cents").notNull().default(0),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    documentUrl: varchar("document_url", { length: 500 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_contract_client").on(t.clientId),
    index("idx_contract_project").on(t.projectId),
    index("idx_contract_expires").on(t.expiresAt),
  ]
);

// Contract files (migration 027). Uploaded PDF/Word files per project for AI review.
// status is app-validated varchar: draft | final | signed.
// ai_review_text is NULL until a review is run; ai_reviewed_at mirrors it (constrained together).
export const contractFile = pgTable(
  "contract_file",
  {
    contractFileId: bigserial("contract_file_id", { mode: "number" }).primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => project.projectId, { onDelete: "cascade" }),
    fileUrl: text("file_url").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    aiReviewText: text("ai_review_text"),
    aiReviewedAt: timestamp("ai_reviewed_at", { withTimezone: true }),
    createdBy: integer("created_by").references(() => user.userId, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_contract_file_project").on(t.projectId),
    index("idx_contract_file_created_at").on(t.createdAt),
  ]
);

// Change orders (migration 009). Client files scope + reason from /hub
// (CONTRACTS.md policy 3). status is app-validated varchar (growable set).
export const changeOrder = pgTable(
  "change_order",
  {
    changeOrderId: bigserial("change_order_id", { mode: "number" }).primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => project.projectId, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    reason: text("reason").notNull(),
    status: varchar("status", { length: 50 }).notNull().default("filed"),
    priceCents: integer("price_cents"),
    timelineNote: text("timeline_note"),
    createdBy: integer("created_by").references(() => user.userId, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_change_order_project").on(t.projectId),
    index("idx_change_order_created_by").on(t.createdBy),
    index("idx_change_order_created_at").on(t.createdAt),
  ]
);

// Meeting MoM records (migration 006 + 012 + 034). Full transcript per project;
// optional Plaud file id / share key / AI summary. project_id nullable since
// migration 034 (scheduled meetings may have no project). starts_at / ends_at
// added for calendar scheduling; recorded_at retains its original Plaud meaning.
export const meeting = pgTable(
  "meeting",
  {
    meetingId: bigserial("meeting_id", { mode: "number" }).primaryKey(),
    // Nullable since migration 034 — scheduled meetings need no project.
    projectId: integer("project_id")
      .references(() => project.projectId, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    // Empty string (not NULL) for scheduled meetings with no transcript yet.
    transcript: text("transcript").notNull().default(""),
    summary: text("summary"),
    plaudFileId: varchar("plaud_file_id", { length: 64 }),
    plaudShareKey: varchar("plaud_share_key", { length: 500 }),
    isVisibleClient: boolean("is_visible_client").notNull().default(false),
    createdBy: integer("created_by").references(() => user.userId, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Scheduling fields (migration 034).
    // starts_at = scheduled start; NULL for past/Plaud-imported records.
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    location: varchar("location", { length: 255 }),
    description: text("description"),
  },
  (t) => [
    index("idx_meeting_project").on(t.projectId),
    index("idx_meeting_recorded_at").on(t.recordedAt),
    index("idx_meeting_created_by").on(t.createdBy),
    uniqueIndex("idx_meeting_plaud_file").on(t.plaudFileId),
    index("idx_meeting_starts_at").on(t.startsAt),
  ]
);

// Self-serve attendance (migration 034). Composite PK prevents duplicate joins.
export const meetingAttendee = pgTable(
  "meeting_attendee",
  {
    meetingId: bigint("meeting_id", { mode: "number" }).notNull()
      .references(() => meeting.meetingId, { onDelete: "cascade" }),
    userId: integer("user_id").notNull()
      .references(() => user.userId, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.meetingId, t.userId] }),
    index("idx_meeting_attendee_user").on(t.userId),
  ]
);

export const lead = pgTable(
  "lead",
  {
    leadId: bigserial("lead_id", { mode: "number" }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    company: varchar("company", { length: 255 }),
    projectType: varchar("project_type", { length: 100 }),
    budget: varchar("budget", { length: 100 }),
    description: text("description"),
    status: leadStatusEnum("status").notNull().default("new"),
    assignedTo: integer("assigned_to").references(() => teamMember.teamMemberId, { onDelete: "set null" }),
    notes: text("notes"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_lead_assigned_to").on(t.assignedTo),
  ]
);

export const notification = pgTable(
  "notification",
  {
    notificationId: bigserial("notification_id", { mode: "number" }).primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => client.clientId, { onDelete: "cascade" }),
    projectId: integer("project_id").references(() => project.projectId, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull().default("custom"),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body"),
    isRead: boolean("is_read").notNull().default(false),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_notification_client").on(t.clientId),
    index("idx_notification_project_id").on(t.projectId),
  ]
);

export const projectAsset = pgTable(
  "project_asset",
  {
    projectAssetId: bigserial("project_asset_id", { mode: "number" }).primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => project.projectId, { onDelete: "cascade" }),
    assetType: assetTypeEnum("asset_type").notNull().default("progress_photo"),
    url: varchar("url", { length: 500 }).notNull(),
    caption: varchar("caption", { length: 255 }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_asset_project").on(t.projectId),
  ]
);

// ─── Content / CMS ───────────────────────────────────

export const siteContent = pgTable("site_content", {
  sectionId: varchar("section_id", { length: 100 }).primaryKey(),
  label: varchar("label", { length: 255 }),
  visiblePublic: boolean("visible_public").notNull().default(true),
  visibleClientPortal: boolean("visible_client_portal").notNull().default(true),
  content: jsonb("content"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const portfolioProject = pgTable(
  "portfolio_project",
  {
    portfolioProjectId: bigserial("portfolio_project_id", { mode: "number" }).primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    previewUrl: varchar("preview_url", { length: 500 }),
    imageUrl: varchar("image_url", { length: 500 }),
    imageUrls: text("image_urls").array(),
    techStack: text("tech_stack").array(),
    slug: varchar("slug", { length: 100 }).unique(),
    isFeatured: boolean("is_featured").notNull().default(false),
    displayOrder: integer("display_order").default(0),
    caseStudy: jsonb("case_study"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_portfolio_featured").on(t.isFeatured),
  ]
);

export const socialPost = pgTable("social_post", {
  socialPostId: bigserial("social_post_id", { mode: "number" }).primaryKey(),
  platform: varchar("platform", { length: 50 }),
  content: text("content"),
  imageUrl: varchar("image_url", { length: 500 }),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  isPublished: boolean("is_published").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── New Tables ───────────────────────────────────────

export const siteConfig = pgTable("site_config", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: jsonb("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const githubEvent = pgTable(
  "github_event",
  {
    eventId: bigserial("event_id", { mode: "number" }).primaryKey(),
    projectId: integer("project_id").references(() => project.projectId, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    payload: jsonb("payload").notNull(),
    repoName: varchar("repo_name", { length: 100 }).notNull(),
    branch: varchar("branch", { length: 100 }),
    commitSha: varchar("commit_sha", { length: 40 }),
    author: varchar("author", { length: 100 }),
    message: text("message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_github_project").on(t.projectId),
    index("idx_github_repo").on(t.repoName),
  ]
);

export const activityLog = pgTable(
  "activity_log",
  {
    activityId: bigserial("activity_id", { mode: "number" }).primaryKey(),
    userId: integer("user_id").references(() => user.userId, { onDelete: "set null" }),
    action: varchar("action", { length: 50 }).notNull(),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: integer("entity_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_activity_entity").on(t.entityType, t.entityId),
    index("idx_activity_user").on(t.userId),
  ]
);

// ─── Team Availability ──────────────────────────────

export const availabilityBlock = pgTable(
  "availability_block",
  {
    blockId: bigserial("block_id", { mode: "number" }).primaryKey(),
    teamMemberId: integer("team_member_id")
      .notNull()
      .references(() => teamMember.teamMemberId, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday, 6=Saturday
    // varchar(5) "HH:MM", not TIME — verified against the live column with \d, and the
    // reason for the defensive .slice(0, 5) calls that used to be dotted through the UI.
    // An end_time of "00:00" means midnight at the END of the day; see
    // ../utils/manila-date.ts. Both columns are constrained by migration 024.
    startTime: varchar("start_time", { length: 5 }).notNull(),
    endTime: varchar("end_time", { length: 5 }).notNull(),
    blockType: varchar("block_type", { length: 20 }).notNull().default("work"), // school|break|work|unavailable
    label: varchar("label", { length: 100 }),
    // Bounds on the recurrence (migration 024). NULL from = unbounded backwards, NULL to
    // = open-ended. Without these a "Tuesdays 10:00" class projects onto every Tuesday in
    // recorded time, forwards and backwards. Manila dates.
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_availability_member").on(t.teamMemberId),
    index("idx_availability_day").on(t.dayOfWeek),
    index("idx_availability_effective").on(t.effectiveTo),
  ]
);

// ─── Scrape Results Cache ────────────────────────────

export const scrapeResult = pgTable(
  "scrape_result",
  {
    scrapeResultId: bigserial("scrape_result_id", { mode: "number" }).primaryKey(),
    url: varchar("url", { length: 2000 }).notNull(),
    type: varchar("type", { length: 50 }).notNull(), // "brand" | "facebook"
    data: jsonb("data").notNull(),
    scrapedBy: integer("scraped_by").references(() => user.userId, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_scrape_url").on(t.url),
    index("idx_scrape_type").on(t.type),
    index("idx_scrape_result_scraped_by").on(t.scrapedBy),
  ]
);

// ─── Proposal pipeline ────────────────────────────────

export const proposal = pgTable(
  "proposal",
  {
    proposalId: bigserial("proposal_id", { mode: "number" }).primaryKey(),
    leadId: integer("lead_id")
      .notNull()
      .references(() => lead.leadId, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    bodyHtml: text("body_html").notNull(),
    status: proposalStatusEnum("status").notNull().default("sent"),
    valueCents: integer("value_cents").notNull().default(0),
    clause: jsonb("clause"),
    method: proposalMethodEnum("method").notNull().default("template"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_proposal_lead").on(t.leadId),
    index("idx_proposal_status").on(t.status),
    index("idx_proposal_created").on(t.createdAt),
  ],
);

// ─── Internal Library ────────────────────────────────

export const libraryItem = pgTable(
  "library_item",
  {
    libraryItemId: bigserial("library_item_id", { mode: "number" }).primaryKey(),
    itemType: libraryItemTypeEnum("item_type").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    url: text("url"),
    body: text("body"),
    thumbnailUrl: text("thumbnail_url"),
    tag: text("tag").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_library_item_type").on(t.itemType)],
);

// ─── Email campaign (mass send) ──────────────────────

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "sending",
  "paused",
  "sent",
  "failed",
]);

export const campaignRecipientStatusEnum = pgEnum("campaign_recipient_status", [
  "queued",
  "sent",
  "failed",
  "bounced",
  "unsubscribed",
  "complained",
  "suppressed",
]);

export const suppressionReasonEnum = pgEnum("suppression_reason", [
  "unsubscribe",
  "hard_bounce",
  "complaint",
  "soft_bounce_limit",
  "manual",
]);

export const campaign = pgTable(
  "campaign",
  {
    campaignId: bigserial("campaign_id", { mode: "number" }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    bodyHtml: text("body_html").notNull(),
    segment: jsonb("segment").notNull().default({}),
    status: campaignStatusEnum("status").notNull().default("draft"),
    ratePerHour: integer("rate_per_hour").notNull().default(60),
    recipientCount: integer("recipient_count").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_campaign_status").on(t.status)],
);

export const campaignRecipient = pgTable(
  "campaign_recipient",
  {
    campaignRecipientId: bigserial("campaign_recipient_id", { mode: "number" }).primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaign.campaignId, { onDelete: "cascade" }),
    leadId: integer("lead_id")
      .notNull()
      .references(() => lead.leadId, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    status: campaignRecipientStatusEnum("status").notNull().default("queued"),
    unsubscribeToken: varchar("unsubscribe_token", { length: 64 }).notNull(),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The double-send guard: one lead at most once per campaign, enforced by the DB.
    uniqueIndex("idx_campaign_recipient_unique").on(t.campaignId, t.leadId),
    uniqueIndex("idx_campaign_recipient_token").on(t.unsubscribeToken),
    index("idx_campaign_recipient_campaign_status").on(t.campaignId, t.status),
  ],
);

export const emailSuppression = pgTable(
  "email_suppression",
  {
    emailSuppressionId: bigserial("email_suppression_id", { mode: "number" }).primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    reason: suppressionReasonEnum("reason").notNull(),
    campaignId: integer("campaign_id").references(() => campaign.campaignId, {
      onDelete: "set null",
    }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("idx_email_suppression_email").on(t.email)],
);

// ─── Soft-bounce counter (migration 020) ─────────────
//
// Keyed on the ADDRESS, deliberately, not on campaign_recipient. A per-recipient counter
// resets at every campaign boundary, so the address that soft-bounces twice per campaign
// forever would never cross a threshold — and that is precisely the address that has to.
//
// The count is CUMULATIVE, never reset. Nothing in this repo receives a delivery event
// (status = "sent" means handed to the transport, not delivered), so a consecutive-failure
// counter cannot be implemented honestly yet. Cumulative errs toward suppressing sooner.
//
// The threshold lives in campaign.service.ts as SOFT_BOUNCE_LIMIT, not in a column: no
// already-written suppression changes meaning when the policy is retuned.

export const emailSoftBounce = pgTable(
  "email_soft_bounce",
  {
    emailSoftBounceId: bigserial("email_soft_bounce_id", { mode: "number" }).primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    softBounceCount: integer("soft_bounce_count").notNull().default(0),
    lastSoftBounceAt: timestamp("last_soft_bounce_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("idx_email_soft_bounce_email").on(t.email)],
);

// ─── Project sign-off (migration 016) ────────────────
//
// The CLIENT-FACING final-delivery document. NOT deliverable.verifiedAt, which is
// internal team QA (migration 007) and must never be rendered as a client signature.
// `status` and `signedMethod` are app-validated varchar (change_order / contract
// precedent), not DB enums. Every clock — payment due, revision window — is DERIVED
// from signedAt at read time and never stored.

export const projectSignoff = pgTable(
  "project_signoff",
  {
    projectSignoffId: bigserial("project_signoff_id", { mode: "number" }).primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => project.projectId, { onDelete: "cascade" }),
    contractId: integer("contract_id").references(() => contract.contractId, {
      onDelete: "set null",
    }),
    /** The final-payment invoice minted AT SIGN TIME. Null until signed. */
    invoiceId: integer("invoice_id").references(() => invoice.invoiceId, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 255 }).notNull(),
    scopeSummary: text("scope_summary").notNull(),
    status: varchar("status", { length: 50 }).notNull().default("draft"),
    /** Integer CENTS. FourlinQ Tier 1 final = 2250000, Tier 2 = 3500000. */
    finalPaymentCents: integer("final_payment_cents").notNull().default(0),
    paymentDueDayCount: integer("payment_due_day_count").notNull().default(7),
    revisionWindowMonthCount: integer("revision_window_month_count").notNull().default(6),
    /** The ALLOWANCE only. used/remaining are counted from signoffRevision. */
    freeRevisionTotalCount: integer("free_revision_total_count").notNull().default(5),

    /** Business days to respond to a review delivery before a Notice may issue (Policy 3 step 1). */
    feedbackWindowBusinessDayCount: integer("feedback_window_business_day_count")
      .notNull()
      .default(15),
    /** Business days after the Notice before deemed approval may be recorded (Policy 3 step 3). */
    noticeWindowBusinessDayCount: integer("notice_window_business_day_count").notNull().default(15),
    deliverableSnapshot: jsonb("deliverable_snapshot").notNull().default([]),
    documentUrl: varchar("document_url", { length: 500 }),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    /** THE stamp. Null = unsigned. */
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signedBy: integer("signed_by").references(() => user.userId, { onDelete: "set null" }),
    signedName: varchar("signed_name", { length: 255 }),
    signedMethod: varchar("signed_method", { length: 20 }).notNull().default("client"),
    signedIp: varchar("signed_ip", { length: 45 }),
    signedUserAgent: text("signed_user_agent"),
    /** Internal team note. Never returned on the client-facing path. */
    note: text("note"),
    createdBy: integer("created_by").references(() => user.userId, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_project_signoff_project").on(t.projectId),
    index("idx_project_signoff_contract").on(t.contractId),
    index("idx_project_signoff_invoice").on(t.invoiceId),
    index("idx_project_signoff_status").on(t.status),
    index("idx_project_signoff_signed_at").on(t.signedAt),
    // Partial unique indexes (WHERE status = 'issued' / status <> 'void') live in
    // 016_project_signoff.sql — drizzle-orm cannot express the predicate here.
  ],
);

export const signoffRevision = pgTable(
  "signoff_revision",
  {
    signoffRevisionId: bigserial("signoff_revision_id", { mode: "number" }).primaryKey(),
    projectSignoffId: integer("project_signoff_id")
      .notNull()
      .references(() => projectSignoff.projectSignoffId, { onDelete: "cascade" }),
    deliverableId: integer("deliverable_id").references(() => deliverable.deliverableId, {
      onDelete: "set null",
    }),
    roundNumber: integer("round_number").notNull(),
    note: text("note").notNull(),
    /** True when invoked inside the 6-month post-signature window. */
    isPostSignoff: boolean("is_post_signoff").notNull().default(false),
    /** Date the review went to the client. Starts the feedback clock; NULL means no clock runs. */
    reviewDeliveredOn: date("review_delivered_on"),
    /** First client response. Stops both clocks — a answered round can never be deemed approved. */
    clientRespondedAt: timestamp("client_responded_at", { withTimezone: true }),
    /** When the formal Notice of Pending Deemed Approval issued. Without it, the mechanism is forfeit. */
    noticeIssuedAt: timestamp("notice_issued_at", { withTimezone: true }),
    /** Where the notice can be produced from. Required whenever noticeIssuedAt is set (DB CHECK). */
    noticeReference: text("notice_reference"),
    /** Recorded by a human, never by a job. See migration 021. */
    deemedApprovedAt: timestamp("deemed_approved_at", { withTimezone: true }),
    deemedApprovedBy: integer("deemed_approved_by").references(() => user.userId, {
      onDelete: "set null",
    }),
    requestedBy: integer("requested_by").references(() => user.userId, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The double-spend guard: one round number consumed at most once, DB-enforced.
    uniqueIndex("idx_signoff_revision_round").on(t.projectSignoffId, t.roundNumber),
    index("idx_signoff_revision_signoff").on(t.projectSignoffId),
    index("idx_signoff_revision_deliverable").on(t.deliverableId),
  ],
);

// ─── Recurring infrastructure fee (migration 017) ────────────
//
// The first recurring money in this repo. A per-project schedule that mints REAL
// `invoice` rows — there is no parallel billing table. FourlinQ: ₱3,000.00/month,
// billed on the 1st, 15-day grace before suspension becomes justified.
//
// Every billing anchor is `date`, never timestamptz: "the 1st" means the 1st in
// Asia/Manila, and a UTC instant would bill December on Nov 30 at 16:00.
//
// Suspension is DERIVED at read time from the generated invoices. `suspendedAt` is
// written only by an explicit human POST, and only when the derivation already says
// the remedy is justified. Nothing here auto-suspends anything.

export const recurringFeeStatusEnum = pgEnum("recurring_fee_status", [
  "active",
  "paused",
  "cancelled",
]);

export const recurringFee = pgTable(
  "recurring_fee",
  {
    recurringFeeId: bigserial("recurring_fee_id", { mode: "number" }).primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => project.projectId, { onDelete: "cascade" }),
    /** Copied verbatim into invoice.label, e.g. "Monthly Infrastructure Fee". */
    label: varchar("label", { length: 255 }).notNull(),
    /** Integer CENTS. FourlinQ = 300000 (₱3,000.00). The flat fee only — no penalty interest. */
    amountCents: integer("amount_cents").notNull(),
    /** App-validated growable set: monthly | quarterly | annual. */
    billingInterval: varchar("billing_interval", { length: 20 }).notNull().default("monthly"),
    /** Contract: billed on the 1st. CHECKed to 1..28 so no month silently skips. */
    billingDayOfMonth: integer("billing_day_of_month").notNull().default(1),
    /** Calendar days past due before suspension is justified (contract hosting clause: 15). */
    graceDayCount: integer("grace_day_count").notNull().default(15),
    status: recurringFeeStatusEnum("status").notNull().default("active"),
    startsOn: date("starts_on").notNull(),
    /** Null = open-ended. Set when the client transfers hosting away. */
    endsOn: date("ends_on"),
    /** The generator's idempotency anchor. Advanced forward only, never rewound. */
    nextRunOn: date("next_run_on").notNull(),
    lastGeneratedOn: date("last_generated_on"),
    /** Some clients are contractually exempt from the suspension remedy. */
    isSuspensionEnabled: boolean("is_suspension_enabled").notNull().default(true),
    /** Written ONLY by an explicit human POST /suspend. Justified != done. */
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_recurring_fee_project").on(t.projectId),
    // The partial index on (next_run_on) WHERE status = 'active' lives in
    // 017_recurring_fee.sql — drizzle cannot express the predicate here.
  ],
);

// ─── Commission split (migration 018) ────────────────────────
//
// The first model of how ADVO pays ITSELF. Every other money table points outward at a
// client; this one splits what lands: 60% developer / 25% staff / 15% company, per
// Prince 2026-06-19. The staff quarter sub-splits 28/24/24/24 across referral,
// marketing, accounting and management.
//
// Three things to hold onto when reading this block:
//
//   * Every percentage is BASIS POINTS (integer). 60% = 6000. Never a float.
//   * The percentages are COLUMNS ON THE PLAN, snapshotted per project. Code must read
//     the row, never a constant, or renegotiating the split retroactively rewrites what
//     an already-finalized plan promised.
//   * The 15% company reserve is a real share row with teamMemberId NULL — not a
//     leftover, not a derived remainder. That is what makes SUM(share.amountCents) =
//     plan.basisCents exact with no residue hiding anywhere.
//
// amountCents is NULL while the plan is draft: draft amounts are DERIVED on every read
// from basis + weights, and frozen into the column only at finalize.

export const commissionPlan = pgTable(
  "commission_plan",
  {
    commissionPlanId: bigserial("commission_plan_id", { mode: "number" }).primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => project.projectId, { onDelete: "cascade" }),
    /** Integer CENTS being split. Seeded from project.totalValueCents, then editable. */
    basisCents: integer("basis_cents").notNull().default(0),
    basisNote: text("basis_note"),
    /** Basis points. 5500 = 55%. CHECK-summed to 10000 with staff + company in 018. Updated by migration 030. */
    developerBps: integer("developer_bps").notNull().default(5500),
    staffBps: integer("staff_bps").notNull().default(3500),
    companyBps: integer("company_bps").notNull().default(1000),
    /** Basis points OF THE STAFF POOL. These four CHECK-sum to 10000. Updated by migration 030. */
    referralBps: integer("referral_bps").notNull().default(2000),
    marketingBps: integer("marketing_bps").notNull().default(5000),
    accountingBps: integer("accounting_bps").notNull().default(1000),
    managementBps: integer("management_bps").notNull().default(2000),
    /** App-validated growable set: draft | finalized | void. */
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    /** THE stamp. NULL = draft and fully editable. Non-NULL = frozen forever. */
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    finalizedBy: integer("finalized_by").references(() => user.userId, { onDelete: "set null" }),
    note: text("note"),
    createdBy: integer("created_by").references(() => user.userId, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_commission_plan_project").on(t.projectId),
    index("idx_commission_plan_status").on(t.status),
    // The partial unique index enforcing at most ONE live plan per project lives in
    // 018_commission_split.sql — drizzle cannot express the WHERE status <> 'void'.
  ],
);

export const commissionShare = pgTable(
  "commission_share",
  {
    commissionShareId: bigserial("commission_share_id", { mode: "number" }).primaryKey(),
    commissionPlanId: integer("commission_plan_id")
      .notNull()
      .references(() => commissionPlan.commissionPlanId, { onDelete: "cascade" }),
    /**
     * NULL for exactly one row per plan: the company reserve. RESTRICT rather than the
     * house CASCADE — deleting a team member must not erase a compensation record they
     * agreed to. Deactivate via teamMember.isActive instead.
     */
    teamMemberId: integer("team_member_id").references(() => teamMember.teamMemberId, {
      onDelete: "restrict",
    }),
    /**
     * main_developer | assistant_developer | creatives_developer |
     * lead_partnerships | referral (historical) | marketing | accounting | management | company
     */
    role: varchar("role", { length: 30 }).notNull(),
    /** Relative weight WITHIN this role's pool. 60/40 and 6000/4000 allocate identically. */
    contributionBps: integer("contribution_bps").notNull().default(0),
    /** "mutually agreed on by the devs upon project completion" — finalize refuses without it. */
    isAgreed: boolean("is_agreed").notNull().default(false),
    agreedAt: timestamp("agreed_at", { withTimezone: true }),
    /** Integer CENTS. NULL while draft (derived on read); written once at finalize. */
    amountCents: integer("amount_cents"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_commission_share_plan").on(t.commissionPlanId),
    index("idx_commission_share_member").on(t.teamMemberId),
    // The three partial unique indexes — one main developer, one assistant developer and
    // one company reserve per plan — live in 018_commission_split.sql.
  ],
);

// ─── Project tier assignment (migration 033) ─────────────────────────────────
//
// Stores the tier pick for assistant_developer and creatives_developer share rows.
// The tier label is stored verbatim so it can be displayed later without re-deriving.
// ONE tier pick per commission_share_id (UNIQUE index in 033).
//
// allocation_bps: derived from tier — 500 (5%), 1000 (10%), 1500 (15%).

export const projectTierAssignment = pgTable(
  "project_tier_assignment",
  {
    tierAssignmentId: bigserial("tier_assignment_id", { mode: "number" }).primaryKey(),
    commissionShareId: integer("commission_share_id")
      .notNull()
      .references(() => commissionShare.commissionShareId, { onDelete: "cascade" }),
    /** Verbatim tier label — one of the three fixed strings. */
    tierLabel: varchar("tier_label", { length: 500 }).notNull(),
    /** Derived from tier: 500 = Tier 1 (5%), 1000 = Tier 2 (10%), 1500 = Tier 3 (15%). */
    allocationBps: integer("allocation_bps").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_tier_assignment_share").on(t.commissionShareId),
  ],
);

// ─── Background job queue (migration 028) ────────────
//
// Persistent queue for long-running server-side work. The in-process runner
// (job-runner.service.ts) polls this table every 2 seconds. Crash recovery
// at boot re-queues any row stuck in 'running' from the previous process.
// The widget in the browser polls GET /api/jobs/active every 2 seconds.
//
// Steps jsonb shape: [{ label: string, status: 'pending' | 'running' | 'done' | 'failed' }]
// Result jsonb shape: job-type specific payload (e.g. { signoffId: number })

export const backgroundJob = pgTable(
  "background_job",
  {
    jobId: bigserial("job_id", { mode: "number" }).primaryKey(),
    jobType: varchar("job_type", { length: 60 }).notNull(),
    projectId: integer("project_id").references(() => project.projectId, { onDelete: "set null" }),
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    title: text("title").notNull(),
    steps: jsonb("steps").notNull().default([]),
    result: jsonb("result"),
    error: text("error"),
    createdBy: integer("created_by").references(() => user.userId, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_background_job_status").on(t.status),
    index("idx_background_job_created_by_status").on(t.createdBy, t.status),
  ],
);

// ─── Meeting recording (migration 029) ───────────────
//
// Uploaded audio files (mp3 / m4a) for a meeting. transcript is NULL until a
// background Whisper transcription job completes. job_id links the last job
// that was started for this recording.

export const meetingRecording = pgTable(
  "meeting_recording",
  {
    recordingId: bigserial("recording_id", { mode: "number" }).primaryKey(),
    meetingId: integer("meeting_id").references(() => meeting.meetingId, { onDelete: "cascade" }),
    fileUrl: text("file_url").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    transcript: text("transcript"),
    jobId: integer("job_id").references(() => backgroundJob.jobId, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_meeting_recording_meeting").on(t.meetingId),
    index("idx_meeting_recording_job").on(t.jobId),
  ],
);

// ─── Invoice file (migration 031) ────────────────────
//
// Upload-first invoice PDFs per project.  The existing `invoice` table is kept intact for
// backward compatibility.  New UI uses `invoice_file` exclusively.
//
// total_cents is NULL when pdf-parse cannot find a currency amount in the document; the UI
// renders "—" in that case rather than ₱0.
//
// recurring_fee_id is set for uploaded recurring invoice PDFs (State B of RecurringInvoicesPanel).

export const invoiceFile = pgTable(
  "invoice_file",
  {
    invoiceFileId: bigserial("invoice_file_id", { mode: "number" }).primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => project.projectId, { onDelete: "cascade" }),
    recurringFeeId: integer("recurring_fee_id").references(
      () => recurringFee.recurringFeeId,
      { onDelete: "set null" },
    ),
    fileUrl: text("file_url").notNull(),
    /** Standard name: "Invoice 001 - Sep 2026". Written on upload, editable after. */
    fileName: text("file_name").notNull(),
    /** Sequential per project, starting at 0.  Unique index enforced by 031. */
    fileNumber: integer("file_number").notNull(),
    /** "Sep 2026" — derived from upload date, displayed in UI. */
    billingMonth: varchar("billing_month", { length: 20 }),
    /** Extracted from PDF via pdf-parse.  NULL when extraction fails. */
    totalCents: integer("total_cents"),
    /** downpayment | full */
    phaseStatus: varchar("phase_status", { length: 30 }).notNull().default("downpayment"),
    /** unpaid | paid | overdue */
    paidStatus: varchar("paid_status", { length: 20 }).notNull().default("unpaid"),
    createdBy: integer("created_by").references(() => user.userId, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_invoice_file_project_number").on(t.projectId, t.fileNumber),
    index("idx_invoice_file_project").on(t.projectId),
  ],
);

/**
 * The schema ledger — one row per migration a database has applied (019_schema_ledger.sql).
 *
 * Mirrored here for one reason beyond convention: `db:push` drops what `schema.ts` does not
 * declare. A ledger absent from this file is a ledger the next push deletes, and the drift it
 * exists to catch would come straight back.
 *
 * Nothing in the API reads this table. It is written by migrations and read by
 * `scripts/migration-drift.mjs`; the app has no business editing its own deploy history.
 */
export const schemaMigration = pgTable(
  "schema_migration",
  {
    schemaMigrationId: bigserial("schema_migration_id", { mode: "number" }).primaryKey(),
    /** Exactly as the file is named in apps/api/migrations, e.g. `005_expense.sql`. */
    filename: varchar("filename", { length: 255 }).notNull(),
    /**
     * On a backfilled row this is when the ledger was created, NOT when the migration ran —
     * that timestamp predates the ledger and inventing one would be a lie. Read it as
     * "known applied by".
     */
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
    /** True when the row was inferred from a sentinel object rather than written as it ran. */
    isBackfilled: boolean("is_backfilled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("idx_schema_migration_filename").on(t.filename)],
);

// ─── Payment rail (migration 022) ────────────────────────────
//
// The first way money can actually ARRIVE. Everything above models money that is OWED —
// invoice says how much, recurringFee how often, commissionPlan how it splits once it
// lands — and until 022 nothing said how it LANDS.
//
// Three things to hold onto when reading this block:
//
//   * `invoice` REMAINS the single source of truth for "is this paid". A paymentIntent
//     is an ATTEMPT to collect; settling it writes invoice.paidAt. Two tables that both
//     claim to know whether a client paid will disagree in production, about real money.
//   * `amountCents` on the intent is a SNAPSHOT, not a read-through. An admin editing
//     the invoice after a link is issued must not turn a ₱12,000 link into a ₱60,000
//     settlement.
//   * `paymentEvent` is APPEND-ONLY and records callbacks that FAILED verification too.
//     An unsigned callback is evidence of an attack; a table that drops it hides one.

export const paymentIntentStatusEnum = pgEnum("payment_intent_status", [
  "pending",
  "paid",
  "failed",
  "expired",
  "cancelled",
]);

export const paymentIntent = pgTable(
  "payment_intent",
  {
    paymentIntentId: bigserial("payment_intent_id", { mode: "number" }).primaryKey(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoice.invoiceId, { onDelete: "cascade" }),
    /** App-validated growable set: manual | paymongo | xendit. See PAYMENT_PROVIDER. */
    provider: varchar("provider", { length: 30 }).notNull(),
    /** The provider's own id (PayMongo link id, Xendit invoice id). Null for manual. */
    providerReference: varchar("provider_reference", { length: 255 }),
    /** Where the client actually pays. Null for manual — never a fabricated link. */
    checkoutUrl: text("checkout_url"),
    /** Integer CENTS, snapshotted at creation. ₱3,000.00 = 300000. Never a float. */
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("PHP"),
    status: paymentIntentStatusEnum("status").notNull().default("pending"),
    /** As REPORTED by the provider: gcash | maya | card | grab_pay | bank_transfer | … */
    method: varchar("method", { length: 30 }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_payment_intent_invoice").on(t.invoiceId),
    // The partial unique index on (provider, provider_reference) and the pending-only
    // index live in 022_payment.sql — drizzle cannot express the WHERE predicate here.
  ],
);

export const paymentEvent = pgTable(
  "payment_event",
  {
    paymentEventId: bigserial("payment_event_id", { mode: "number" }).primaryKey(),
    provider: varchar("provider", { length: 30 }).notNull(),
    /** The provider's own event id. Half of the replay guard — see the unique index. */
    providerEventId: varchar("provider_event_id", { length: 255 }).notNull(),
    paymentIntentId: integer("payment_intent_id").references(
      () => paymentIntent.paymentIntentId,
      { onDelete: "set null" },
    ),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    /** False rows are RECORDED and REFUSED. Never settled. */
    signatureVerified: boolean("signature_verified").notNull(),
    /** True only when this event actually moved an invoice to paid. */
    isSettled: boolean("is_settled").notNull().default(false),
    /** bad_signature | unknown_reference | amount_mismatch | already_paid | unhandled_type */
    refusalReason: text("refusal_reason"),
    /** The raw provider body, verbatim. This is what a chargeback is argued from. */
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("idx_payment_event_provider_event").on(t.provider, t.providerEventId),
    index("idx_payment_event_intent").on(t.paymentIntentId),
  ],
);

// ─── Message channels (migration 023) ────────────────────────
//
// The roadmap for this platform was assembled by a human reading a Messenger export,
// because the platform cannot see any of it. Every commercially load-bearing signal —
// scope creep, revision requests, "the 12k isnt enough" — arrives on a channel this
// codebase had no model for and reached the system only when somebody retyped it.
//
// Three things to hold onto:
//
//   * CONSENT IS A COLUMN. `contactChannel.consentAt` NULL means we know the address and
//     may NOT use it. Under RA 10173 a scraped phone number is personal data with no
//     consent basis attached, and this is what stops the ~5K clinic list from becoming an
//     SMS blast. Storing an address is not permission to use it.
//   * INBOUND IS APPEND-ONLY apart from triage. What a client said is a fact; facts do
//     not get edited. `isActioned` is the one mutable column.
//   * OUTBOUND RECORDS FAILURES, and that is its purpose. email.service.ts swallowed its
//     own send failures and prod ran with no mail transport for months, invisibly.

export const contactChannel = pgTable(
  "contact_channel",
  {
    contactChannelId: bigserial("contact_channel_id", { mode: "number" }).primaryKey(),
    clientId: integer("client_id").references(() => client.clientId, { onDelete: "cascade" }),
    leadId: integer("lead_id").references(() => lead.leadId, { onDelete: "cascade" }),
    /** App-validated growable set: sms | viber | messenger | whatsapp. */
    channel: varchar("channel", { length: 20 }).notNull(),
    /** E.164 for sms/viber, a page-scoped id for messenger. Normalized by the app. */
    reference: varchar("reference", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }),
    isPrimary: boolean("is_primary").notNull().default(false),
    /** NULL = we know the address and MAY NOT use it. The send path refuses. */
    consentAt: timestamp("consent_at", { withTimezone: true }),
    /** WHERE permission came from. "We have consent" without provenance is no defence. */
    consentSource: varchar("consent_source", { length: 100 }),
    /** Set INSTEAD of deleting — deleting loses the evidence consent was ever given. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_contact_channel_client").on(t.clientId),
    index("idx_contact_channel_lead").on(t.leadId),
    uniqueIndex("idx_contact_channel_reference").on(t.channel, t.reference),
  ],
);

export const inboundMessage = pgTable(
  "inbound_message",
  {
    inboundMessageId: bigserial("inbound_message_id", { mode: "number" }).primaryKey(),
    channel: varchar("channel", { length: 20 }).notNull(),
    /** The provider's own id. Half of the replay guard — providers redeliver until 2xx. */
    providerMessageId: varchar("provider_message_id", { length: 255 }).notNull(),
    contactChannelId: integer("contact_channel_id").references(
      () => contactChannel.contactChannelId,
      { onDelete: "set null" },
    ),
    clientId: integer("client_id").references(() => client.clientId, { onDelete: "set null" }),
    projectId: integer("project_id").references(() => project.projectId, { onDelete: "set null" }),
    leadId: integer("lead_id").references(() => lead.leadId, { onDelete: "set null" }),
    senderReference: varchar("sender_reference", { length: 255 }).notNull(),
    senderName: varchar("sender_name", { length: 255 }),
    body: text("body"),
    attachment: jsonb("attachment"),
    /** The PROVIDER's clock. A scope dispute turns on when something was said. */
    sentAt: timestamp("sent_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    /** Unverified messages are recorded and FLAGGED — a forged row would be a fabricated
     *  paper trail, which is worse than a missing one. */
    signatureVerified: boolean("signature_verified").notNull(),
    /** The only mutable column. */
    isActioned: boolean("is_actioned").notNull().default(false),
    actionedAt: timestamp("actioned_at", { withTimezone: true }),
    actionedByUserId: integer("actioned_by_user_id").references(() => user.userId, {
      onDelete: "set null",
    }),
    rawPayload: jsonb("raw_payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_inbound_message_provider").on(t.channel, t.providerMessageId),
    index("idx_inbound_message_client").on(t.clientId),
    index("idx_inbound_message_project").on(t.projectId),
  ],
);

export const outboundMessage = pgTable(
  "outbound_message",
  {
    outboundMessageId: bigserial("outbound_message_id", { mode: "number" }).primaryKey(),
    channel: varchar("channel", { length: 20 }).notNull(),
    provider: varchar("provider", { length: 30 }).notNull(),
    contactChannelId: integer("contact_channel_id").references(
      () => contactChannel.contactChannelId,
      { onDelete: "set null" },
    ),
    toReference: varchar("to_reference", { length: 255 }).notNull(),
    body: text("body").notNull(),
    /** signoff_deadline | invoice_due | payment_receipt | custom. */
    purpose: varchar("purpose", { length: 50 }).notNull(),
    relatedEntityType: varchar("related_entity_type", { length: 50 }),
    relatedEntityId: integer("related_entity_id"),
    /** queued | sent | failed | refused. "refused" = declined BEFORE reaching a provider
     *  (no consent, or no transport). A refusal is not a failure and must not read as one. */
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    providerReference: varchar("provider_reference", { length: 255 }),
    /** Required by CHECK when status = failed. A failure with no reason is the outage. */
    failureReason: text("failure_reason"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_outbound_message_entity").on(t.relatedEntityType, t.relatedEntityId)],
);

// ─── Time entry (migration 024) ──────────────────────────────
//
// The first ACTUALS in this repo. availabilityBlock holds PLANNED time and deliverable
// holds done/not-done; nothing recorded how long anything took, which is why "the 12k
// isnt enough as a downpayment" could never be answered with a number.
//
//   * MINUTES, INTEGER. Never hours-as-float — this feeds a pricing argument, and a float
//     summed across a year does not equal the same number twice.
//   * A DATE, not a start/stop range. Deliberately not a stopwatch: a timer people fill
//     in retroactively lies with extra steps.
//   * NOT BILLING. No rate, no cost, no invoice link — ADVO bills fixed-price, and a rate
//     column would invent a billing model nobody agreed to.
//   * NOT SURVEILLANCE. No idle detection, no is_billable — that column turns a record of
//     effort into a judgement about a person.

export const timeEntry = pgTable(
  "time_entry",
  {
    timeEntryId: bigserial("time_entry_id", { mode: "number" }).primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => project.projectId, { onDelete: "cascade" }),
    /** Nullable: real work often belongs to a project and to no deliverable. */
    deliverableId: integer("deliverable_id").references(() => deliverable.deliverableId, {
      onDelete: "set null",
    }),
    teamMemberId: integer("team_member_id")
      .notNull()
      .references(() => teamMember.teamMemberId, { onDelete: "cascade" }),
    /** The working day in Asia/Manila. */
    workedOn: date("worked_on").notNull(),
    /** Integer MINUTES. CHECKed to 1..960 in 024 — see the migration for why 960. */
    minuteCount: integer("minute_count").notNull(),
    note: text("note"),
    /** Who typed it in — not always who did the work. */
    createdBy: integer("created_by").references(() => user.userId, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_time_entry_project").on(t.projectId),
    index("idx_time_entry_member").on(t.teamMemberId, t.workedOn),
    index("idx_time_entry_deliverable").on(t.deliverableId),
    index("idx_time_entry_worked_on").on(t.workedOn),
  ],
);

// ─── Client thread (migration 026) ───────────────────────────
//
// The conversation that lives ON the project rather than in Messenger. Append-only apart
// from the two read flags — one per side, because the team's unread count and the
// client's unread count are different questions and a single flag would have to pick.
// author_role is snapshotted from the session, never the body: a row that says "team"
// was written by a team session.

export const projectMessage = pgTable(
  "project_message",
  {
    projectMessageId: bigserial("project_message_id", { mode: "number" }).primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => project.projectId, { onDelete: "cascade" }),
    /** SET NULL: deleting an account must not erase what it wrote on a client's project. */
    authorUserId: integer("author_user_id").references(() => user.userId, { onDelete: "set null" }),
    /** client | team | admin. CHECKed in 026. */
    authorRole: varchar("author_role", { length: 20 }).notNull(),
    /** 1..4000 chars, CHECKed in 026 — the DB refuses what the composer refuses. */
    body: text("body").notNull(),
    isReadByTeam: boolean("is_read_by_team").notNull().default(false),
    isReadByClient: boolean("is_read_by_client").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_project_message_project").on(t.projectId, t.createdAt)],
);

// Every signed "Show Client Now" link ever minted. Append-only history: an expired row is
// still the record that a preview was shown on that date.
export const previewLink = pgTable(
  "preview_link",
  {
    previewLinkId: bigserial("preview_link_id", { mode: "number" }).primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => project.projectId, { onDelete: "cascade" }),
    /** The exact URL handed to the client, token included. */
    url: varchar("url", { length: 1000 }).notNull(),
    issuedByUserId: integer("issued_by_user_id").references(() => user.userId, {
      onDelete: "set null",
    }),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    /** Copied from the signed token so history can answer "was it live" without a JWT. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    note: varchar("note", { length: 500 }),
  },
  (t) => [index("idx_preview_link_project").on(t.projectId, t.issuedAt)],
);

// ─── Corpus (migration 027) ───────────────────────────────────────────────────
// Every claim ADVO has stated, with the document or recording it rests on. The
// `search` tsvector on corpus_fact is added by the migration, not declared here:
// drizzle push cannot express a STORED generated column (see 027).

export const corpusSource = pgTable(
  "corpus_source",
  {
    corpusSourceId: bigserial("corpus_source_id", { mode: "number" }).primaryKey(),
    /** plaud | drive_doc | local_file | web | text — CHECKed in 027. */
    kind: varchar("kind", { length: 30 }).notNull(),
    externalId: varchar("external_id", { length: 255 }).notNull(),
    url: varchar("url", { length: 1000 }),
    title: varchar("title", { length: 500 }).notNull(),
    documentKind: varchar("document_kind", { length: 30 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    durationSecond: integer("duration_second"),
    language: varchar("language", { length: 10 }),
    summary: text("summary"),
    projectId: integer("project_id").references(() => project.projectId, { onDelete: "set null" }),
    clientId: integer("client_id").references(() => client.clientId, { onDelete: "set null" }),
    leadId: integer("lead_id").references(() => lead.leadId, { onDelete: "set null" }),
    leadName: varchar("lead_name", { length: 255 }),
    meta: jsonb("meta").notNull().default({}),
    ingestedBy: integer("ingested_by").references(() => user.userId, { onDelete: "set null" }),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_corpus_source_external").on(t.kind, t.externalId),
    index("idx_corpus_source_project").on(t.projectId),
  ],
);

export const corpusFact = pgTable(
  "corpus_fact",
  {
    corpusFactId: bigserial("corpus_fact_id", { mode: "number" }).primaryKey(),
    corpusSourceId: integer("corpus_source_id")
      .notNull()
      .references(() => corpusSource.corpusSourceId, { onDelete: "cascade" }),
    claim: text("claim").notNull(),
    category: varchar("category", { length: 30 }).notNull(),
    quote: text("quote"),
    /** `m:ss` on a recording, a section heading on a document. */
    locator: varchar("locator", { length: 120 }),
    speaker: varchar("speaker", { length: 120 }),
    /** transcript | document | ai_note | heuristic | human — what the claim rests on. */
    basis: varchar("basis", { length: 20 }).notNull(),
    confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull().default("0.5"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    projectId: integer("project_id").references(() => project.projectId, { onDelete: "set null" }),
    isVerified: boolean("is_verified").notNull().default(false),
    verifiedBy: integer("verified_by").references(() => user.userId, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    supersededByFactId: integer("superseded_by_fact_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_corpus_fact_source").on(t.corpusSourceId),
    index("idx_corpus_fact_project").on(t.projectId),
    index("idx_corpus_fact_category").on(t.category),
  ],
);

export const corpusTerm = pgTable(
  "corpus_term",
  {
    corpusTermId: bigserial("corpus_term_id", { mode: "number" }).primaryKey(),
    corpusSourceId: integer("corpus_source_id")
      .notNull()
      .references(() => corpusSource.corpusSourceId, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    value: varchar("value", { length: 255 }).notNull(),
    unit: varchar("unit", { length: 20 }),
    quote: text("quote"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_corpus_term_name").on(t.name), index("idx_corpus_term_source").on(t.corpusSourceId)],
);

export const corpusAction = pgTable(
  "corpus_action",
  {
    corpusActionId: bigserial("corpus_action_id", { mode: "number" }).primaryKey(),
    corpusSourceId: integer("corpus_source_id")
      .notNull()
      .references(() => corpusSource.corpusSourceId, { onDelete: "cascade" }),
    corpusFactId: integer("corpus_fact_id").references(() => corpusFact.corpusFactId, { onDelete: "set null" }),
    description: text("description").notNull(),
    ownerName: varchar("owner_name", { length: 120 }),
    ownerTeamMemberId: integer("owner_team_member_id").references(() => teamMember.teamMemberId, {
      onDelete: "set null",
    }),
    projectId: integer("project_id").references(() => project.projectId, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    locator: varchar("locator", { length: 120 }),
    basis: varchar("basis", { length: 20 }).notNull().default("transcript"),
    /** open | done | dropped — CHECKed in 027; resolved_at must agree. */
    status: varchar("status", { length: 20 }).notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_corpus_action_status").on(t.status, t.dueAt),
    index("idx_corpus_action_project").on(t.projectId),
    index("idx_corpus_action_source").on(t.corpusSourceId),
  ],
);

export const corpusTemplate = pgTable(
  "corpus_template",
  {
    corpusTemplateId: bigserial("corpus_template_id", { mode: "number" }).primaryKey(),
    kind: varchar("kind", { length: 30 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    body: text("body").notNull(),
    placeholder: jsonb("placeholder").notNull().default([]),
    corpusSourceId: integer("corpus_source_id").references(() => corpusSource.corpusSourceId, {
      onDelete: "set null",
    }),
    version: integer("version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: integer("created_by").references(() => user.userId, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("idx_corpus_template_kind_name_version").on(t.kind, t.name, t.version)],
);
