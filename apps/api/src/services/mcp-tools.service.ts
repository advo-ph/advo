/**
 * Read-only MCP tools (Phase 1 half). Pure functions, one per tool, each
 * `(botContext, args) => Promise<result>` so Phase 2 can add write-tool functions to this
 * same file without re-touching the tool registry.
 *
 * `registerReadTools` wires each function to `server.registerTool`. Money-shaped tools are
 * wrapped in `if (botContext.isOwner)` around the `registerTool` call itself — never
 * registered at all for non-owners, so they never appear in `tools/list`.
 */
import { z } from "zod";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { db } from "../db/connection.js";
import {
  project,
  projectStatusEnum,
  client,
  deliverable,
  deliverableStatusEnum,
  meeting,
  calendarEvent,
  availabilityBlock,
  teamMember,
  activityLog,
  invoice,
  contract,
  expense,
  lead,
  changeOrder,
} from "../db/schema.js";
import { sortMeetings, fetchAttendeeMap } from "./meeting.service.js";
import { logActivity } from "./activity.service.js";
import { notifyProjectClient } from "./notify.service.js";
import type { BotKeyContext } from "../types/bot-context.js";

// Write-tool schemas, reused from each resource's own route so the tool's validation can
// never drift from the HTTP route's validation.
import {
  createSchema as deliverableCreateSchema,
  updateSchema as deliverableUpdateSchema,
  canMarkFinished,
  parseDueDate as parseDeliverableDueDate,
} from "../routes/deliverables.routes.js";
import {
  meetingBaseShape,
  createSchema as meetingCreateSchema,
  updateSchema as meetingUpdateSchema,
} from "../routes/meeting.routes.js";
import {
  eventShape as calendarEventShape,
  createSchema as calendarCreateSchema,
  updateSchema as calendarUpdateSchema,
} from "../routes/calendar.routes.js";
import { createSchema as changeOrderCreateSchema } from "../routes/change-order.routes.js";
import { submitSchema as leadCreateSchema, updateSchema as leadUpdateSchema } from "../routes/leads.routes.js";
import {
  updateSchema as projectUpdateSchema,
  discountArithmeticError,
  normalizeDiscountFields,
} from "../routes/projects.routes.js";
import { createSchema as invoiceCreateSchema, updateSchema as invoiceUpdateSchema } from "../routes/invoices.routes.js";
import { createSchema as contractCreateSchema, updateSchema as contractUpdateSchema } from "../routes/contracts.routes.js";
import { createSchema as expenseCreateSchema, updateSchema as expenseUpdateSchema } from "../routes/expense.routes.js";

// ─── Tool result helpers ──────────────────────────────

function toolResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

