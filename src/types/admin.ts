// Shared admin types used across all admin components

export type ProjectStatus = "discovery" | "architecture" | "development" | "testing" | "shipped";

export const STATUS_OPTIONS: ProjectStatus[] = ["discovery", "architecture", "development", "testing", "shipped"];

export const ADMIN_EMAILS = ["hello@advo.ph", "dev@advo.ph", "test2@example.com"];

export interface Client {
  client_id: number;
  contact_email?: string;
  company_name?: string;
  github_org_name?: string;
  brand_color_hex?: string;
  created_at: string;
  projectCount?: number;
}

export interface Project {
  project_id: number;
  client_id: number;
  title: string;
  description?: string;
  repository_name?: string;
  preview_url?: string;
  project_status: ProjectStatus;
  total_value_cents: number;
  amount_paid_cents: number;
  tech_stack: string[];
  created_at: string;
  client?: Client;
}

export interface Lead {
  lead_id?: number;
  name: string;
  email: string;
  company: string;
  project_type: string;
  budget: string;
  description: string;
  submitted_at: string;
}

export interface RecentActivity {
  action: string;
  target: string;
  time: string;
}

export interface UpcomingDeadline {
  deliverable_id: number;
  title: string;
  project_title: string;
  due_date: string;
  is_urgent: boolean;
}

export const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
  }).format(cents / 100);
};
