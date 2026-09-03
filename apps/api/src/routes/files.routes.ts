import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import { nanoid } from "nanoid";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/rbac.js";
import { env } from "../utils/env.js";
import { createLogger } from "../utils/logger.js";
import type { Variables } from "../types/context.js";

const log = createLogger("files");
const files = new Hono<{ Variables: Variables }>();

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/heic",
  "image/heif",
  "image/avif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/ogg",
  // Audio — meeting recordings (mp3 / m4a). Browsers report these inconsistently
  // so we accept all common variants.
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
]);

const BUCKET_LIMITS: Record<string, number> = {
  avatars: 5 * 1024 * 1024, // 5MB
  portfolio: 100 * 1024 * 1024, // 100MB
  assets: 25 * 1024 * 1024, // 25MB
  recordings: 500 * 1024 * 1024, // 500MB — long meeting recordings
};

files.post("/upload", requireAuth, async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  const bucket = (formData.get("bucket") as string) || "assets";

  if (!file) throw new HTTPException(400, { message: "No file provided" });

  if (!ALLOWED_TYPES.has(file.type)) {
    throw new HTTPException(400, {
      message: `File type ${file.type} not allowed`,
    });
  }

  const maxSize = BUCKET_LIMITS[bucket] || BUCKET_LIMITS.assets;
  if (file.size > maxSize) {
    throw new HTTPException(400, {
      message: `File exceeds ${Math.round(maxSize / 1024 / 1024)}MB limit`,
    });
  }

  const uploadDir = join(env().UPLOAD_DIR, bucket);
  if (!existsSync(uploadDir)) {
    await mkdir(uploadDir, { recursive: true });
  }

  const ext = extname(file.name) || ".bin";
  const filename = `${Date.now()}-${nanoid(8)}${ext}`;
  const filepath = join(uploadDir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  const url = `${env().API_URL}/uploads/${bucket}/${filename}`;
  log.info({ bucket, filename, size: file.size }, "File uploaded");

  return c.json({ data: { url, filename, bucket }, error: null }, 201);
});

files.delete("/:bucket/:filename", requireAuth, requireAdmin, async (c) => {
  const bucket = c.req.param("bucket");
  const filename = c.req.param("filename");

  // Prevent path traversal
  if (filename.includes("..") || filename.includes("/")) {
    throw new HTTPException(400, { message: "Invalid filename" });
  }

  const filepath = join(env().UPLOAD_DIR, bucket, filename);

  try {
    await unlink(filepath);
    log.info({ bucket, filename }, "File deleted");
    return c.json({ data: { message: "File deleted" }, error: null });
  } catch {
    throw new HTTPException(404, { message: "File not found" });
  }
});

export default files;