function toolError(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Strips the money-shaped fields off a project row for a non-owner caller. */
function stripProjectMoney(row: Record<string, unknown>, isOwner: boolean) {
  if (isOwner) return row;
  const {
    totalValueCents: _totalValueCents,
    amountPaidCents: _amountPaidCents,
    listValueCents: _listValueCents,
    discountCents: _discountCents,
    discountReason: _discountReason,
    ...rest
  } = row;
  return rest;
}

// ─── whoami ────────────────────────────────────────────

async function whoami(botContext: BotKeyContext) {
  return {
    teamMemberName: botContext.teamMemberName,
    teamMemberId: botContext.teamMemberId,
    role: botContext.role,
    isOwner: botContext.isOwner,
  };
}

// ─── Projects ──────────────────────────────────────────

async function listProjects(
  botContext: BotKeyContext,
  args: { status?: (typeof projectStatusEnum.enumValues)[number]; clientId?: number },
) {
  const d = db();
  const conditions = [];
  if (args.status) conditions.push(eq(project.projectStatus, args.status));
  if (args.clientId != null) conditions.push(eq(project.clientId, args.clientId));

  const rows = await d
    .select({
      projectId: project.projectId,
      clientId: project.clientId,
      clientName: client.companyName,
      title: project.title,
      description: project.description,
      projectStatus: project.projectStatus,
      totalValueCents: project.totalValueCents,
      amountPaidCents: project.amountPaidCents,
      listValueCents: project.listValueCents,
      discountCents: project.discountCents,
      discountReason: project.discountReason,
      techStack: project.techStack,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })
    .from(project)
    .innerJoin(client, eq(project.clientId, client.clientId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(project.updatedAt));

  return rows.map((r) => stripProjectMoney(r, botContext.isOwner));
}

async function getProject(botContext: BotKeyContext, args: { projectId: number }) {
  const d = db();
  const [row] = await d
    .select({
      projectId: project.projectId,
      clientId: project.clientId,
      clientName: client.companyName,
      title: project.title,
      description: project.description,
      projectStatus: project.projectStatus,
      totalValueCents: project.totalValueCents,
      amountPaidCents: project.amountPaidCents,
      listValueCents: project.listValueCents,
      discountCents: project.discountCents,
      discountReason: project.discountReason,
      techStack: project.techStack,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })
    .from(project)
    .innerJoin(client, eq(project.clientId, client.clientId))
    .where(eq(project.projectId, args.projectId))
    .limit(1);
  if (!row) return null;
  return stripProjectMoney(row, botContext.isOwner);
}

// ─── Clients ───────────────────────────────────────────

async function listClients() {
  const d = db();
  return d.select().from(client).orderBy(client.companyName);
}

async function getClient(_botContext: BotKeyContext, args: { clientId: number }) {
  const d = db();
  const [row] = await d.select().from(client).where(eq(client.clientId, args.clientId)).limit(1);
  return row ?? null;
}

// ─── Deliverables ("tasks" — migration 042 unified tasks into deliverable) ────

async function listDeliverables(
  _botContext: BotKeyContext,
  args: { projectId?: number; status?: (typeof deliverableStatusEnum.enumValues)[number]; assignedTo?: number },
) {
  const d = db();
  const conditions = [];
  if (args.projectId != null) conditions.push(eq(deliverable.projectId, args.projectId));
  if (args.status) conditions.push(eq(deliverable.status, args.status));
  if (args.assignedTo != null) conditions.push(eq(deliverable.assignedTo, args.assignedTo));

  return d
    .select()
    .from(deliverable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(deliverable.sortOrder);
}

async function getDeliverable(_botContext: BotKeyContext, args: { deliverableId: number }) {
  const d = db();
  const [row] = await d
    .select()
    .from(deliverable)
    .where(eq(deliverable.deliverableId, args.deliverableId))
    .limit(1);
  return row ?? null;
}

// ─── Meetings ──────────────────────────────────────────

async function listMeetings(
  _botContext: BotKeyContext,
  args: { projectId?: number; upcomingOnly?: boolean },
) {
  const d = db();
  const conditions = [];
  if (args.projectId != null) conditions.push(eq(meeting.projectId, args.projectId));
  if (args.upcomingOnly) conditions.push(gte(meeting.startsAt, new Date()));

  const rows = await d
    .select()
    .from(meeting)
    .where(conditions.length ? and(...conditions) : undefined);
  const sorted = sortMeetings(rows);
  const attendeeMap = await fetchAttendeeMap(sorted.map((r) => r.meetingId));
  return sorted.map((r) => ({ ...r, attendees: attendeeMap.get(r.meetingId) ?? [] }));
}

async function getMeeting(_botContext: BotKeyContext, args: { meetingId: number }) {
  const d = db();
  const [row] = await d.select().from(meeting).where(eq(meeting.meetingId, args.meetingId)).limit(1);
  if (!row) return null;
  const attendeeMap = await fetchAttendeeMap([row.meetingId]);
  return { ...row, attendees: attendeeMap.get(row.meetingId) ?? [] };
}

// ─── Calendar ──────────────────────────────────────────

async function listCalendarEvents(_botContext: BotKeyContext, args: { startsAt: string; endsAt: string }) {
  const d = db();
  return d
    .select()
    .from(calendarEvent)
    .where(and(gte(calendarEvent.startsAt, new Date(args.startsAt)), lte(calendarEvent.startsAt, new Date(args.endsAt))))
    .orderBy(calendarEvent.startsAt);
}

// ─── Availability ──────────────────────────────────────

async function listAvailability(
  _botContext: BotKeyContext,
  args: { teamMemberId?: number },
) {
  const d = db();
  const conditions = [];
  if (args.teamMemberId != null) conditions.push(eq(availabilityBlock.teamMemberId, args.teamMemberId));
  return d
    .select()
    .from(availabilityBlock)
    .where(conditions.length ? and(...conditions) : undefined);
}

// ─── Team roster ───────────────────────────────────────

async function listTeam() {
  const d = db();
  return d
    .select({
      teamMemberId: teamMember.teamMemberId,
      name: teamMember.name,
      role: teamMember.role,
      avatarUrl: teamMember.avatarUrl,
      bio: teamMember.bio,
      linkedinUrl: teamMember.linkedinUrl,
      githubUrl: teamMember.githubUrl,
      permissionRole: teamMember.permissionRole,
      isActive: teamMember.isActive,
    })
    .from(teamMember)
    .where(eq(teamMember.isActive, true))
    .orderBy(teamMember.teamMemberId);
}

// ─── Recent activity ───────────────────────────────────

async function recentActivity(_botContext: BotKeyContext, args: { limit?: number }) {
  const d = db();
  const limit = Math.min(args.limit ?? 20, 50);
  return d.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(limit);
}

// ─── Money-gated tools (owner only) ────────────────────

async function listInvoices(_botContext: BotKeyContext, args: { projectId?: number }) {
  const d = db();
  const conditions = args.projectId != null ? [eq(invoice.projectId, args.projectId)] : [];
  return d
    .select()
    .from(invoice)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(invoice.createdAt));
}

async function getInvoice(_botContext: BotKeyContext, args: { invoiceId: number }) {
  const d = db();
  const [row] = await d.select().from(invoice).where(eq(invoice.invoiceId, args.invoiceId)).limit(1);
  return row ?? null;
}

async function listContracts(_botContext: BotKeyContext, args: { clientId?: number; projectId?: number }) {
  const d = db();
  const conditions = [];
  if (args.clientId != null) conditions.push(eq(contract.clientId, args.clientId));
  if (args.projectId != null) conditions.push(eq(contract.projectId, args.projectId));
  return d
    .select()
    .from(contract)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(contract.createdAt));
}

async function getContract(_botContext: BotKeyContext, args: { contractId: number }) {
  const d = db();
  const [row] = await d.select().from(contract).where(eq(contract.contractId, args.contractId)).limit(1);
  return row ?? null;
}

async function listExpenses(_botContext: BotKeyContext, args: { projectId?: number }) {
  const d = db();
  const conditions = args.projectId != null ? [eq(expense.projectId, args.projectId)] : [];
  return d
    .select()
    .from(expense)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(expense.createdAt));
}

