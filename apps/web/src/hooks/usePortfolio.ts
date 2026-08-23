/**
 * Public read of the ADVO portfolio database.
 *
 * `GET /api/content/portfolio` is already unauthenticated (content.routes.ts),
 * so the landing can show the sites we actually shipped without a session.
 * `useAdminPortfolio` stays the write-side hook for the admin console; this one
 * is read-only and never invents a project — an empty table renders nothing.
 */
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";

/** "short and concise and simple descs only" — one line, never a paragraph. */
export const SHIPPED_DESC_LIMIT = 120;

export interface ShippedProject {
  portfolio_project_id: number;
  title: string;
  slug: string | null;
  /** Already clamped to SHIPPED_DESC_LIMIT. */
  blurb: string;
  live_url: string | null;
  screenshotUrl: string | null;
  display_order: number;
}

const clamp = (text: string) => {
  if (text.length <= SHIPPED_DESC_LIMIT) return text;
  const head = text.slice(0, SHIPPED_DESC_LIMIT - 1);
  const lastSpace = head.lastIndexOf(" ");
  // Cut on a word, never mid-word — a card that reads "from OPD, nurse..." looks
  // broken rather than concise.
  return `${(lastSpace > 40 ? head.slice(0, lastSpace) : head).replace(/[,;:.\s]+$/, "")}…`;
};

function mapShipped(row: Record<string, unknown>): ShippedProject {
  const primaryImage = (row.imageUrl ?? row.image_url ?? null) as string | null;
  const galleryImage = (row.imageUrls ?? row.image_urls ?? null) as string[] | null;

  return {
    portfolio_project_id: (row.portfolioProjectId ?? row.portfolio_project_id) as number,
    title: ((row.title as string) || "").trim(),
    slug: ((row.slug as string) || null),
    blurb: clamp(((row.description as string) || "").trim()),
    live_url: (((row.previewUrl ?? row.preview_url) as string) || null),
    screenshotUrl: primaryImage || galleryImage?.[0] || null,
    display_order: Number(row.displayOrder ?? row.display_order ?? 0),
  };
}

async function fetchShipped(): Promise<ShippedProject[]> {
  const res = await get<Record<string, unknown>[]>("/api/content/portfolio");
  return (res.data || [])
    .map(mapShipped)
    // A row with no screenshot is not "a large screenshot with one short line".
    .filter((item) => Boolean(item.title && item.screenshotUrl))
    .sort((a, b) => a.display_order - b.display_order);
}

export function usePortfolio() {
  const { data: project = [], isLoading } = useQuery({
    queryKey: ["publicPortfolio"],
    queryFn: fetchShipped,
    staleTime: 5 * 60 * 1000,
  });

  return { project, isLoading };
}
