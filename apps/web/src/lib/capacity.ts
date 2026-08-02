/**
 * Pure helpers for per-member project load + remaining capacity.
 * No network — unit-testable in isolation.
 */

export type CapacityProject = {
  teamMemberId?: number[];
  projectStatus?: string;
};

/**
 * Count projects per team member id.
 * If activeOnly (default true), exclude projectStatus === "shipped".
 */
export function projectCountByMember(
  project: CapacityProject[],
  activeOnly = true,
): Map<number, number> {
  const map = new Map<number, number>();
  for (const row of project) {
    if (activeOnly && row.projectStatus === "shipped") continue;
    for (const teamMemberId of row.teamMemberId ?? []) {
      map.set(teamMemberId, (map.get(teamMemberId) ?? 0) + 1);
    }
  }
  return map;
}

/** max(0, cap - activeProjectCount); default cap is 3. */
export function capacityRemaining(activeProjectCount: number, cap = 3): number {
  return Math.max(0, cap - activeProjectCount);
}