// ─── Write-tool helpers ─────────────────────────────────

/** Validate `args` against `schema`, returning a tool-error-shaped message on failure. */
function parseArgs<T>(schema: z.ZodType<T>, args: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(args);
  if (result.success) return { ok: true, data: result.data };
  const issue = result.error.issues[0];
  const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
  return { ok: false, error: `${where}${issue?.message ?? "Invalid input"}` };
}

/** 403 for a client mistakenly linked to a team_member row — never reaches a write tool. */
function assertNotClient(botContext: BotKeyContext): string | null {
  if (botContext.role === "client") return "This bot key belongs to a client account and cannot make changes.";
  return null;
}

function assertAdmin(botContext: BotKeyContext): string | null {
  const clientBlock = assertNotClient(botContext);
  if (clientBlock) return clientBlock;
  if (botContext.role !== "admin") return "This action requires an admin-linked bot key.";
  return null;
}

// ─── Write: Deliverables ────────────────────────────────

async function createDeliverable(botContext: BotKeyContext, args: unknown) {
  const parsed = parseArgs(deliverableCreateSchema, args);
  if (!parsed.ok) return toolError(parsed.error);
  const d = db();
  const [created] = await d
    .insert(deliverable)
    .values({ ...parsed.data, dueDate: parseDeliverableDueDate(parsed.data.dueDate) })
    .returning();
  await logActivity({
    userId: botContext.linkedUserId,
    action: "deliverable_created",
    entityType: "deliverable",
    entityId: created.deliverableId,
    source: "bot",
    bot: botContext,
  });
  return toolResult(created);
}

async function updateDeliverable(botContext: BotKeyContext, args: { deliverableId?: number } & Record<string, unknown>) {
  const { deliverableId, ...rest } = (args ?? {}) as { deliverableId: number };
  if (!Number.isInteger(deliverableId)) return toolError("deliverableId is required");
  const parsed = parseArgs(deliverableUpdateSchema, rest);
  if (!parsed.ok) return toolError(parsed.error);

  if (parsed.data.status === "finished" && !canMarkFinished({ role: botContext.role ?? "team", isOwner: botContext.isOwner })) {
    return toolError("Only the owner or an admin can mark a deliverable as finished");
  }

  const d = db();
  const [existing] = await d
    .select({ status: deliverable.status, projectId: deliverable.projectId })
    .from(deliverable)
    .where(eq(deliverable.deliverableId, deliverableId))
    .limit(1);
  if (!existing) return toolError(`No deliverable with id ${deliverableId}`);

  const values: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.status !== undefined && parsed.data.status !== existing.status) {
    values.completedAt = parsed.data.status === "finished" ? new Date() : null;
  } else {
    delete values.completedAt;
  }
  if (parsed.data.dueDate !== undefined) values.dueDate = parseDeliverableDueDate(parsed.data.dueDate);
  if (parsed.data.verifiedAt !== undefined) values.verifiedAt = parseDeliverableDueDate(parsed.data.verifiedAt);

  const [updated] = await d
    .update(deliverable)
    .set(values)
    .where(eq(deliverable.deliverableId, deliverableId))
    .returning();
  if (!updated) return toolError(`No deliverable with id ${deliverableId}`);

  if (updated.status === "finished" && existing.status !== "finished") {
    await notifyProjectClient(updated.projectId, {
      type: "deliverable_completed",
      title: `${updated.title} is done`,
      body: `${updated.title} has been marked completed.`,
    }).catch(() => {});
  }

  await logActivity({
    userId: botContext.linkedUserId,
    action: "deliverable_updated",
    entityType: "deliverable",
    entityId: updated.deliverableId,
    source: "bot",
    bot: botContext,
  });
  return toolResult(updated);
}

// ─── Write: Meetings ─────────────────────────────────────

async function createMeetingTool(botContext: BotKeyContext, args: unknown) {
  const parsed = parseArgs(meetingCreateSchema, args);
  if (!parsed.ok) return toolError(parsed.error);
  const data = parsed.data;

  if (data.projectId != null) {
    const [proj] = await db().select({ projectId: project.projectId }).from(project).where(eq(project.projectId, data.projectId)).limit(1);
    if (!proj) return toolError("Project not found");
  }

  const recordedAt = data.recordedAt ? new Date(data.recordedAt) : data.startsAt ? new Date(data.startsAt) : new Date();
  const [created] = await db()
    .insert(meeting)
    .values({
      projectId: data.projectId ?? null,
      title: data.title,
      recordedAt,
      startsAt: data.startsAt ? new Date(data.startsAt) : null,
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
      transcript: data.transcript ?? "",
      summary: data.summary ?? null,
      location: data.location ?? null,
      description: data.description ?? null,
      plaudFileId: data.plaudFileId ?? null,
      plaudShareKey: data.plaudShareKey ?? null,
      audioUrl: data.audioUrl ?? null,
      isVisibleClient: data.isVisibleClient ?? false,
      createdBy: botContext.linkedUserId,
    })
    .returning();

  await logActivity({
    userId: botContext.linkedUserId,
    action: "meeting_created",
    entityType: "meeting",
    entityId: created.meetingId,
    source: "bot",
    bot: botContext,
  });
  return toolResult(created);
}

