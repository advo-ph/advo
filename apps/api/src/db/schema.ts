import {
  pgTable,
  pgEnum,
  bigserial,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
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
  "not_started",
  "in_progress",
  "review",
  "completed",
  "blocked",
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
  },
  (t) => [
    index("idx_session_user").on(t.userId),
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
    status: deliverableStatusEnum("status").notNull().default("not_started"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Team QA sign-off; independent of status/completed_at. Null = unverified. */
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_deliverable_project").on(t.projectId),
    index("idx_deliverable_assigned").on(t.assignedTo),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_invoice_project").on(t.projectId),
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

// Expense ledger (migration 005). amount_cents is integer cents. is_reimbursable
// is derived at read time as (receipt_url IS NOT NULL) — never stored as a column.
// category is app-validated varchar (growable set).
export const expense = pgTable(
  "expense",
  {
    expenseId: bigserial("expense_id", { mode: "number" }).primaryKey(),
    projectId: integer("project_id").references(() => project.projectId, { onDelete: "set null" }),
    purpose: text("purpose").notNull(),
    authorizedBy: varchar("authorized_by", { length: 255 }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    location: varchar("location", { length: 255 }),
    receiptUrl: varchar("receipt_url", { length: 500 }),
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

// Meeting MoM records (migration 006 + 012). Full transcript per project;
// optional Plaud file id / share key / AI summary. project_id required CASCADE.
export const meeting = pgTable(
  "meeting",
  {
    meetingId: bigserial("meeting_id", { mode: "number" }).primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => project.projectId, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    transcript: text("transcript").notNull(),
    summary: text("summary"),
    plaudFileId: varchar("plaud_file_id", { length: 64 }),
    plaudShareKey: varchar("plaud_share_key", { length: 500 }),
    isVisibleClient: boolean("is_visible_client").notNull().default(false),
    createdBy: integer("created_by").references(() => user.userId, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_meeting_project").on(t.projectId),
    index("idx_meeting_recorded_at").on(t.recordedAt),
    index("idx_meeting_created_by").on(t.createdBy),
    uniqueIndex("idx_meeting_plaud_file").on(t.plaudFileId),
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
    startTime: varchar("start_time", { length: 5 }).notNull(), // "HH:MM"
    endTime: varchar("end_time", { length: 5 }).notNull(),
    blockType: varchar("block_type", { length: 20 }).notNull().default("work"), // school|break|work|unavailable
    label: varchar("label", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_availability_member").on(t.teamMemberId),
    index("idx_availability_day").on(t.dayOfWeek),
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
