/**
 * /api/corpus — the fact corpus (migration 027). Team only.
 *
 * Ingest three ways: a curated JSON bundle (what the ingestion pass writes under
 * data/corpus/), a Plaud share URL (which also lands the recording in `meeting`
 * so the Meetings screen shows it), or pasted text. Read facts, terms, actions
 * and templates; check a claim; render a template.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin, requireTeam } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";
import { fetchPlaudShare, parseShareKey } from "../services/plaud.service.js";
import { importPlaudMeeting, resolveInboxProjectId } from "../services/plaud-import.service.js";
import {
  FACT_BASIS,
  SOURCE_KIND,
  TEMPLATE_KIND,
  checkClaim,
  corpusStat,
  deleteSource,
  extract,
  getSource,
  getTemplate,
  ingestBundle,
  listAction,
  listFact,
  listSource,
  listTemplate,
  listTerm,
  renderTemplate,
  supersedeByNewerDocument,
  supersedeFact,
  updateAction,
  upsertTemplate,
  verifyFact,
} from "../services/corpus.service.js";

export const corpusRoutes = new Hono<{ Variables: Variables }>();
corpusRoutes.use("*", requireAuth, requireTeam);

const idParam = (raw: string) => {
  const id = Number(raw);
  if (!Number.isFinite(id)) throw new HTTPException(400, { message: "Invalid id" });
  return id;
};

const factSchema = z.object({
  claim: z.string().min(1).max(2000),
  category: z.string().max(30),
  quote: z.string().max(2000).nullish(),
  locator: z.string().max(120).nullish(),
  speaker: z.string().max(120).nullish(),
  basis: z.enum(FACT_BASIS),
  confidence: z.number().min(0).max(1),
  occurredAt: z.string().nullish(),
  projectId: z.number().int().nullish(),
});
const bundleSchema = z.object({
  source: z.object({
    kind: z.enum(SOURCE_KIND),
    externalId: z.string().min(1).max(255),
    url: z.string().max(1000).nullish(),
    title: z.string().min(1).max(500),
    documentKind: z.string().max(30).nullish(),
    occurredAt: z.string().nullish(),
    durationSecond: z.number().int().nullish(),
    language: z.string().max(10).nullish(),
    summary: z.string().nullish(),
    projectId: z.number().int().nullish(),
    clientId: z.number().int().nullish(),
    leadName: z.string().max(255).nullish(),
    meta: z.record(z.unknown()).optional(),
  }),
  fact: z.array(factSchema).optional(),
  term: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        value: z.union([z.string(), z.number()]),
        unit: z.string().max(20).nullish(),
        quote: z.string().nullish(),
      }),
    )
    .optional(),
  action: z
    .array(
      z.object({
        description: z.string().min(1).max(2000),
        ownerName: z.string().max(120).nullish(),
        dueAt: z.string().nullish(),
        locator: z.string().max(120).nullish(),
        basis: z.enum(FACT_BASIS).optional(),
        projectId: z.number().int().nullish(),
      }),
    )
    .optional(),
});

// ─── Stats ───────────────────────────────────────────
corpusRoutes.get("/stat", async (c) => c.json({ data: await corpusStat(), error: null }));

// ─── Ingest ──────────────────────────────────────────

/** A curated bundle. Idempotent on (source.kind, source.externalId). */
corpusRoutes.post("/ingest/json", zValidator("json", bundleSchema), async (c) => {
  const user = c.get("user");
  const result = await ingestBundle(c.req.valid("json"), user.userId);
  return c.json({ data: result, error: null }, 201);
});

/** A Plaud share: fetched, extracted (AI or heuristic), stored, and landed in `meeting`. */
corpusRoutes.post(
  "/ingest/plaud",
  zValidator("json", z.object({ shareUrl: z.string().min(10), projectId: z.number().int().nullish(), leadName: z.string().max(255).nullish() })),
  async (c) => {
    const { shareUrl, projectId, leadName } = c.req.valid("json");
    const user = c.get("user");
    const key = parseShareKey(shareUrl);
    if (!key) throw new HTTPException(400, { message: "Not a Plaud share link" });
    const payload = await fetchPlaudShare(shareUrl);
    if (!payload.transcript.trim()) throw new HTTPException(422, { message: "The share has no transcript yet" });

    const targetProjectId = await resolveInboxProjectId(projectId ?? null);
    const meeting = await importPlaudMeeting({ projectId: targetProjectId, shareUrl, createdBy: user.userId });

    const extraction = await extract(payload.transcript, payload.recordedAt);
    const externalId = key.split("::")[0];
    const result = await ingestBundle(
      {
        source: {
          kind: "plaud",
          externalId,
          url: shareUrl.split("?")[0],
          title: payload.title,
          occurredAt: payload.recordedAt,
          summary: extraction.summary ?? payload.summary ?? null,
          projectId: projectId ?? null,
          leadName: leadName ?? null,
          meta: { extractionMethod: extraction.method, meetingId: (meeting as { meetingId?: number }).meetingId ?? null },
        },
        fact: extraction.fact,
        term: extraction.term,
        action: extraction.action,
      },
      user.userId,
    );
    return c.json({ data: { ...result, method: extraction.method, meeting }, error: null }, 201);
  },
);