async function updateMeetingTool(botContext: BotKeyContext, args: { meetingId?: number } & Record<string, unknown>) {
  const { meetingId, ...rest } = (args ?? {}) as { meetingId: number };
  if (!Number.isInteger(meetingId)) return toolError("meetingId is required");
  const parsed = parseArgs(meetingUpdateSchema, rest);
  if (!parsed.ok) return toolError(parsed.error);
  const data = parsed.data;

  if (data.projectId != null) {
    const [proj] = await db().select({ projectId: project.projectId }).from(project).where(eq(project.projectId, data.projectId)).limit(1);
    if (!proj) return toolError("Project not found");
  }

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (data.projectId !== undefined) values.projectId = data.projectId ?? null;
  if (data.title !== undefined) values.title = data.title;
  if (data.recordedAt !== undefined) values.recordedAt = new Date(data.recordedAt);
  if (data.startsAt !== undefined) values.startsAt = data.startsAt ? new Date(data.startsAt) : null;
  if (data.endsAt !== undefined) values.endsAt = data.endsAt ? new Date(data.endsAt) : null;
  if (data.transcript !== undefined) values.transcript = data.transcript;
  if (data.summary !== undefined) values.summary = data.summary ?? null;
  if (data.location !== undefined) values.location = data.location ?? null;
  if (data.description !== undefined) values.description = data.description ?? null;
  if (data.plaudFileId !== undefined) values.plaudFileId = data.plaudFileId ?? null;
  if (data.plaudShareKey !== undefined) values.plaudShareKey = data.plaudShareKey ?? null;
  if (data.audioUrl !== undefined) values.audioUrl = data.audioUrl ?? null;
  if (data.isVisibleClient !== undefined) values.isVisibleClient = data.isVisibleClient;

  const [updated] = await db().update(meeting).set(values).where(eq(meeting.meetingId, meetingId)).returning();
  if (!updated) return toolError(`No meeting with id ${meetingId}`);

  await logActivity({
    userId: botContext.linkedUserId,
    action: "meeting_updated",
    entityType: "meeting",
    entityId: updated.meetingId,
    source: "bot",
    bot: botContext,
  });
  return toolResult(updated);
}

// ─── Write: Calendar events ──────────────────────────────

async function createCalendarEventTool(botContext: BotKeyContext, args: unknown) {
  const parsed = parseArgs(calendarCreateSchema, args);
  if (!parsed.ok) return toolError(parsed.error);
  const data = parsed.data;
  const [created] = await db()
    .insert(calendarEvent)
    .values({
      title: data.title,
      category: data.category,
      description: data.description ?? null,
      location: data.location ?? null,
      startsAt: new Date(data.startsAt),
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
      isAllDay: data.isAllDay,
      projectId: data.projectId ?? null,
    })
    .returning();
  await logActivity({
    userId: botContext.linkedUserId,
    action: "calendar_event_created",
    entityType: "calendar_event",
    entityId: created.calendarEventId,
    source: "bot",
    bot: botContext,
  });
  return toolResult(created);
}

async function updateCalendarEventTool(botContext: BotKeyContext, args: { calendarEventId?: number } & Record<string, unknown>) {
  const { calendarEventId, ...rest } = (args ?? {}) as { calendarEventId: number };
  if (!Number.isInteger(calendarEventId)) return toolError("calendarEventId is required");
  const parsed = parseArgs(calendarUpdateSchema, rest);
  if (!parsed.ok) return toolError(parsed.error);
  const data = parsed.data;

  const [existingRow] = await db()
    .select({ startsAt: calendarEvent.startsAt, endsAt: calendarEvent.endsAt })
    .from(calendarEvent)
    .where(eq(calendarEvent.calendarEventId, calendarEventId))
    .limit(1);
  if (!existingRow) return toolError(`No calendar event with id ${calendarEventId}`);

  const mergedStart = data.startsAt ?? existingRow.startsAt.toISOString();
  const mergedEnd = data.endsAt !== undefined ? data.endsAt : existingRow.endsAt?.toISOString() ?? null;
  if (mergedStart && mergedEnd && new Date(mergedEnd) <= new Date(mergedStart)) {
    return toolError("End time must be after the start time.");
  }

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title !== undefined) values.title = data.title;
  if (data.category !== undefined) values.category = data.category;
  if (data.description !== undefined) values.description = data.description ?? null;
  if (data.location !== undefined) values.location = data.location ?? null;
  if (data.startsAt !== undefined) values.startsAt = new Date(data.startsAt);
  if (data.endsAt !== undefined) values.endsAt = data.endsAt ? new Date(data.endsAt) : null;
  if (data.isAllDay !== undefined) values.isAllDay = data.isAllDay;
  if (data.projectId !== undefined) values.projectId = data.projectId ?? null;

  const [updated] = await db().update(calendarEvent).set(values).where(eq(calendarEvent.calendarEventId, calendarEventId)).returning();
  if (!updated) return toolError(`No calendar event with id ${calendarEventId}`);

  await logActivity({
    userId: botContext.linkedUserId,
    action: "calendar_event_updated",
    entityType: "calendar_event",
    entityId: updated.calendarEventId,
    source: "bot",
    bot: botContext,
  });
  return toolResult(updated);
}

// ─── Write: Change orders ────────────────────────────────

