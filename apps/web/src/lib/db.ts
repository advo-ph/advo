/**
 * Database Abstraction Layer
 *
 * All database operations go through this module. The current implementation
 * calls the ADVO API. Components only import from here.
 */

import { get, post, patch, del } from "@/lib/api";
import type { Project, Client, Lead, ProjectStatus, RecentActivity, UpcomingDeadline } from "@/types/admin";

// ─── Generic Query Result ──────────────────────────────────────────

export interface DbResult<T> {
  data: T | null;
  error: string | null;
}

// ─── Projects ──────────────────────────────────────────────────────

// Map camelCase API response to snake_case frontend types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProject(p: any): Project {
  return {
    project_id: p.projectId ?? p.project_id,
    client_id: p.clientId ?? p.client_id,
    title: p.title,
    description: p.description,
    repository_name: p.repositoryName ?? p.repository_name,
    preview_url: p.previewUrl ?? p.preview_url,
    project_status: (p.projectStatus ?? p.project_status) as ProjectStatus,
    total_value_cents: p.totalValueCents ?? p.total_value_cents ?? 0,
    amount_paid_cents: p.amountPaidCents ?? p.amount_paid_cents ?? 0,
    tech_stack: (p.techStack ?? p.tech_stack ?? []) as string[],
    created_at: p.createdAt ?? p.created_at,
    client: p.client ? mapClient(p.client) : undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapClient(c: any): Client {
  return {
    client_id: c.clientId ?? c.client_id,
    contact_email: c.contactEmail ?? c.contact_email,
    company_name: c.companyName ?? c.company_name,
    github_org_name: c.githubOrgName ?? c.github_org_name,
    brand_color_hex: c.brandColorHex ?? c.brand_color_hex,
    created_at: c.createdAt ?? c.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLead(l: any): Lead {
  return {
    lead_id: l.leadId ?? l.lead_id,
    name: l.name,
    email: l.email,
    company: l.company,
    project_type: l.projectType ?? l.project_type,
    budget: l.budget,
    description: l.description,
    submitted_at: l.submittedAt ?? l.submitted_at,
    status: l.status,
    assigned_to: l.assignedTo ?? l.assigned_to,
    notes: l.notes,
  };
}

export async function getProjects(): Promise<DbResult<Project[]>> {
  const res = await get<unknown[]>("/api/projects");
  if (res.error) return { data: null, error: res.error };
  return { data: (res.data || []).map(mapProject), error: null };
}

export async function createProject(project: {
  client_id: number;
  title: string;
  description?: string | null;
  repository_name?: string | null;
  preview_url?: string | null;
  contract_url?: string | null;
  project_status: ProjectStatus;
  total_value_cents: number;
  amount_paid_cents: number;
  tech_stack: string[];
}): Promise<DbResult<null>> {
  const res = await post("/api/projects", {
    clientId: project.client_id,
    title: project.title,
    description: project.description,
    repositoryName: project.repository_name,
    previewUrl: project.preview_url,
    contractUrl: project.contract_url,
    projectStatus: project.project_status,
    totalValueCents: project.total_value_cents,
    amountPaidCents: project.amount_paid_cents,
    techStack: project.tech_stack,
  });
  return { data: null, error: res.error };
}

export async function updateProject(
  projectId: number,
  updates: Partial<{
    client_id: number;
    title: string;
    description: string | null;
    repository_name: string | null;
    preview_url: string | null;
    contract_url: string | null;
    project_status: ProjectStatus;
    total_value_cents: number;
    amount_paid_cents: number;
    tech_stack: string[];
  }>
): Promise<DbResult<null>> {
  // Convert snake_case to camelCase for API
  const body: Record<string, unknown> = {};
  if (updates.title !== undefined) body.title = updates.title;
  if (updates.description !== undefined) body.description = updates.description;
  if (updates.repository_name !== undefined) body.repositoryName = updates.repository_name;
  if (updates.preview_url !== undefined) body.previewUrl = updates.preview_url;
  if (updates.contract_url !== undefined) body.contractUrl = updates.contract_url;
  if (updates.project_status !== undefined) body.projectStatus = updates.project_status;
  if (updates.total_value_cents !== undefined) body.totalValueCents = updates.total_value_cents;
  if (updates.amount_paid_cents !== undefined) body.amountPaidCents = updates.amount_paid_cents;
  if (updates.tech_stack !== undefined) body.techStack = updates.tech_stack;

  const res = await patch(`/api/projects/${projectId}`, body);
  return { data: null, error: res.error };
}

export async function deleteProject(projectId: number): Promise<DbResult<null>> {
  const res = await del(`/api/projects/${projectId}`);
  return { data: null, error: res.error };
}

// ─── Progress Updates ──────────────────────────────────────────────

export async function createProgressUpdate(update: {
  project_id: number;
  update_title: string;
  update_body?: string | null;
  commit_sha_reference?: string | null;
}): Promise<DbResult<null>> {
  const res = await post(`/api/projects/${update.project_id}/updates`, {
    updateTitle: update.update_title,
    updateBody: update.update_body,
    commitShaReference: update.commit_sha_reference,
  });
  return { data: null, error: res.error };
}

export async function getRecentProgressUpdates(limit = 5): Promise<DbResult<RecentActivity[]>> {
  // Fetch all projects and get recent updates from them
  const res = await get<Array<{
    progressUpdateId: number;
    updateTitle: string;
    createdAt: string;
    project?: { title: string };
  }>>(`/api/projects?_updates_limit=${limit}`);

  // For now, use a simpler approach — fetch from deliverables/upcoming
  // The API returns updates nested in projects, so we aggregate
  if (res.error) return { data: null, error: res.error };

  // Return empty for now — this gets populated from useAdminData's own aggregation
  return { data: [], error: null };
}

// ─── Clients ───────────────────────────────────────────────────────

export async function getClients(): Promise<DbResult<Client[]>> {
  const res = await get<unknown[]>("/api/clients");
  if (res.error) return { data: null, error: res.error };
  return { data: (res.data || []).map(mapClient), error: null };
}

export async function createClient(client: {
  company_name: string;
  contact_email?: string;
  github_org_name?: string | null;
  brand_color_hex?: string;
}): Promise<DbResult<null>> {
  const res = await post("/api/clients", {
    companyName: client.company_name,
    contactEmail: client.contact_email || undefined,
    githubOrgName: client.github_org_name || undefined,
    brandColorHex: client.brand_color_hex,
  });
  return { data: null, error: res.error };
}

export async function updateClient(
  clientId: number,
  updates: Partial<{
    company_name: string;
    contact_email: string;
    github_org_name: string | null;
    brand_color_hex: string;
  }>
): Promise<DbResult<null>> {
  const body: Record<string, unknown> = {};
  if (updates.company_name !== undefined) body.companyName = updates.company_name;
  if (updates.contact_email !== undefined) body.contactEmail = updates.contact_email;
  if (updates.github_org_name !== undefined) body.githubOrgName = updates.github_org_name;
  if (updates.brand_color_hex !== undefined) body.brandColorHex = updates.brand_color_hex;

  const res = await patch(`/api/clients/${clientId}`, body);
  return { data: null, error: res.error };
}

export async function deleteClient(clientId: number): Promise<DbResult<null>> {
  const res = await del(`/api/clients/${clientId}`);
  return { data: null, error: res.error };
}

// ─── Leads ─────────────────────────────────────────────────────────

export async function getLeads(): Promise<DbResult<Lead[]>> {
  const res = await get<unknown[]>("/api/leads");
  if (res.error) return { data: null, error: res.error };
  return { data: (res.data || []).map(mapLead), error: null };
}

export async function createLead(lead: {
  name: string;
  email: string;
  company?: string | null;
  project_type?: string | null;
  budget?: string | null;
  description?: string | null;
}): Promise<DbResult<null>> {
  const res = await post("/api/leads", {
    name: lead.name,
    email: lead.email,
    company: lead.company,
    projectType: lead.project_type,
    budget: lead.budget,
    description: lead.description,
  });
  return { data: null, error: res.error };
}

export async function deleteLead(leadId: number): Promise<DbResult<null>> {
  const res = await del(`/api/leads/${leadId}`);
  return { data: null, error: res.error };
}

// ─── Deliverables ──────────────────────────────────────────────────

export async function getUpcomingDeadlines(limit = 5): Promise<DbResult<UpcomingDeadline[]>> {
  const res = await get<Array<{
    deliverableId: number;
    title: string;
    dueDate: string | null;
    project?: { title: string };
  }>>(`/api/deliverables/upcoming?limit=${limit}`);

  if (res.error) return { data: null, error: res.error };

  const deadlines: UpcomingDeadline[] = (res.data || []).map((d) => {
    const dueDate = d.dueDate ? new Date(d.dueDate) : null;
    const isUrgent = dueDate ? dueDate.getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000 : false;
    return {
      deliverable_id: d.deliverableId,
      title: d.title,
      project_title: d.project?.title || "No project",
      due_date: d.dueDate || "",
      is_urgent: isUrgent,
    };
  });

  return { data: deadlines, error: null };
}

export async function getTeamMembers() {
  const res = await get<Array<Record<string, unknown>>>("/api/team");
  if (res.error) return { data: null, error: res.error };
  return { data: res.data || [], error: null };
}

export async function getDeliverables() {
  const res = await get<Array<Record<string, unknown>>>("/api/deliverables");
  if (res.error) return { data: null, error: res.error };
  return { data: res.data || [], error: null };
}

// ─── Project Assets ────────────────────────────────────────────────

export async function addProjectAsset(asset: {
  project_id: number;
  asset_type: "progress_photo" | "completion_photo" | "document";
  url: string;
  caption?: string | null;
}): Promise<DbResult<null>> {
  const res = await post(`/api/projects/${asset.project_id}/assets`, {
    assetType: asset.asset_type,
    url: asset.url,
    caption: asset.caption,
  });
  return { data: null, error: res.error };
}

// ─── Social Posts ──────────────────────────────────────────────────

export async function getSocialPosts() {
  const res = await get<Array<Record<string, unknown>>>("/api/content/social");
  if (res.error) return { data: null, error: res.error };
  return { data: res.data || [], error: null };
}

export async function createSocialPost(postData: {
  platform: string;
  content: string;
  image_url?: string | null;
  scheduled_for?: string | null;
}): Promise<DbResult<null>> {
  const res = await post("/api/content/social", {
    platform: postData.platform,
    content: postData.content,
    imageUrl: postData.image_url,
    scheduledFor: postData.scheduled_for,
  });
  return { data: null, error: res.error };
}

export async function deleteSocialPost(postId: number): Promise<DbResult<null>> {
  const res = await del(`/api/content/social/${postId}`);
  return { data: null, error: res.error };
}

// ─── Hub: Client-facing project queries ────────────────────────────

export async function getClientProjects() {
  const res = await get<Array<Record<string, unknown>>>("/api/projects");
  if (res.error) return { data: null, error: res.error };
  return { data: res.data || [], error: null };
}

// ─── Connection Check ──────────────────────────────────────────────

export async function checkConnection(): Promise<boolean> {
  try {
    const res = await get<{ status: string; db: boolean }>("/api/health");
    // /api/health is intentionally NOT wrapped in the { data, error } envelope
    // (conventional health shape monitors expect), so read the field directly;
    // fall back to res.data?.db in case it ever gets enveloped.
    const raw = res as unknown as { db?: boolean };
    return raw.db === true || res.data?.db === true;
  } catch {
    return false;
  }
}
