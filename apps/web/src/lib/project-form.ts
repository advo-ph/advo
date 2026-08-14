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

export type ClientFormMode = "closed" | "create" | "edit";

export function clientFormMode(
  isOpen: boolean,
  editingClient: unknown | null,
): ClientFormMode {
  if (!isOpen) return "closed";
  return editingClient != null ? "edit" : "create";
}
