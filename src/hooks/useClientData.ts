import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/* ─── Shared Types ───────────────────────────────────────── */

export type ProjectStatus =
  | "discovery"
  | "architecture"
  | "development"
  | "testing"
  | "shipped";

export interface ProgressUpdate {
  progress_update_id: number;
  update_title: string;
  update_body?: string;
  commit_sha_reference?: string;
  created_at: string;
}

export interface TeamMemberRef {
  team_member_id: number;
  name: string;
  role: string;
  avatar_url: string | null;
}

export type DeliverableStatus =
  | "not_started"
  | "in_progress"
  | "review"
  | "completed"
  | "blocked";

export interface Deliverable {
  deliverable_id: number;
  title: string;
  description?: string;
  status: DeliverableStatus;
  priority: number;
  due_date?: string;
  team_member?: TeamMemberRef;
}

export type ClientInvoiceStatus = "unpaid" | "paid" | "overdue";

export interface ClientInvoice {
  invoice_id: number;
  label: string;
  amount_cents: number;
  status: ClientInvoiceStatus;
  due_date: string | null;
  paid_at: string | null;
}

export type ProjectAssetType = "progress_photo" | "completion_photo" | "document";

export interface ProjectAsset {
  project_asset_id: number;
  asset_type: ProjectAssetType;
  url: string;
  caption: string | null;
  uploaded_at: string;
}

export interface ProjectContact {
  team_member_id: number;
  name: string;
  role: string;
  avatar_url: string | null;
  email: string | null;
  linkedin_url: string | null;
}

export interface ClientProject {
  project_id: number;
  title: string;
  description?: string;
  repository_name?: string;
  preview_url?: string;
  contract_url?: string | null;
  project_status: ProjectStatus;
  total_value_cents: number;
  amount_paid_cents: number;
  tech_stack: string[];
  progress_update: ProgressUpdate[];
  deliverables: Deliverable[];
  invoices: ClientInvoice[];
  assets: ProjectAsset[];
  contacts: ProjectContact[];
}

/* ─── Query Function ─────────────────────────────────────── */

async function fetchClientData(): Promise<ClientProject[]> {
  // Fetch projects, deliverables, invoices, assets, and contacts in parallel
  const [projectRes, deliverableRes, invoiceRes, assetRes, accessRes] = await Promise.all([
    supabase
      .from("project")
      .select("*, progress_update(*)")
      .order("created_at", { ascending: false }),
    supabase
      .from("deliverable")
      .select("*, project(title), team_member(*)")
      .order("due_date", { ascending: true }),
    supabase
      .from("invoice")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase
      .from("project_asset")
      .select("*")
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("project_access")
      .select("project_id, team_member(team_member_id, name, role, avatar_url, email, linkedin_url)")
  ]);

  if (projectRes.error) {
    throw new Error(projectRes.error.message);
  }

  // Group deliverables by project_id
  const deliverablesByProject = new Map<number, Deliverable[]>();
  if (deliverableRes.data) {
    for (const d of deliverableRes.data) {
      const projectId = d.project_id as number;
      const deliverable: Deliverable = {
        deliverable_id: d.deliverable_id,
        title: d.title,
        description: d.description || undefined,
        status: d.status as DeliverableStatus,
        priority: d.priority,
        due_date: d.due_date || undefined,
        team_member: d.team_member
          ? {
              team_member_id: (d.team_member as any).team_member_id,
              name: (d.team_member as any).name,
              role: (d.team_member as any).role,
              avatar_url: (d.team_member as any).avatar_url,
            }
          : undefined,
      };
      const existing = deliverablesByProject.get(projectId) || [];
      existing.push(deliverable);
      deliverablesByProject.set(projectId, existing);
    }
  }

  // Group invoices by project_id
  const invoicesByProject = new Map<number, ClientInvoice[]>();
  if (invoiceRes.data) {
    for (const raw of invoiceRes.data) {
      const inv = raw as unknown as {
        invoice_id: number;
        project_id: number;
        label: string;
        amount_cents: number;
        status: ClientInvoiceStatus;
        due_date: string | null;
        paid_at: string | null;
      };
      const invoice: ClientInvoice = {
        invoice_id: inv.invoice_id,
        label: inv.label,
        amount_cents: inv.amount_cents,
        status: inv.status,
        due_date: inv.due_date,
        paid_at: inv.paid_at,
      };
      const existing = invoicesByProject.get(inv.project_id) || [];
      existing.push(invoice);
      invoicesByProject.set(inv.project_id, existing);
    }
  }

  // Group assets by project_id
  const assetsByProject = new Map<number, ProjectAsset[]>();
  if (assetRes.data) {
    for (const raw of assetRes.data) {
      const a = raw as unknown as {
        project_asset_id: number;
        project_id: number;
        asset_type: ProjectAssetType;
        url: string;
        caption: string | null;
        uploaded_at: string;
      };
      const asset: ProjectAsset = {
        project_asset_id: a.project_asset_id,
        asset_type: a.asset_type,
        url: a.url,
        caption: a.caption,
        uploaded_at: a.uploaded_at,
      };
      const existing = assetsByProject.get(a.project_id) || [];
      existing.push(asset);
      assetsByProject.set(a.project_id, existing);
    }
  }

  // Group contacts by project_id
  const contactsByProject = new Map<number, ProjectContact[]>();
  if (accessRes.data) {
    for (const raw of accessRes.data) {
      const row = raw as any;
      const projectId = row.project_id as number;
      if (row.team_member) {
        const tm = row.team_member;
        const contact: ProjectContact = {
          team_member_id: tm.team_member_id,
          name: tm.name,
          role: tm.role,
          avatar_url: tm.avatar_url,
          email: tm.email,
          linkedin_url: tm.linkedin_url,
        };
        const existing = contactsByProject.get(projectId) || [];
        // Deduplicate by team_member_id
        if (!existing.some((c) => c.team_member_id === contact.team_member_id)) {
          existing.push(contact);
        }
        contactsByProject.set(projectId, existing);
      }
    }
  }

  // Merge projects with all related data
  return (projectRes.data || []).map((p: any) => ({
    project_id: p.project_id,
    title: p.title,
    description: p.description || undefined,
    repository_name: p.repository_name || undefined,
    preview_url: p.preview_url || undefined,
    contract_url: p.contract_url || null,
    project_status: p.project_status as ProjectStatus,
    total_value_cents: p.total_value_cents || 0,
    amount_paid_cents: p.amount_paid_cents || 0,
    tech_stack: (p.tech_stack || []) as string[],
    progress_update: (p.progress_update || []).map((u: any) => ({
      progress_update_id: u.progress_update_id,
      update_title: u.update_title,
      update_body: u.update_body,
      commit_sha_reference: u.commit_sha_reference,
      created_at: u.created_at,
    })),
    deliverables: deliverablesByProject.get(p.project_id) || [],
    invoices: invoicesByProject.get(p.project_id) || [],
    assets: assetsByProject.get(p.project_id) || [],
    contacts: contactsByProject.get(p.project_id) || [],
  }));
}

/* ─── Hook ───────────────────────────────────────────────── */

export function useClientData() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const {
    data: projects = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["clientData", userId],
    queryFn: fetchClientData,
    enabled: !!userId,
  });

  return {
    projects,
    isLoading,
    error: error?.message ?? null,
    refetch,
  };
}
