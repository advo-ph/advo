/**
 * Pure helpers for Admin Projects create/edit form mode.
 * Full-page form replaces the former Dialog modal for high-field project CRUD.
 */

export type ProjectFormMode = "closed" | "create" | "edit";

/**
 * Derive create/edit form mode from dialog-open flag and optional editing entity.
 * - closed: form not shown
 * - create: new project (open, no editing entity)
 * - edit: existing project (open, editing entity present)
 */
export function projectFormMode(
  isOpen: boolean,
  editingProject: unknown | null,
): ProjectFormMode {
  if (!isOpen) return "closed";
  return editingProject != null ? "edit" : "create";
}

/** Convert the PHP amount shown in a form into integer cents. */
export function parseMoneyInput(value: string): number {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100);
}

/** A zero list price carries no discount information, so keep it nullable. */
export function normalizeOptionalListValue(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}