async function createChangeOrderTool(botContext: BotKeyContext, args: unknown) {
  const parsed = parseArgs(changeOrderCreateSchema, args);
  if (!parsed.ok) return toolError(parsed.error);
  const data = parsed.data;

  const [proj] = await db()
    .select({ projectId: project.projectId, title: project.title })
    .from(project)
    .where(eq(project.projectId, data.projectId))
    .limit(1);
  if (!proj) return toolError("Project not found");

  const [created] = await db()
    .insert(changeOrder)
    .values({
      projectId: data.projectId,
      scope: data.scope,
      reason: data.reason,
      status: "filed",
      priceCents: data.priceCents ?? null,
      createdBy: botContext.linkedUserId,
    })
    .returning();

  // The HTTP route's own self-logging (change-order.routes.ts:134) is deny-listed from the
  // generic middleware — but this is a bot write, which never goes through HTTP at all, so
  // it must log itself the same way, with source: "bot".
  await logActivity({
    userId: botContext.linkedUserId,
    action: "change_order_filed",
    entityType: "change_order",
    entityId: created.changeOrderId,
    source: "bot",
    bot: botContext,
    metadata: { projectId: data.projectId },
  });

  await notifyProjectClient(data.projectId, {
    type: "custom",
    title: `A change order needs your review: ${data.scope.split(/\r?\n/, 1)[0].slice(0, 80)}`,
    body: `The team filed a change order on ${proj.title}. Reason: ${data.reason}`,
  }).catch(() => {});

  return toolResult(created);
}

// ─── Write: Leads ─────────────────────────────────────────

async function createLeadTool(botContext: BotKeyContext, args: unknown) {
  const parsed = parseArgs(leadCreateSchema, args);
  if (!parsed.ok) return toolError(parsed.error);
  const [created] = await db().insert(lead).values(parsed.data).returning();
  await logActivity({
    userId: botContext.linkedUserId,
    action: "lead_created",
    entityType: "lead",
    entityId: created.leadId,
    source: "bot",
    bot: botContext,
  });
  return toolResult(created);
}

async function updateLeadTool(botContext: BotKeyContext, args: { leadId?: number } & Record<string, unknown>) {
  const { leadId, ...rest } = (args ?? {}) as { leadId: number };
  if (!Number.isInteger(leadId)) return toolError("leadId is required");
  const parsed = parseArgs(leadUpdateSchema, rest);
  if (!parsed.ok) return toolError(parsed.error);
  const [updated] = await db().update(lead).set(parsed.data).where(eq(lead.leadId, leadId)).returning();
  if (!updated) return toolError(`No lead with id ${leadId}`);
  await logActivity({
    userId: botContext.linkedUserId,
    action: "lead_updated",
    entityType: "lead",
    entityId: updated.leadId,
    source: "bot",
    bot: botContext,
  });
  return toolResult(updated);
}

// ─── Write: Projects (admin, money fields owner-only) ────

/** Money fields silently dropped (not a 403) for a non-owner caller — see tool description. */
const PROJECT_MONEY_FIELDS = ["totalValueCents", "amountPaidCents", "listValueCents", "discountCents", "discountReason"] as const;

async function updateProjectTool(botContext: BotKeyContext, args: { projectId?: number } & Record<string, unknown>) {
  const { projectId, ...rest } = (args ?? {}) as { projectId: number };
  if (!Number.isInteger(projectId)) return toolError("projectId is required");

  const body = { ...rest };
  if (!botContext.isOwner) {
    for (const field of PROJECT_MONEY_FIELDS) delete (body as Record<string, unknown>)[field];
  }

  const parsed = parseArgs(projectUpdateSchema, body);
  if (!parsed.ok) return toolError(parsed.error);
  const data = normalizeDiscountFields(parsed.data);
  const arithmetic = discountArithmeticError(data);
  if (arithmetic) return toolError(arithmetic);

  // Every field sent was a money field and got dropped above (non-owner caller) — nothing
  // left to write. Return the project unchanged rather than sending an empty SET to the DB.
  if (Object.keys(data).length === 0) {
    const [current] = await db().select().from(project).where(eq(project.projectId, projectId)).limit(1);
    if (!current) return toolError(`No project with id ${projectId}`);
    return toolResult({
      ...stripProjectMoney(current, botContext.isOwner),
      _note: "No non-money fields were provided, so nothing was changed.",
    });
  }

  const [updated] = await db().update(project).set(data).where(eq(project.projectId, projectId)).returning();
  if (!updated) return toolError(`No project with id ${projectId}`);

  await logActivity({
    userId: botContext.linkedUserId,
    action: "project_updated",
    entityType: "project",
    entityId: updated.projectId,
    source: "bot",
    bot: botContext,
  });
  return toolResult(stripProjectMoney(updated, botContext.isOwner));
}

// ─── Write: Team member (admin, non-credential fields only) ──

const teamMemberUpdateSchema = z.object({
  bio: z.string().max(2000).nullish(),
  role: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  linkedinUrl: z.string().max(500).nullish(),
  githubUrl: z.string().max(500).nullish(),
});

async function updateTeamMemberTool(botContext: BotKeyContext, args: { teamMemberId?: number } & Record<string, unknown>) {
  const { teamMemberId, ...rest } = (args ?? {}) as { teamMemberId: number };
  if (!Number.isInteger(teamMemberId)) return toolError("teamMemberId is required");
  const parsed = parseArgs(teamMemberUpdateSchema, rest);
  if (!parsed.ok) return toolError(parsed.error);

  const values: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  const [updated] = await db().update(teamMember).set(values).where(eq(teamMember.teamMemberId, teamMemberId)).returning();
  if (!updated) return toolError(`No team member with id ${teamMemberId}`);

  await logActivity({
    userId: botContext.linkedUserId,
    action: "team_member_updated",
    entityType: "team_member",
    entityId: updated.teamMemberId,
    source: "bot",
    bot: botContext,
  });
  return toolResult(updated);
}