/** Pasted text: minutes, an email, a chat export. */
corpusRoutes.post(
  "/ingest/text",
  zValidator(
    "json",
    z.object({
      title: z.string().min(1).max(500),
      text: z.string().min(20).max(400_000),
      kind: z.enum(SOURCE_KIND).default("text"),
      externalId: z.string().max(255).optional(),
      occurredAt: z.string().nullish(),
      projectId: z.number().int().nullish(),
      leadName: z.string().max(255).nullish(),
    }),
  ),
  async (c) => {
    const input = c.req.valid("json");
    const user = c.get("user");
    const extraction = await extract(input.text, input.occurredAt);
    const externalId = input.externalId ?? `text-${Date.now()}`;
    const result = await ingestBundle(
      {
        source: {
          kind: input.kind,
          externalId,
          title: input.title,
          occurredAt: input.occurredAt ?? null,
          summary: extraction.summary,
          projectId: input.projectId ?? null,
          leadName: input.leadName ?? null,
          meta: { extractionMethod: extraction.method, characterCount: input.text.length },
        },
        fact: extraction.fact,
        term: extraction.term,
        action: extraction.action,
      },
      user.userId,
    );
    return c.json({ data: { ...result, method: extraction.method }, error: null }, 201);
  },
);

// ─── Read ────────────────────────────────────────────

corpusRoutes.get("/source", async (c) => {
  const projectId = c.req.query("projectId");
  return c.json({
    data: await listSource({ kind: c.req.query("kind") || undefined, projectId: projectId ? Number(projectId) : undefined }),
    error: null,
  });
});

corpusRoutes.get("/source/:id", async (c) => {
  const row = await getSource(idParam(c.req.param("id")));
  if (!row) throw new HTTPException(404, { message: "No such source" });
  return c.json({ data: row, error: null });
});

/** Remove a source and everything it stated (a bad ingest, a bench). Admin only. */
corpusRoutes.delete("/source/:id", requireAdmin, async (c) => {
  const ok = await deleteSource(idParam(c.req.param("id")));
  if (!ok) throw new HTTPException(404, { message: "No such source" });
  return c.json({ data: { deleted: true }, error: null });
});

corpusRoutes.get("/fact", async (c) => {
  const projectId = c.req.query("projectId");
  const limit = c.req.query("limit");
  return c.json({
    data: await listFact({
      q: c.req.query("q") || undefined,
      projectId: projectId ? Number(projectId) : undefined,
      category: c.req.query("category") || undefined,
      limit: limit ? Number(limit) : undefined,
    }),
    error: null,
  });
});

corpusRoutes.patch(
  "/fact/:id/verify",
  zValidator("json", z.object({ isVerified: z.boolean() })),
  async (c) => {
    const user = c.get("user");
    const row = await verifyFact(idParam(c.req.param("id")), user.userId, c.req.valid("json").isVerified);
    if (!row) throw new HTTPException(404, { message: "No such fact" });
    return c.json({ data: row, error: null });
  },
);

corpusRoutes.patch(
  "/fact/:id/supersede",
  zValidator("json", z.object({ byFactId: z.number().int().positive() })),
  async (c) => {
    const row = await supersedeFact(idParam(c.req.param("id")), c.req.valid("json").byFactId);
    if (!row) throw new HTTPException(404, { message: "No such fact" });
    return c.json({ data: row, error: null });
  },
);

corpusRoutes.get("/term", async (c) => c.json({ data: await listTerm(c.req.query("name") || undefined), error: null }));

corpusRoutes.get("/action", async (c) => {
  const projectId = c.req.query("projectId");
  return c.json({
    data: await listAction({
      status: c.req.query("status") || undefined,
      projectId: projectId ? Number(projectId) : undefined,
      ownerName: c.req.query("ownerName") || undefined,
    }),
    error: null,
  });
});

corpusRoutes.patch(
  "/action/:id",
  zValidator(
    "json",
    z.object({
      status: z.enum(["open", "done", "dropped"]).optional(),
      resolutionNote: z.string().max(2000).nullish(),
      ownerTeamMemberId: z.number().int().nullish(),
      ownerName: z.string().max(120).nullish(),
      dueAt: z.string().nullish(),
    }),
  ),
  async (c) => {
    const row = await updateAction(idParam(c.req.param("id")), c.req.valid("json"));
    if (!row) throw new HTTPException(404, { message: "No such action" });
    return c.json({ data: row, error: null });
  },
);

/** Point every fact an older contract stated at the newer contract's figure. Idempotent. */
corpusRoutes.post("/supersede", async (c) => c.json({ data: await supersedeByNewerDocument(), error: null }));

// ─── Fact-check ──────────────────────────────────────

corpusRoutes.post("/check", zValidator("json", z.object({ claim: z.string().min(3).max(2000) })), async (c) => {
  return c.json({ data: await checkClaim(c.req.valid("json").claim), error: null });
});

// ─── Templates ───────────────────────────────────────

corpusRoutes.get("/template", async (c) => c.json({ data: await listTemplate(c.req.query("kind") || undefined), error: null }));

corpusRoutes.post(
  "/template",
  zValidator(
    "json",
    z.object({
      kind: z.enum(TEMPLATE_KIND),
      name: z.string().min(1).max(255),
      body: z.string().min(1),
      sourceExternalId: z.string().max(255).nullish(),
      sourceKind: z.enum(SOURCE_KIND).nullish(),
    }),
  ),
  async (c) => {
    const user = c.get("user");
    const result = await upsertTemplate(c.req.valid("json"), user.userId);
    return c.json({ data: result, error: null }, result.isNew ? 201 : 200);
  },
);

corpusRoutes.post(
  "/template/:id/render",
  zValidator("json", z.object({ value: z.record(z.union([z.string(), z.number(), z.null()])) })),
  async (c) => {
    const tpl = await getTemplate(idParam(c.req.param("id")));
    if (!tpl) throw new HTTPException(404, { message: "No such template" });
    const rendered = renderTemplate(tpl.body, c.req.valid("json").value);
    return c.json({ data: { corpusTemplateId: tpl.corpusTemplateId, kind: tpl.kind, name: tpl.name, ...rendered }, error: null });
  },
);
