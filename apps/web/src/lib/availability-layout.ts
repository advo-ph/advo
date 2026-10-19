type Slot = {
  block: { block_id: number; day_of_week: number };
  start: number;
  top: number;
  end: number;
};

/** Keep each connected overlap group in stable, chronological columns. */
export function layoutAvailabilitySlots<T extends Slot>(slots: T[]) {
  const result: (T & { column: number; columns: number })[] = [];
  const sorted = [...slots].sort((a, b) =>
    a.block.day_of_week - b.block.day_of_week || a.start - b.start ||
    a.block.block_id - b.block.block_id,
  );
  let group: typeof result = [];
  let columnEnds: number[] = [];
  let groupEnd = -1;
  let day = -1;

  const flush = () => {
    for (const slot of group) slot.columns = columnEnds.length;
    result.push(...group);
    group = [];
    columnEnds = [];
    groupEnd = -1;
  };

  for (const slot of sorted) {
    if (slot.block.day_of_week !== day || slot.top >= groupEnd) flush();
    day = slot.block.day_of_week;
    let column = columnEnds.findIndex((end) => end <= slot.top);
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = slot.end;
    groupEnd = Math.max(groupEnd, slot.end);
    group.push({ ...slot, column, columns: 1 });
  }
  flush();
  return result;
}
