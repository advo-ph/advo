/** Build a clickable Plaud share URL from whatever we stored. */
export function plaudShareUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.includes("://")) return key;
  if (key.includes("::") || key.startsWith("pub_") || key.startsWith("pri_")) {
    return `https://web.plaud.ai/s/${key}`;
  }
  return `https://app.plaud.ai/share/${encodeURIComponent(key)}`;
}
