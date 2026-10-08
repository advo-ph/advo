import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import sharp from "sharp";

const cacheDirectory = join(tmpdir(), "advo-image-cache");
const WEBP_QUALITY = 78;
const IMAGE_FILE = /\.(?:jpe?g|png|webp|avif)$/i;

export const UPLOAD_IMAGE_WIDTHS: Record<string, number[]> = {
  avatars: [160, 320, 640, 960],
  portfolio: [480, 960, 1440],
};

/** Builds every resized copy of one upload so the first visitor does not wait. */
export async function warmUploadImage(bucket: string, imagePath: string): Promise<void> {
  const widths = UPLOAD_IMAGE_WIDTHS[bucket];
  if (!widths || !IMAGE_FILE.test(imagePath)) return;
  for (const width of widths) await getOptimizedUploadImage(imagePath, width);
}

/** Builds missing resized copies for a whole bucket, one image at a time. */
export async function warmUploadBucket(uploadDir: string, bucket: string): Promise<void> {
  const bucketPath = join(uploadDir, bucket);
  const filenames = await readdir(bucketPath).catch(() => [] as string[]);
  for (const filename of filenames) {
    await warmUploadImage(bucket, join(bucketPath, filename)).catch(() => undefined);
  }
}

export async function getOptimizedUploadImage(
  imagePath: string,
  width: number,
): Promise<Buffer> {
  const sourceStat = await stat(imagePath);

  const cacheKey = createHash("sha256")
    .update(`${imagePath}:${sourceStat.size}:${sourceStat.mtimeMs}:${width}:${WEBP_QUALITY}`)
    .digest("hex");
  const cachedPath = join(cacheDirectory, `${cacheKey}.webp`);
  const temporaryPath = `${cachedPath}.${randomUUID()}.tmp`;

  try {
    return await readFile(cachedPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const image = await sharp(imagePath, { failOn: "none" })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toBuffer();

  await mkdir(cacheDirectory, { recursive: true });
  try {
    await writeFile(temporaryPath, image, { flag: "wx" });
    await rename(temporaryPath, cachedPath);
  } catch (error) {
    // Another request can finish the same variant first. Its cache file is
    // already complete, so discard this request's temporary copy.
    await unlink(temporaryPath).catch(() => undefined);
    return readFile(cachedPath).catch(() => {
      throw error;
    });
  }

  return image;
}
