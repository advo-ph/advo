import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import type { Variables } from "../types/context.js";
import {
  SOFT_BOUNCE_LIMIT,
  createCampaign,
  getCampaign,
  listCampaign,
  listRecipient,
  materializeRecipient,
  previewCampaign,
  recordDeliveryFailure,
  recordSoftBounce,
  sendCampaign,
  suppress,
  suppressionSet,
  unsubscribeByToken,
} from "../services/campaign.service.js";

const campaignRoutes = new Hono<{ Variables: Variables }>();

const segmentSchema = z.object({
  status: z.array(z.string().min(1).max(40)).max(10).optional(),
  isOutdatedOnly: z.boolean().optional(),
  limitCount: z.number().int().positive().max(100000).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().min(1).max(255),
  bodyHtml: z.string().min(1).max(200000),
  segment: segmentSchema.default({}),
  ratePerHour: z.number().int().positive().max(5000).optional(),
});

// ─── Public ──────────────────────────────────────────
//
// The unsubscribe route is deliberately mounted BEFORE the auth middleware. A one-click
// unsubscribe that requires a login is not an unsubscribe. The token is random per
// recipient and does not encode the address.

campaignRoutes.get("/unsubscribe/:token", async (c) => {
  const token = c.req.param("token");
  const isFound = await unsubscribeByToken(token);

  // Always render success. Distinguishing a valid token from an invalid one would turn
  // this public endpoint into an oracle for guessing tokens.
  const message = isFound
    ? "You have been unsubscribed. We will not contact this address again."
    : "This link is no longer active. If you are still receiving mail from us, reply to any message and we will remove you.";

  return c.html(
    `<!doctype html><html lang="en"><head><meta charset="utf-8" />
     <meta name="viewport" content="width=device-width, initial-scale=1" />
     <title>Unsubscribed — ADVO</title></head>
     <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:64px 24px;color:#1a1a1a;">
       <strong style="font-size:20px;">ADVO</strong>
       <h1 style="font-size:22px;margin:24px 0 12px;">${isFound ? "Unsubscribed" : "Link expired"}</h1>
       <p style="color:#555;line-height:1.6;">${message}</p>
     </body></html>`,
  );
});

// ─── Team-only ───────────────────────────────────────

campaignRoutes.use("*", requireAuth, requireTeam);

campaignRoutes.get("/", async (c) => {
  return c.json({ data: await listCampaign(), error: null });
});

/** DRY-RUN. Resolves the segment and counts. Sends nothing, writes nothing. */
campaignRoutes.post("/preview", zValidator("json", segmentSchema), async (c) => {
  const segment = c.req.valid("json");
  return c.json({ data: await previewCampaign(segment), error: null });
});

campaignRoutes.get("/suppression", async (c) => {
  const set = await suppressionSet();
  return c.json({ data: { suppressedCount: set.size, email: [...set] }, error: null });
});

campaignRoutes.post(
  "/suppression",
  zValidator("json", z.object({ email: z.string().email(), note: z.string().max(500).optional() })),
  async (c) => {
    const { email, note } = c.req.valid("json");
    await suppress(email, "manual", undefined, note);
    return c.json({ data: { email, isSuppressed: true }, error: null });
  },
);

campaignRoutes.post("/", zValidator("json", createSchema), async (c) => {
  const input = c.req.valid("json");
  const row = await createCampaign(input);
  return c.json({ data: row, error: null }, 201);
});

const idParam = (c: { req: { param: (k: string) => string } }) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) throw new HTTPException(400, { message: "Invalid id" });
  return id;
};

campaignRoutes.get("/:id", async (c) => {
  const id = idParam(c);
  const row = await getCampaign(id);
  return c.json({ data: { ...row, recipient: await listRecipient(id) }, error: null });
});

/** Materialize recipient rows. Idempotent — safe to call twice. */
campaignRoutes.post("/:id/materialize", async (c) => {
  const id = idParam(c);
  const recipientCount = await materializeRecipient(id);
  return c.json({ data: { campaignId: id, recipientCount }, error: null });
});

/**
 * Run a send pass. Throttled and resumable — call again to continue a paused campaign.
 * Errors loudly when no outreach transport is configured; it never falls back to the
 * transactional transport.
 */
campaignRoutes.post(
  "/:id/send",
  zValidator("json", z.object({ maxCount: z.number().int().positive().max(5000).optional() }).default({})),
  async (c) => {
    const id = idParam(c);
    const { maxCount } = c.req.valid("json");
    return c.json({ data: await sendCampaign(id, { maxCount }), error: null });
  },
);

/**
 * ESP bounce / complaint callback. Feeds the permanent suppression list.
 *
 * Three kinds, two behaviours. A hard bounce or a complaint suppresses on the FIRST
 * report — the address is dead or the recipient asked us to stop, and neither improves
 * with retries. A soft bounce is temporary by definition, so it increments a per-address
 * counter and only suppresses once that counter reaches SOFT_BOUNCE_LIMIT.
 *
 * The response reports the REAL outcome. It used to hard-code isSuppressed: true, which
 * was accurate while the only kinds were terminal; a soft bounce under the limit is not
 * suppressed, and telling the ESP otherwise would make the one field it can read a lie.
 * softBounceCount is returned so an operator can see how close an address is to the edge.
 */
campaignRoutes.post(
  "/delivery-failure",
  zValidator(
    "json",
    z.object({
      email: z.string().email(),
      kind: z.enum(["hard_bounce", "soft_bounce", "complaint"]),
      campaignId: z.number().int().positive().optional(),
    }),
  ),
  async (c) => {
    const { email, kind, campaignId } = c.req.valid("json");

    if (kind === "soft_bounce") {
      const result = await recordSoftBounce(email, campaignId);
      return c.json({
        data: {
          email,
          kind,
          isSuppressed: result.isSuppressed,
          softBounceCount: result.softBounceCount,
          softBounceLimit: SOFT_BOUNCE_LIMIT,
        },
        error: null,
      });
    }

    await recordDeliveryFailure(email, kind, campaignId);
    return c.json({ data: { email, kind, isSuppressed: true }, error: null });
  },
);

export default campaignRoutes;
