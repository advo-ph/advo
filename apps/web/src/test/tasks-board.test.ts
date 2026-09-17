import { describe, expect, it } from "vitest";
import { applyVisibleTaskOrder, moveTaskId } from "@/lib/task-order";

const item = (id: number, sortOrder: number, status = "todo") => ({
  deliverable_id: id,
  status,
  sort_order: sortOrder,
});

describe("Tasks board ordering", () => {
  it("moves a dragged task before a target or to the end", () => {
    expect(moveTaskId([1, 2, 3], 3, 1)).toEqual([3, 1, 2]);
    expect(moveTaskId([1, 2, 3], 1, null)).toEqual([2, 3, 1]);
  });

  it("reorders visible tasks without moving hidden tasks out of their slots", () => {
    const current = [item(10, 0), item(20, 0), item(11, 1), item(21, 1)];
    const next = applyVisibleTaskOrder(current, "todo", [11, 10]);

    expect(next.map((task) => task.deliverable_id)).toEqual([10, 20, 11, 21]);
    expect(
      next
        .filter((task) => task.status === "todo")
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((task) => task.deliverable_id),
    ).toEqual([20, 11, 21, 10]);
    expect(
      next
        .filter((task) => task.status === "todo")
        .sort((a, b) => a.sort_order - b.sort_order)
        .filter((task) => [11, 10].includes(task.deliverable_id))
        .map((task) => task.deliverable_id),
    ).toEqual([11, 10]);
  });
});