// ─── Write: Invoices / Contracts / Expenses (owner-only) ────

async function createInvoiceTool(botContext: BotKeyContext, args: unknown) {
  const parsed = parseArgs(invoiceCreateSchema, args);
  if (!parsed.ok) return toolError(parsed.error);
  const [created] = await db()
    .insert(invoice)
    .values({ ...parsed.data, dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null })
    .returning();
  await logActivity({ userId: botContext.linkedUserId, action: "invoice_created", entityType: "invoice", entityId: created.invoiceId, source: "bot", bot: botContext });
  return toolResult(created);
}

async function updateInvoiceTool(botContext: BotKeyContext, args: { invoiceId?: number } & Record<string, unknown>) {
  const { invoiceId, ...rest } = (args ?? {}) as { invoiceId: number };
  if (!Number.isInteger(invoiceId)) return toolError("invoiceId is required");
  const parsed = parseArgs(invoiceUpdateSchema, rest);
  if (!parsed.ok) return toolError(parsed.error);
  const data = parsed.data;
  const values: Record<string, unknown> = { ...data, updatedAt: new Date() };
  if (data.status === "paid") values.paidAt = new Date();
  else if (data.status !== undefined) values.paidAt = null;
  if (data.dueDate !== undefined) values.dueDate = data.dueDate ? new Date(data.dueDate) : null;

  const [updated] = await db().update(invoice).set(values).where(eq(invoice.invoiceId, invoiceId)).returning();
  if (!updated) return toolError(`No invoice with id ${invoiceId}`);
  await logActivity({ userId: botContext.linkedUserId, action: "invoice_updated", entityType: "invoice", entityId: updated.invoiceId, source: "bot", bot: botContext });
  return toolResult(updated);
}

async function createContractTool(botContext: BotKeyContext, args: unknown) {
  const parsed = parseArgs(contractCreateSchema, args);
  if (!parsed.ok) return toolError(parsed.error);
  const data = parsed.data;
  const [created] = await db()
    .insert(contract)
    .values({
      ...data,
      signedAt: data.signedAt ? new Date(data.signedAt) : null,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    })
    .returning();
  await logActivity({ userId: botContext.linkedUserId, action: "contract_created", entityType: "contract", entityId: created.contractId, source: "bot", bot: botContext });
  return toolResult(created);
}

async function updateContractTool(botContext: BotKeyContext, args: { contractId?: number } & Record<string, unknown>) {
  const { contractId, ...rest } = (args ?? {}) as { contractId: number };
  if (!Number.isInteger(contractId)) return toolError("contractId is required");
  const parsed = parseArgs(contractUpdateSchema, rest);
  if (!parsed.ok) return toolError(parsed.error);
  const data = parsed.data;
  const values: Record<string, unknown> = { ...data, updatedAt: new Date() };
  if (data.signedAt !== undefined) values.signedAt = data.signedAt ? new Date(data.signedAt) : null;
  if (data.expiresAt !== undefined) values.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;

  const [updated] = await db().update(contract).set(values).where(eq(contract.contractId, contractId)).returning();
  if (!updated) return toolError(`No contract with id ${contractId}`);
  await logActivity({ userId: botContext.linkedUserId, action: "contract_updated", entityType: "contract", entityId: updated.contractId, source: "bot", bot: botContext });
  return toolResult(updated);
}

async function createExpenseTool(botContext: BotKeyContext, args: unknown) {
  const parsed = parseArgs(expenseCreateSchema, args);
  if (!parsed.ok) return toolError(parsed.error);
  const data = parsed.data;
  const [created] = await db()
    .insert(expense)
    .values({
      projectId: data.projectId ?? null,
      teamMemberId: data.teamMemberId ?? null,
      purpose: data.purpose,
      authorizedBy: data.authorizedBy ?? "",
      amountCents: data.amountCents,
      expenseType: data.expenseType,
      expensePaidStatus: data.expensePaidStatus,
      createdBy: botContext.linkedUserId,
    })
    .returning();
  await logActivity({ userId: botContext.linkedUserId, action: "expense_created", entityType: "expense", entityId: created.expenseId, source: "bot", bot: botContext });
  return toolResult(created);
}

async function updateExpenseTool(botContext: BotKeyContext, args: { expenseId?: number } & Record<string, unknown>) {
  const { expenseId, ...rest } = (args ?? {}) as { expenseId: number };
  if (!Number.isInteger(expenseId)) return toolError("expenseId is required");
  const parsed = parseArgs(expenseUpdateSchema, rest);
  if (!parsed.ok) return toolError(parsed.error);
  const [updated] = await db()
    .update(expense)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(expense.expenseId, expenseId))
    .returning();
  if (!updated) return toolError(`No expense with id ${expenseId}`);
  await logActivity({ userId: botContext.linkedUserId, action: "expense_updated", entityType: "expense", entityId: updated.expenseId, source: "bot", bot: botContext });
  return toolResult(updated);
}

// ─── Registration ──────────────────────────────────────

