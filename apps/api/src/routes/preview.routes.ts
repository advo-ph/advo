import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { project } from "../db/schema.js";
import { verifyPreviewToken } from "../services/preview.service.js";

// Public: resolves a signed "Show Client Now" token to the project's preview.
const preview = new Hono();

function gatePage(heading: string, message: string, status: 404 | 410) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>ADVO Preview</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#fafafa;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}div{text-align:center;max-width:440px;padding:32px}strong{font-size:22px;letter-spacing:.04em}h1{font-size:20px;margin:24px 0 8px}p{color:#a1a1aa;line-height:1.6;margin:0}</style></head><body><div><strong>ADVO</strong><h1>${heading}</h1><p>${message}</p></div></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

preview.get("/:token", async (c) => {
  const projectId = await verifyPreviewToken(c.req.param("token"));
  if (!projectId) {
    return gatePage(
      "Preview link expired",
      "This preview link is no longer valid. Ask the ADVO team for a fresh one.",
      410,
    );
  }

  const [row] = await db()
    .select({ previewUrl: project.previewUrl })
    .from(project)
    .where(eq(project.projectId, projectId))
    .limit(1);

  if (!row?.previewUrl) {
    return gatePage("Nothing to preview yet", "This project doesn't have a live preview to show.", 404);
  }

  return c.redirect(row.previewUrl, 302);
});

export default preview;
