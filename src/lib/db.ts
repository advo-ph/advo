/**
 * Database Abstraction Layer
 * 
 * All database operations go through this module. The current implementation
 * uses Supabase, but the interface is designed to be swapped to raw PostgreSQL,
 * Prisma, Drizzle, or any other ORM/driver in the future.
 * 
 * To migrate away from Supabase:
 *   1. Replace the implementation in this file with your new driver (e.g. pg, Prisma)
 *   2. Everything else in the app stays the same — components only import from here
 *   3. Move auth to your own Express middleware / Passport.js / etc.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Project, Client, Lead, ProjectStatus, RecentActivity, UpcomingDeadline } from "@/types/admin";
import { formatDistanceToNow } from "date-fns";

// ─── Generic Query Result ──────────────────────────────────────────

export interface DbResult<T> {
  data: T | null;
  error: string | null;
}

// ─── Projects ──────────────────────────────────────────────────────

export async function getProjects(): Promise<DbResult<Project[]>> {
  const { data, error } = await supabase
    .from("project")
    .select("*, client(*)")
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };

  const projects: Project[] = (data || []).map((p) => ({
    ...p,
    project_status: p.project_status as ProjectStatus,
    tech_stack: (p.tech_stack || []) as string[],
  }));

  return { data: projects, error: null };
}

export async function createProject(project: {
  client_id: number;
  title: string;
  description?: string | null;
  repository_name?: string | null;
  preview_url?: string | null;
  project_status: ProjectStatus;
  total_value_cents: number;
  amount_paid_cents: number;
  tech_stack: string[];
}): Promise<DbResult<null>> {
  const { error } = await supabase.from("project").insert(project);
  return { data: null, error: error?.message || null };
}

export async function updateProject(
  projectId: number,
  updates: Partial<{
    client_id: number;
    title: string;
    description: string | null;
    repository_name: string | null;
    preview_url: string | null;
    project_status: ProjectStatus;
    total_value_cents: number;
    amount_paid_cents: number;
    tech_stack: string[];
  }>
): Promise<DbResult<null>> {
  const { error } = await supabase
    .from("project")
    .update(updates)
    .eq("project_id", projectId);
  return { data: null, error: error?.message || null };
}

export async function deleteProject(projectId: number): Promise<DbResult<null>> {
  const { error } = await supabase
    .from("project")
    .delete()
    .eq("project_id", projectId);
  return { data: null, error: error?.message || null };
}

// ─── Progress Updates ──────────────────────────────────────────────

export async function createProgressUpdate(update: {
  project_id: number;
  update_title: string;
  update_body?: string | null;
  commit_sha_reference?: string | null;
}): Promise<DbResult<null>> {
  const { error } = await supabase.from("progress_update").insert(update);
  return { data: null, error: error?.message || null };
}

export async function getRecentProgressUpdates(limit = 5): Promise<DbResult<RecentActivity[]>> {
  const { data, error } = await supabase
    .from("progress_update")
    .select("*, project(title)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { data: null, error: error.message };

  const activities: RecentActivity[] = (data || []).map((u) => ({
    action: "Project update posted",
    target: (u.project as { title: string })?.title || "Unknown project",
    time: formatDistanceToNow(new Date(u.created_at), { addSuffix: true }),
  }));

  return { data: activities, error: null };
}

// ─── Clients ───────────────────────────────────────────────────────

export async function getClients(): Promise<DbResult<Client[]>> {
  const { data, error } = await supabase
    .from("client")
    .select("*")
    .order("company_name");

  if (error) return { data: null, error: error.message };
  return { data: (data || []) as Client[], error: null };
}

export async function createClient(client: {
  user_id?: string;
  company_name: string;
  contact_email: string;
  github_org_name?: string | null;
  brand_color_hex?: string;
}): Promise<DbResult<null>> {
  // user_id is required by schema — cast to satisfy Supabase types
  const { error } = await supabase.from("client").insert({
    ...client,
    user_id: client.user_id || "",
  } as { user_id: string; company_name: string; contact_email: string; github_org_name?: string | null; brand_color_hex?: string });
  return { data: null, error: error?.message || null };
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
  const { error } = await supabase
    .from("client")
    .update(updates)
    .eq("client_id", clientId);
  return { data: null, error: error?.message || null };
}

export async function deleteClient(clientId: number): Promise<DbResult<null>> {
  const { error } = await supabase
    .from("client")
    .delete()
    .eq("client_id", clientId);
  return { data: null, error: error?.message || null };
}

// ─── Leads ─────────────────────────────────────────────────────────

export async function getLeads(): Promise<DbResult<Lead[]>> {
  const { data, error } = await supabase
    .from("lead")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: (data || []) as Lead[], error: null };
}

export async function createLead(lead: {
  name: string;
  email: string;
  company?: string | null;
  project_type?: string | null;
  budget?: string | null;
  description?: string | null;
}): Promise<DbResult<null>> {
  const { error } = await supabase.from("lead").insert(lead);
  return { data: null, error: error?.message || null };
}

export async function deleteLead(leadId: number): Promise<DbResult<null>> {
  const { error } = await supabase
    .from("lead")
    .delete()
    .eq("lead_id", leadId);
  return { data: null, error: error?.message || null };
}

// ─── Deliverables ──────────────────────────────────────────────────

export async function getUpcomingDeadlines(limit = 5): Promise<DbResult<UpcomingDeadline[]>> {
  const { data, error } = await supabase
    .from("deliverable")
    .select("*, project(title)")
    .neq("status", "completed")
    .order("due_date", { ascending: true })
    .limit(limit);

  if (error) return { data: null, error: error.message };

  const deadlines: UpcomingDeadline[] = (data || []).map((d) => {
    const dueDate = d.due_date ? new Date(d.due_date) : null;
    const isUrgent = dueDate ? dueDate.getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000 : false;
    return {
      deliverable_id: d.deliverable_id,
      title: d.title,
      project_title: (d.project as { title: string })?.title || "No project",
      due_date: d.due_date || "",
      is_urgent: isUrgent,
    };
  });

  return { data: deadlines, error: null };
}

export async function getTeamMembers() {
  const { data, error } = await supabase
    .from("team_member")
    .select("*")
    .eq("is_active", true);

  if (error) return { data: null, error: error.message };
  return { data: data || [], error: null };
}

export async function getDeliverables() {
  const { data, error } = await supabase
    .from("deliverable")
    .select("*, project(title), team_member(*)")
    .order("due_date", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: data || [], error: null };
}

// ─── Social Posts ──────────────────────────────────────────────────

export async function getSocialPosts() {
  const { data, error } = await supabase
    .from("social_post")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data || [], error: null };
}

export async function createSocialPost(post: {
  platform: string;
  content: string;
  image_url?: string | null;
  scheduled_for?: string | null;
}): Promise<DbResult<null>> {
  const { error } = await supabase.from("social_post").insert(post);
  return { data: null, error: error?.message || null };
}

export async function deleteSocialPost(postId: number): Promise<DbResult<null>> {
  const { error } = await supabase
    .from("social_post")
    .delete()
    .eq("social_post_id", postId);
  return { data: null, error: error?.message || null };
}

// ─── Hub: Client-facing project queries ────────────────────────────

export async function getClientProjects() {
  const { data, error } = await supabase
    .from("project")
    .select("*, progress_update(*)")
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data || [], error: null };
}

// ─── Connection Check ──────────────────────────────────────────────

export async function checkConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from("project").select("project_id").limit(1);
    return !error;
  } catch {
    return false;
  }
}
