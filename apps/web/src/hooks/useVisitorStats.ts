/**
 * Reads GET /api/visitor-stats/{summary,pages,sections,scroll-depth,geo} for the admin
 * "Web Statistics" surface (process/general-plans/active/
 * visitor-analytics_PLAN_09-10-26.md §4.7-4.8).
 */
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";

export interface DaySummary {
  date: string;
  uniqueVisitorCount: number;
  sessionCount: number;
  pageViewCount: number;
}

export interface SummaryReport {
  from: string;
  to: string;
  uniqueVisitorCount: number;
  sessionCount: number;
  pageViewCount: number;
  byDay: DaySummary[];
}

export interface PageRow {
  path: string;
  viewCount: number;
  sessionCount: number;
}

export interface SectionRow {
  section: string;
  viewCount: number;
  avgDwellSecond: number | null;
}

export interface ScrollDepthRow {
  milestone: 25 | 50 | 75 | 100;
  reachedSessionCount: number;
}

export interface GeoCountryRow {
  country: string;
  viewCount: number;
}

export interface GeoCityRow {
  country: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  viewCount: number;
}

export interface GeoReport {
  countries: GeoCountryRow[];
  cities: GeoCityRow[];
}

function rangeFor(windowDay: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - windowDay * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * One hook, one date range, five queries — mirrors useEngagement.ts's shape (typed
 * response interfaces, the hook is the seam between wire shape and what components see).
 */
export function useVisitorStats(windowDay = 30) {
  const { from, to } = rangeFor(windowDay);
  const query = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  const summary = useQuery({
    queryKey: ["visitor-stats", "summary", windowDay],
    queryFn: async (): Promise<SummaryReport> => {
      const res = await get<SummaryReport>(`/api/visitor-stats/summary${query}`);
      if (res.error || !res.data) throw new Error(res.error || "Could not load visitor summary.");
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const pages = useQuery({
    queryKey: ["visitor-stats", "pages", windowDay],
    queryFn: async (): Promise<PageRow[]> => {
      const res = await get<PageRow[]>(`/api/visitor-stats/pages${query}`);
      if (res.error || !res.data) throw new Error(res.error || "Could not load top pages.");
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const sections = useQuery({
    queryKey: ["visitor-stats", "sections", windowDay],
    queryFn: async (): Promise<SectionRow[]> => {
      const res = await get<SectionRow[]>(`/api/visitor-stats/sections${query}`);
      if (res.error || !res.data) throw new Error(res.error || "Could not load landing sections.");
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const scrollDepth = useQuery({
    queryKey: ["visitor-stats", "scroll-depth", windowDay],
    queryFn: async (): Promise<ScrollDepthRow[]> => {
      const res = await get<ScrollDepthRow[]>(`/api/visitor-stats/scroll-depth${query}`);
      if (res.error || !res.data) throw new Error(res.error || "Could not load the scroll-depth funnel.");
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const geo = useQuery({
    queryKey: ["visitor-stats", "geo", windowDay],
    queryFn: async (): Promise<GeoReport> => {
      const res = await get<GeoReport>(`/api/visitor-stats/geo${query}`);
      if (res.error || !res.data) throw new Error(res.error || "Could not load visitor geo.");
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    summary: summary.data ?? null,
    pages: pages.data ?? [],
    sections: sections.data ?? [],
    scrollDepth: scrollDepth.data ?? [],
    geo: geo.data ?? null,
    isLoading:
      summary.isLoading || pages.isLoading || sections.isLoading || scrollDepth.isLoading || geo.isLoading,
    error:
      summary.error instanceof Error
        ? summary.error.message
        : geo.error instanceof Error
          ? geo.error.message
          : null,
    refetch: () => {
      void summary.refetch();
      void pages.refetch();
      void sections.refetch();
      void scrollDepth.refetch();
      void geo.refetch();
    },
  };
}
