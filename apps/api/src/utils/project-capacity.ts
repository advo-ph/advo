/**
 * Pure helpers for attaching project_access team members to project list rows.
 * No DB — unit-testable in isolation.
 */

export type ProjectAccessRow = {
  projectId: number;
  teamMemberId: number;
};

/**
 * Build projectId → teamMemberId[] for the given project ids.
 * Every id in projectIdList gets an entry (empty array if no access rows).
 * Access rows for projects not in projectIdList are ignored.
 */
export function mapProjectTeamMemberId(
  projectIdList: number[],
  access: ProjectAccessRow[],
): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const projectId of projectIdList) {
    map.set(projectId, []);
  }
  for (const row of access) {
    const list = map.get(row.projectId);
    if (list) list.push(row.teamMemberId);
  }
  return map;
}

/**
 * Attach `teamMemberId: number[]` to each project row from access rows.
 * Field name is singular (collection still singular per project convention).
 */
export function attachTeamMemberId<T extends { projectId: number }>(
  projectRow: T[],
  access: ProjectAccessRow[],
): (T & { teamMemberId: number[] })[] {
  const map = mapProjectTeamMemberId(
    projectRow.map((p) => p.projectId),
    access,
  );
  return projectRow.map((p) => ({
    ...p,
    teamMemberId: map.get(p.projectId) ?? [],
  }));
}
