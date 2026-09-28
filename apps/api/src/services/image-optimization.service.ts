import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const cacheDirectory = join(tmpdir(), "advo-image-cache");
const WEBP_QUALITY = 78;

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