export function registerWriteTools(server: McpServer, botContext: BotKeyContext): void {
  const clientBlock = assertNotClient(botContext);
  if (clientBlock) return; // A client-linked bot key gets no write tools registered at all.

  server.registerTool(
    "create_deliverable",
    { description: "Create a deliverable (ADVO's \"task\"). Mirrors POST /api/deliverables.", inputSchema: deliverableCreateSchema.shape },
    async (args) => createDeliverable(botContext, args),
  );
  server.registerTool(
    "update_deliverable",
    { description: "Update a deliverable. Marking it \"finished\" requires an admin or owner bot key. Mirrors PATCH /api/deliverables/:id.", inputSchema: { deliverableId: z.number().int(), ...deliverableUpdateSchema.shape } },
    async (args) => updateDeliverable(botContext, args as never),
  );

  server.registerTool(
    "create_meeting",
    { description: "Create a meeting record. Mirrors POST /api/meeting.", inputSchema: meetingBaseShape.shape },
    async (args) => createMeetingTool(botContext, args),
  );
  server.registerTool(
    "update_meeting",
    { description: "Update a meeting, including its transcript/summary. Mirrors PATCH /api/meeting/:id.", inputSchema: { meetingId: z.number().int(), ...meetingUpdateSchema.shape } },
    async (args) => updateMeetingTool(botContext, args as never),
  );

  server.registerTool(
    "create_calendar_event",
    { description: "Create a manual calendar event. Mirrors POST /api/calendar.", inputSchema: calendarEventShape },
    async (args) => createCalendarEventTool(botContext, args),
  );
  server.registerTool(
    "update_calendar_event",
    { description: "Update a manual calendar event. Mirrors PATCH /api/calendar/:id.", inputSchema: { calendarEventId: z.number().int(), ...calendarUpdateSchema.shape } },
    async (args) => updateCalendarEventTool(botContext, args as never),
  );

  server.registerTool(
    "create_change_order",
    { description: "File a change order on a project. Mirrors POST /api/change-order.", inputSchema: changeOrderCreateSchema.shape },
    async (args) => createChangeOrderTool(botContext, args),
  );

  server.registerTool(
    "create_lead",
    { description: "Create a lead. Mirrors POST /api/leads.", inputSchema: leadCreateSchema.shape },
    async (args) => createLeadTool(botContext, args),
  );
  server.registerTool(
    "update_lead",
    { description: "Update a lead's status, notes, or assignment. Mirrors PATCH /api/leads/:id.", inputSchema: { leadId: z.number().int(), ...leadUpdateSchema.shape } },
    async (args) => updateLeadTool(botContext, args as never),
  );

  // Admin-level: requires an admin-linked bot key (mirrors rbac.ts's requireAdmin gate on
  // the equivalent HTTP routes). Not registered at all for a non-admin caller, same pattern
  // as the money-gated read tools below.
  if (!assertAdmin(botContext)) {
    server.registerTool(
      "update_project",
      {
        description:
          "Update a project. Admin only. Money fields (totalValueCents, amountPaidCents, listValueCents, discountCents, discountReason) are silently dropped unless the caller is the owner — verify with get_project after calling this if you sent one.",
        inputSchema: { projectId: z.number().int(), ...projectUpdateSchema.shape },
      },
      async (args) => updateProjectTool(botContext, args as never),
    );

    server.registerTool(
      "update_team_member",
      {
        description: "Update a team member's bio, job title (role), active flag, LinkedIn/GitHub links. Admin only. Never touches login credentials.",
        inputSchema: { teamMemberId: z.number().int(), ...teamMemberUpdateSchema.shape },
      },
      async (args) => updateTeamMemberTool(botContext, args as never),
    );
  }

  // Money-gated write tools — owner only, not registered at all otherwise (mirrors the
  // money-gated read tools below).
  if (botContext.isOwner) {
    server.registerTool(
      "create_invoice",
      { description: "Create an invoice. Owner only. Mirrors POST /api/invoices.", inputSchema: invoiceCreateSchema.shape },
      async (args) => createInvoiceTool(botContext, args),
    );
    server.registerTool(
      "update_invoice",
      { description: "Update an invoice. Owner only. Mirrors PATCH /api/invoices/:id.", inputSchema: { invoiceId: z.number().int(), ...invoiceUpdateSchema.shape } },
      async (args) => updateInvoiceTool(botContext, args as never),
    );
    server.registerTool(
      "create_contract",
      { description: "Create a contract. Owner only. Mirrors POST /api/contracts.", inputSchema: contractCreateSchema.shape },
      async (args) => createContractTool(botContext, args),
    );
    server.registerTool(
      "update_contract",
      { description: "Update a contract. Owner only. Mirrors PATCH /api/contracts/:id.", inputSchema: { contractId: z.number().int(), ...contractUpdateSchema.shape } },
      async (args) => updateContractTool(botContext, args as never),
    );
    server.registerTool(
      "create_expense",
      { description: "Create an expense. Owner only. Mirrors POST /api/expense.", inputSchema: expenseCreateSchema.shape },
      async (args) => createExpenseTool(botContext, args),
    );
    server.registerTool(
      "update_expense",
      { description: "Update an expense. Owner only. Mirrors PATCH /api/expense/:id.", inputSchema: { expenseId: z.number().int(), ...expenseUpdateSchema.shape } },
      async (args) => updateExpenseTool(botContext, args as never),
    );
  }
}

