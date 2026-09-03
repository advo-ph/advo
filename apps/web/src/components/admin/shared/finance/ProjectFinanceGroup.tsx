/**
 * ProjectFinanceGroup — accordion wrapper for one project on the main Finance page.
 *
 * Header: project name (left), client name (small grey, right), chevron toggle.
 * Body (when open): the same four panels used on the project Finance tab.
 *
 * Starts collapsed. The parent decides which project to open by default
 * by passing defaultOpen={true}.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ProjectInvoicesPanel } from "./ProjectInvoicesPanel";
import { RecurringInvoicesPanel } from "./RecurringInvoicesPanel";
import { CommissionPanel } from "./CommissionPanel";
import { ExpensesPanel } from "./ExpensesPanel";
import { useRoles } from "@/hooks/useRoles";

interface ProjectFinanceGroupProps {
  project: {
    projectId: number;
    name: string;
    clientName: string | null;
  };
  defaultOpen?: boolean;
}

export function ProjectFinanceGroup({
  project,
  defaultOpen = false,
}: ProjectFinanceGroupProps) {
  const { isOwner } = useRoles();
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 h-12 hover:bg-secondary/40 transition-colors"
        aria-expanded={isOpen}
      >
        <span className="flex-1 min-w-0 font-medium text-sm text-left truncate">
          {project.name}
        </span>
        {project.clientName && (
          <span className="hidden sm:block shrink-0 text-xs text-muted-foreground truncate max-w-[200px]">
            {project.clientName}
          </span>
        )}
        <span className="shrink-0 text-muted-foreground">
          {isOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </span>
      </button>

      {/* Body */}
      {isOpen && (
        <div className="border-t border-border bg-secondary/5 p-4 space-y-4">
          {/* Top row: invoices, recurring invoices, expenses */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ProjectInvoicesPanel projectId={project.projectId} />
            <RecurringInvoicesPanel projectId={project.projectId} />
            <ExpensesPanel projectId={project.projectId} />
          </div>

          {/* Commission takes the whole row: five columns and three pool boxes */}
          <CommissionPanel projectId={project.projectId} isOwner={isOwner} />
        </div>
      )}
    </div>
  );
}

export default ProjectFinanceGroup;
