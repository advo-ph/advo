export interface TaskOrderItem {
  deliverable_id: number;
  status: string;
  sort_order: number;
}

function compareTaskOrder(a: TaskOrderItem, b: TaskOrderItem): number {
  return a.sort_order - b.sort_order || b.deliverable_id - a.deliverable_id;
}

/** Move one visible task before another, or to the end when targetId is null. */
export function moveTaskId(
  ids: readonly number[],
  draggedId: number,
  targetId: number | null,
): number[] {
  const next = ids.filter((id) => id !== draggedId);
  const targetIndex = targetId === null ? next.length : next.indexOf(targetId);
  next.splice(targetIndex < 0 ? next.length : targetIndex, 0, draggedId);
  return next;
}

/**
 * Apply a filtered view's order to the full query cache.
 *
 * The visible ids keep the slots they already occupy among the full status
 * list, so reordering "My Tasks" never scrambles tasks hidden by the filter.
 */
export function applyVisibleTaskOrder<T extends TaskOrderItem>(
  items: readonly T[],
  status: string,
  orderedVisibleIds: readonly number[],
): T[] {
  const statusItems = items
    .filter((item) => item.status === status)
    .sort(compareTaskOrder);
  const statusIds = statusItems.map((item) => item.deliverable_id);
  const statusIdSet = new Set(statusIds);
  const requestedIds = orderedVisibleIds.filter((id) => statusIdSet.has(id));
  const positions = requestedIds
    .map((id) => statusIds.indexOf(id))
    .filter((position) => position >= 0)
    .sort((a, b) => a - b);

  if (requestedIds.length === 0) return [...items];

  const nextStatusIds = [...statusIds];
  requestedIds.forEach((id, index) => {
    nextStatusIds[positions[index]] = id;
  });

  const statusItemsById = new Map(statusItems.map((item) => [item.deliverable_id, item]));
  const nextStatusById = new Map(
    nextStatusIds.map((id, index) => {
      const item = statusItemsById.get(id)!;
      return [id, { ...item, sort_order: index }];
    }),
  );

  return items.map((item) =>
    item.status === status ? nextStatusById.get(item.deliverable_id)! : item,
  );
}
