import { useState } from "react";
import { deleteProject } from "@/lib/db";

/**
 * Wraps DELETE /api/projects/:id.
 * Calls onDeleted() on success. Surfaces loading and error state.
 */
export function useDeleteProject(onDeleted: () => void) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async (projectId: number) => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const { error } = await deleteProject(projectId);
      if (error) {
        setDeleteError(error);
      } else {
        onDeleted();
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Unable to delete project");
    } finally {
      setIsDeleting(false);
    }
  };

  return { handleDelete, isDeleting, deleteError };
}
