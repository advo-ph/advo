/** Section ids under the admin sidebar Tools group. */
export const TOOLS_SECTION = ["brand-scraper", "fb-scraper"] as const;

export type ToolsSection = (typeof TOOLS_SECTION)[number];

/** True when the active admin section is a Tools (scraper) item. */
export function isToolsSection(section: string): section is ToolsSection {
  return (TOOLS_SECTION as readonly string[]).includes(section);
}
