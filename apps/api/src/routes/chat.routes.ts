import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware/auth.js";
import { requireOwner } from "../middleware/rbac.js";
import { answerOption, isAskAvailable, listMessages, sendOwnerText, type ChatChannel } from "../services/chat.service.js";
import type { Variables } from "../types/context.js";

const chatRoutes = new Hono<{ Variables: Variables }>();

// Owner-only, end to end — the widget never shows for anyone else.
chatRoutes.use("*", requireAuth, requireOwner);

const channelSchema = z.enum(["updates", "ask"]);

chatRoutes.get("/messages", async (c) => {
  const channelParam = c.req.query("channel");
  const parsed = channelSchema.safeParse(channelParam);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "channel must be 'updates' or 'ask'" });
  }
  const channel: ChatChannel = parsed.data;

  const afterParam = c.req.query("after");
  let after: number | null = null;
  if (afterParam !== undefined) {
    after = Number(afterParam);
    if (Number.isNaN(after)) throw new HTTPException(400, { message: "Invalid after cursor" });
  }

  const rows = await listMessages(channel, after);
  // Additive field, not part of the {data, error} envelope contract — lets the
  // widget show "Ask is off" before the owner even types, instead of only
  // finding out after a round trip (chat.service.ts's ASK_FALLBACK_NO_KEY).
  return c.json({ data: rows, error: null, askAvailable: isAskAvailable() });
});

const postSchema = z.object({
  channel: channelSchema,
  body: z.string().min(1).max(4000),
});

chatRoutes.post("/messages", zValidator("json", postSchema), async (c) => {
  const data = c.req.valid("json");
  const user = c.get("user");
  const row = await sendOwnerText(data.channel, data.body, user.userId);
  return c.json({ data: row, error: null }, 201);
});

const answerSchema = z.object({
  optionId: z.string().min(1).max(50),
});

chatRoutes.post("/messages/:id/answer", zValidator("json", answerSchema), async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) throw new HTTPException(400, { message: "Invalid message id" });
  const data = c.req.valid("json");
  const user = c.get("user");
  const row = await answerOption(id, data.optionId, user.userId);
  return c.json({ data: row, error: null });
});

export default chatRoutes;
