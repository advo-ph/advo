import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";

export type DeliverableStatus =
  | "not_started"
  | "in_progress"
  | "review"
  | "completed"
  | "blocked";

export interface DeliverableAssignee {
  team_member_id: number;
  name: string;
  role: string;
  avatar_url?: string;
}

export interface Deliverable {
  deliverable_id: number;
  project_id: number;
  assigned_to: number | null;
  title: string;
  description?: string;
  status: DeliverableStatus;
  priority: number;
  due_date?: string | null;
  project?: { title: string };
  assignee?: DeliverableAssignee;
}

function mapDeliverable(t: Record<string, unknown>): Deliverable {
  return {
    deliverable_id: (t.deliverableId ?? t.deliverable_id) as number,
    project_id: (t.projectId ?? t.project_id) as number,
    title: t.title as string,
    status: ((t.status as DeliverableStatus) || "not_started") as DeliverableStatus,
    priority: (t.priority as number) || 0,
    due_date: (t.dueDate ?? t.due_date ?? null) as string | null,
    assigned_to: (t.assignedTo ?? t.assigned_to ?? null) as number | null,
    project: t.project as { title: string } | undefined,
    assignee: (t.assignee ?? t.team_member) as DeliverableAssignee | undefined,
  };
}

const QUERY_KEY = ["adminDeliverables"];

async function fetchDeliverables(): Promise<Deliverable[]> {
  const res = await get<Record<string, unknown>[]>("/api/deliverables");
  return (res.data || []).map(mapDeliverable);
}

export function useAdminDeliverables() {
  const { data: deliverables = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchDeliverables,
    staleTime: 2 * 60 * 1000,
  });

  return { deliverables, isLoading };
}
