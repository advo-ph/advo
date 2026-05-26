import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

/* ─── Shared Types ───────────────────────────────────────── */

export type DeliverableStatus =
  | "not_started"
  | "in_progress"
  | "review"
  | "completed"
  | "blocked";

export type ClientInvoiceStatus = "unpaid" | "paid" | "overdue";

export interface Deliverable {
  deliverable_id: number;
  title: string;
  status: string;
  due_date?: string;
  completed_at?: string;
  team_member?: {
    team_member_id: number;
    name: string;
    role?: string;
    avatar_url?: string;
  };
}

export interface ClientInvoice {
  invoice_id: number;
  label: string;
  amount_cents: number;
  status: string;
  due_date?: string;
  paid_at?: string;
}

export interface ClientProject {
  project_id: number;
  title: string;
  description?: string;
  project_status: string;
  preview_url?: string;
  contract_url?: string;
  total_value_cents: number;
  amount_paid_cents: number;
  tech_stack: string[];
  repository_name?: string;
  created_at: string;
  client?: { company_name?: string; brand_color_hex?: string; github_org_name?: string };
  updates: Array<{
    progress_update_id: number;
    update_title: string;
    update_body?: string;
    commit_sha_reference?: string;
    created_at: string;
  }>;
  deliverables: Deliverable[];
  invoices: ClientInvoice[];
  assets: Array<{
    project_asset_id: number;
    asset_type: string;
    url: string;
    caption?: string;
    uploaded_at?: string;
  }>;
  contacts: Array<{
    team_member_id: number;
    name: string;
    role: string;
    email?: string;
    avatar_url?: string;
    linkedin_url?: string;
  }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProject(p: any): ClientProject {
  return {
    project_id: p.projectId ?? p.project_id,
    title: p.title,
    description: p.description,
    project_status: p.projectStatus ?? p.project_status,
    preview_url: p.previewUrl ?? p.preview_url,
    contract_url: p.contractUrl ?? p.contract_url,
    total_value_cents: p.totalValueCents ?? p.total_value_cents ?? 0,
    amount_paid_cents: p.amountPaidCents ?? p.amount_paid_cents ?? 0,
    tech_stack: p.techStack ?? p.tech_stack ?? [],
    repository_name: p.repositoryName ?? p.repository_name,
    created_at: p.createdAt ?? p.created_at,
    client: p.client
      ? {
          company_name: p.client.companyName ?? p.client.company_name,
          brand_color_hex: p.client.brandColorHex ?? p.client.brand_color_hex,
          github_org_name: p.client.githubOrgName ?? p.client.github_org_name,
        }
      : undefined,
    updates: (p.updates || []).map((u: Record<string, unknown>) => ({
      progress_update_id: u.progressUpdateId ?? u.progress_update_id,
      update_title: u.updateTitle ?? u.update_title,
      update_body: u.updateBody ?? u.update_body,
      commit_sha_reference: u.commitShaReference ?? u.commit_sha_reference,
      created_at: u.createdAt ?? u.created_at,
    })),
    deliverables: [],
    invoices: [],
    assets: (p.assets || []).map((a: Record<string, unknown>) => ({
      project_asset_id: a.projectAssetId ?? a.project_asset_id,
      asset_type: a.assetType ?? a.asset_type,
      url: a.url,
      caption: a.caption,
    })),
    contacts: (p.team || []).map((t: Record<string, unknown>) => {
      const tm = (t.teamMember ?? t.team_member ?? t) as Record<string, unknown>;
      return {
        team_member_id: tm.teamMemberId ?? tm.team_member_id,
        name: tm.name,
        role: tm.role,
        email: tm.email,
        avatar_url: tm.avatarUrl ?? tm.avatar_url,
        linkedin_url: tm.linkedinUrl ?? tm.linkedin_url,
      };
    }),
  };
}

async function fetchClientData(): Promise<ClientProject[]> {
  // Fetch projects (API handles RBAC — clients only see their own)
  const projectsRes = await get<unknown[]>("/api/projects");
  if (projectsRes.error || !projectsRes.data) return [];

  // For each project, fetch full detail (includes updates, assets, team)
  const detailed = await Promise.all(
    projectsRes.data.map(async (p: Record<string, unknown>) => {
      const id = p.projectId ?? p.project_id;
      const detailRes = await get<unknown>(`/api/projects/${id}`);
      return detailRes.data || p;
    })
  );

  // Fetch invoices and deliverables
  const [invoicesRes, deliverablesRes] = await Promise.all([
    get<unknown[]>("/api/invoices"),
    get<unknown[]>("/api/deliverables"),
  ]);

  const projects = detailed.map(mapProject);

  // Attach invoices and deliverables to their projects
  const invoices = invoicesRes.data || [];
  const deliverables = deliverablesRes.data || [];

  for (const project of projects) {
    project.invoices = invoices
      .filter((i: Record<string, unknown>) => (i.projectId ?? i.project_id) === project.project_id)
      .map((i: Record<string, unknown>) => ({
        invoice_id: (i.invoiceId ?? i.invoice_id) as number,
        label: i.label as string,
        amount_cents: (i.amountCents ?? i.amount_cents) as number,
        status: i.status as string,
        due_date: (i.dueDate ?? i.due_date) as string | undefined,
        paid_at: (i.paidAt ?? i.paid_at) as string | undefined,
      }));

    project.deliverables = deliverables
      .filter((d: Record<string, unknown>) => (d.projectId ?? d.project_id) === project.project_id)
      .map((d: Record<string, unknown>) => ({
        deliverable_id: (d.deliverableId ?? d.deliverable_id) as number,
        title: d.title as string,
        status: d.status as string,
        due_date: (d.dueDate ?? d.due_date) as string | undefined,
        completed_at: (d.completedAt ?? d.completed_at) as string | undefined,
      }));
  }

  return projects;
}

export function useClientData() {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["clientData", user?.id],
    queryFn: fetchClientData,
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    refetchOnMount: true,
  });

  return {
    projects: data || [],
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
  };
}
