/**
 * Client-hub engagement — "who has gone quiet".
 *
 * Reads GET /api/event/engagement, the admin-gated aggregate over analytics_event joined
 * to client. The server already sorts STALEST FIRST and already computes staleDay, so this
 * hook deliberately does not re-sort or re-derive: two places computing "days since" is two
 * places to disagree.
 */
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";

/** The client-facing document a bucket of paths represents. */
export type EngagementSurface =
  | "proposal"
  | "contract"
  | "preview"
  | "invoice"
  | "portal"
  | "other";

export interface EngagementSurfaceRow {
  surface: EngagementSurface;
  view_count: number;
  session_count: number;
  /** ISO timestamp of the most recent view of this surface. */
  last_seen_at: string | null;
  /** Whole days since that view. Null when unknown — never a stand-in 0. */
  stale_day: number | null;
}

export interface EngagementRow {
  client_id: number;
  company_name: string;
  contact_email: string | null;
  last_seen_at: string | null;
  /** Whole days since the client's most recent activity. Null = nothing in the window. */
  stale_day: number | null;
  view_count: number;
  session_count: number;
  /** True when the client generated no event at all in the window. */
  is_silent: boolean;
  surface: EngagementSurfaceRow[];
}

export interface EngagementReport {
  window_day: number;
  generated_at: string;
  client_count: number;
  silent_count: number;
  engagement: EngagementRow[];
}

interface ApiSurface {
  surface: EngagementSurface;
  viewCount: number;
  sessionCount: number;
  lastSeenAt: string | null;
  staleDay: number | null;
}

interface ApiEngagement {
  clientId: number;
  companyName: string;
  contactEmail: string | null;
  lastSeenAt: string | null;
  staleDay: number | null;
  viewCount: number;
  sessionCount: number;
  isSilent: boolean;
  surface: ApiSurface[];
}

interface ApiReport {
  windowDay: number;
  generatedAt: string;
  clientCount: number;
  silentCount: number;
  engagement: ApiEngagement[];
}

const QUERY_KEY = "engagement";

function mapReport(raw: ApiReport): EngagementReport {
  return {
    window_day: raw.windowDay,
    generated_at: raw.generatedAt,
    client_count: raw.clientCount,
    silent_count: raw.silentCount,
    engagement: (raw.engagement || []).map((e) => ({
      client_id: e.clientId,
      company_name: e.companyName,
      contact_email: e.contactEmail ?? null,
      last_seen_at: e.lastSeenAt ?? null,
      stale_day: e.staleDay ?? null,
      view_count: e.viewCount,
      session_count: e.sessionCount,
      is_silent: e.isSilent,
      surface: (e.surface || []).map((s) => ({
        surface: s.surface,
        view_count: s.viewCount,
        session_count: s.sessionCount,
        last_seen_at: s.lastSeenAt ?? null,
        stale_day: s.staleDay ?? null,
      })),
    })),
  };
}

/** `windowDay` is the look-back the server clamps to 1..365. */
export function useEngagement(windowDay = 90) {
  const query = useQuery({
    queryKey: [QUERY_KEY, windowDay],
    queryFn: async (): Promise<EngagementReport> => {
      const res = await get<ApiReport>(`/api/event/engagement?day=${windowDay}`);
      if (res.error) throw new Error(res.error);
      return mapReport(res.data);
    },
    // Engagement moves on the scale of hours, not seconds — a tight refetch would cost the
    // VPS a full aggregate for a number that has not changed.
    staleTime: 5 * 60 * 1000,
  });

  return {
    report: query.data ?? null,
    engagement: query.data?.engagement ?? [],
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}