// ─── Registration (read tools) ──────────────────────────

export function registerReadTools(server: McpServer, botContext: BotKeyContext): void {
  server.registerTool(
    "whoami",
    {
      description: "Who this bot key belongs to. Call this first.",
      inputSchema: {},
    },
    async () => toolResult(await whoami(botContext)),
  );

  server.registerTool(
    "list_projects",
    {
      description: "List projects, optionally filtered by status or client. Money fields are hidden unless the caller is the owner.",
      inputSchema: {
        status: z.enum(projectStatusEnum.enumValues).optional(),
        clientId: z.number().int().optional(),
      },
    },
    async (args) => toolResult(await listProjects(botContext, args)),
  );

  server.registerTool(
    "get_project",
    {
      description: "Get one project by id. Money fields are hidden unless the caller is the owner.",
      inputSchema: { projectId: z.number().int() },
    },
    async (args) => {
      const row = await getProject(botContext, args);
      if (!row) return toolError(`No project with id ${args.projectId}`);
      return toolResult(row);
    },
  );

  server.registerTool(
    "list_clients",
    { description: "List all clients.", inputSchema: {} },
    async () => toolResult(await listClients()),
  );

  server.registerTool(
    "get_client",
    { description: "Get one client by id.", inputSchema: { clientId: z.number().int() } },
    async (args) => {
      const row = await getClient(botContext, args);
      if (!row) return toolError(`No client with id ${args.clientId}`);
      return toolResult(row);
    },
  );

  server.registerTool(
    "list_deliverables",
    {
      description: "List deliverables (ADVO's \"tasks\" — there is no separate task table).",
      inputSchema: {
        projectId: z.number().int().optional(),
        status: z.enum(deliverableStatusEnum.enumValues).optional(),
        assignedTo: z.number().int().optional(),
      },
    },
    async (args) => toolResult(await listDeliverables(botContext, args)),
  );

  server.registerTool(
    "get_deliverable",
    { description: "Get one deliverable by id.", inputSchema: { deliverableId: z.number().int() } },
    async (args) => {
      const row = await getDeliverable(botContext, args);
      if (!row) return toolError(`No deliverable with id ${args.deliverableId}`);
      return toolResult(row);
    },
  );

  server.registerTool(
    "list_meetings",
    {
      description: "List meetings with their attendees, optionally filtered by project or upcoming-only.",
      inputSchema: {
        projectId: z.number().int().optional(),
        upcomingOnly: z.boolean().optional(),
      },
    },
    async (args) => toolResult(await listMeetings(botContext, args)),
  );

  server.registerTool(
    "get_meeting",
    {
      description: "Get one meeting by id, including its full transcript/summary and attendees.",
      inputSchema: { meetingId: z.number().int() },
    },
    async (args) => {
      const row = await getMeeting(botContext, args);
      if (!row) return toolError(`No meeting with id ${args.meetingId}`);
      return toolResult(row);
    },
  );

  server.registerTool(
    "list_calendar_events",
    {
      description: "List calendar events in a date range.",
      inputSchema: { startsAt: z.string(), endsAt: z.string() },
    },
    async (args) => toolResult(await listCalendarEvents(botContext, args)),
  );

  server.registerTool(
    "list_availability",
    {
      description: "List recurring availability blocks, optionally filtered by team member.",
      inputSchema: {
        teamMemberId: z.number().int().optional(),
        startsAt: z.string().optional(),
        endsAt: z.string().optional(),
      },
    },
    async (args) => toolResult(await listAvailability(botContext, args)),
  );

  server.registerTool(
    "list_team",
    { description: "List the active team roster (public shape only, no login credentials).", inputSchema: {} },
    async () => toolResult(await listTeam()),
  );

  server.registerTool(
    "recent_activity",
    {
      description: "Recent activity_log rows, newest first (max 50).",
      inputSchema: { limit: z.number().int().max(50).optional() },
    },
    async (args) => toolResult(await recentActivity(botContext, args)),
  );

  if (botContext.isOwner) {
    server.registerTool(
      "list_invoices",
      { description: "List invoices, optionally filtered by project. Owner only.", inputSchema: { projectId: z.number().int().optional() } },
      async (args) => toolResult(await listInvoices(botContext, args)),
    );

    server.registerTool(
      "get_invoice",
      { description: "Get one invoice by id. Owner only.", inputSchema: { invoiceId: z.number().int() } },
      async (args) => {
        const row = await getInvoice(botContext, args);
        if (!row) return toolError(`No invoice with id ${args.invoiceId}`);
        return toolResult(row);
      },
    );

    server.registerTool(
      "list_contracts",
      {
        description: "List contracts, optionally filtered by client or project. Owner only.",
        inputSchema: { clientId: z.number().int().optional(), projectId: z.number().int().optional() },
      },
      async (args) => toolResult(await listContracts(botContext, args)),
    );

    server.registerTool(
      "get_contract",
      { description: "Get one contract by id. Owner only.", inputSchema: { contractId: z.number().int() } },
      async (args) => {
        const row = await getContract(botContext, args);
        if (!row) return toolError(`No contract with id ${args.contractId}`);
        return toolResult(row);
      },
    );

    server.registerTool(
      "list_expenses",
      { description: "List expenses, optionally filtered by project. Owner only.", inputSchema: { projectId: z.number().int().optional() } },
      async (args) => toolResult(await listExpenses(botContext, args)),
    );
  }
}
