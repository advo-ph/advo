const PORTFOLIO_IMAGE_WIDTHS = [480, 960, 1440] as const;
const AVATAR_IMAGE_WIDTHS = [160, 320] as const;
const UPLOAD_IMAGE_PATH = /\/uploads\/(portfolio|avatars)\/[^/?#]+\.(?:jpe?g|png|webp|avif)$/i;

function getUploadBucket(source: string): "portfolio" | "avatars" | null {
  try {
    const url = new URL(source, "https://advo.ph");
    const bucket = UPLOAD_IMAGE_PATH.exec(url.pathname)?.[1]?.toLowerCase();
    if (bucket === "portfolio" || bucket === "avatars") return bucket;
    return null;
  } catch {
    return null;
  }
}

export function getResponsiveImageUrl(source: string, width: number): string {
  const bucket = getUploadBucket(source);
  if (!bucket) return source;

  try {
    const url = new URL(source, "https://advo.ph");
    url.searchParams.set("width", String(width));

    if (source.startsWith("//")) return `//${url.host}${url.pathname}${url.search}${url.hash}`;
    if (source.startsWith("/")) return `${url.pathname}${url.search}${url.hash}`;
    return url.toString();
  } catch {
    return source;
  }
}

export function getResponsiveImageSrcSet(source: string): string | undefined {
  const bucket = getUploadBucket(source);
  if (!bucket) return undefined;

  const widths = bucket === "avatars" ? AVATAR_IMAGE_WIDTHS : PORTFOLIO_IMAGE_WIDTHS;
  return widths
    .map((width) => `${getResponsiveImageUrl(source, width)} ${width}w`)
    .join(", ");
}
