import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";

/**
 * Per-member delivery accountability, derived server-side from deliverable rows
 * that already exist. Nothing is tracked or collected for this view.
 *
 * `onTimeRate` is deliberately nullable: below the API's small-sample floor
 * (`onTimeMinSample`) no rate is returned, because "100% on time" off one
 * deliverable is a confident wrong statement about a colleague. Render
 * `onTimeCount / gradableCount` in that case — never a percentage.
 */
export interface AccountabilityRow {
  team_member_id: number;
  name: string;
  role: string;
  avatar_url?: string | null;
  penalty_point_count: number;
  assigned_count: number;
  open_count: number;
  overdue_count: number;
  blocked_count: number;
  completed_count: number;
  verified_count: number;
  on_time_count: number;
  /** Denominator behind on_time_rate: completed AND had a due date. */
  gradable_count: number;
  /** null when gradable_count is below the min sample. */
  on_time_rate: number | null;
  last_completed_at: string | null;
  last_activity_at: string | null;
  /** Ranking weight only — overdue-dominant. Not a grade. */
  behind_score: number;
}

export interface Accountability {
  row: AccountabilityRow[];
  on_time_min_sample: number;
  as_of: string;
}

interface RawRow {
  teamMemberId: number;
  name: string;
  role: string;
  avatarUrl?: string | null;
  penaltyPointCount: number;
  assignedCount: number;
  openCount: number;
  overdueCount: number;
  blockedCount: number;
  completedCount: number;
  verifiedCount: number;
  onTimeCount: number;
  gradableCount: number;
  onTimeRate: number | null;
  lastCompletedAt: string | null;
  lastActivityAt: string | null;
  behindScore: number;
}

interface RawAccountability {
  row: RawRow[];
  onTimeMinSample: number;
  asOf: string;
}

const mapRow = (r: RawRow): AccountabilityRow => ({
  team_member_id: r.teamMemberId,
  name: r.name,
  role: r.role,
  avatar_url: r.avatarUrl ?? null,
  penalty_point_count: r.penaltyPointCount,
  assigned_count: r.assignedCount,
  open_count: r.openCount,
  overdue_count: r.overdueCount,
  blocked_count: r.blockedCount,
  completed_count: r.completedCount,
  verified_count: r.verifiedCount,
  on_time_count: r.onTimeCount,
  gradable_count: r.gradableCount,
  on_time_rate: r.onTimeRate,
  last_completed_at: r.lastCompletedAt,
  last_activity_at: r.lastActivityAt,
  behind_score: r.behindScore,
});

/** "3d ago" / "just now" / "—". Coarse on purpose: precision here implies surveillance. */
export function sinceLabel(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  const day = Math.floor(ms / 86_400_000);
  if (day >= 30) return `${Math.floor(day / 30)}mo ago`;
  if (day >= 1) return `${day}d ago`;
  const hour = Math.floor(ms / 3_600_000);
  if (hour >= 1) return `${hour}h ago`;
  return "just now";
}

export function useAccountability() {
  const query = useQuery({
    queryKey: ["accountability"],
    queryFn: async (): Promise<Accountability> => {
      const res = await get<RawAccountability>("/api/team/accountability");
      const raw = res.data;
      return {
        row: (raw?.row ?? []).map(mapRow),
        on_time_min_sample: raw?.onTimeMinSample ?? 5,
        as_of: raw?.asOf ?? new Date().toISOString(),
      };
    },
  });

  return {
    accountability: query.data ?? null,
    row: query.data?.row ?? [],
    minSample: query.data?.on_time_min_sample ?? 5,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
