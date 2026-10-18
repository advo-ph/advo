/** Build a clickable Plaud share URL from whatever we stored. */
export function plaudShareUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.includes("://")) return key;
  if (key.includes("::") || key.startsWith("pub_") || key.startsWith("pri_")) {
    return `https://web.plaud.ai/s/${key}`;
  }
  return `https://app.plaud.ai/share/${encodeURIComponent(key)}`;
}

/** The share link when one was made, else the owner's own Plaud page for the file id. */
export function plaudMeetingUrl(meeting: {
  plaudShareKey?: string | null;
  plaudFileId?: string | null;
}): string | null {
  return (
    plaudShareUrl(meeting.plaudShareKey) ??
    (meeting.plaudFileId ? `https://web.plaud.ai/file/${encodeURIComponent(meeting.plaudFileId)}` : null)
  );
}
