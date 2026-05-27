import { useQuery } from "@tanstack/react-query";
import { github, type GitHubCommit } from "@/lib/github";
import { get } from "@/lib/api";
import { useRoles } from "@/hooks/useRoles";

export interface MergedProject {
  project_id: number;
  client_id?: number;
  title: string;
  description?: string;
  repository_name?: string;
  preview_url?: string;
  contract_url?: string;
  project_status: string;
  total_value_cents: number;
  amount_paid_cents: number;
  tech_stack: string[];
  created_at: string;
  client?: {
    company_name?: string;
    contact_email?: string;
    github_org_name?: string;
    brand_color_hex?: string;
  };
  commits?: Array<{
    sha: string;
    message: string;
    author: string;
    date: string;
  }>;
  openPRs?: number;
  detectedStack?: string[];
  // GitHub-enriched fields (populated when org_name + token available)
  githubRepo?: { name: string; url: string; defaultBranch?: string };
  lastPush?: string;
  detectedTechStack?: Array<{ name: string }>;
}

async function fetchOrgProjects(): Promise<MergedProject[]> {
  // API handles RBAC filtering
  const res = await get<unknown[]>("/api/projects");
  if (res.error || !res.data) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projects: MergedProject[] = res.data.map((p: any) => ({
    project_id: p.projectId ?? p.project_id,
    client_id: p.clientId ?? p.client_id,
    title: p.title,
    description: p.description,
    repository_name: p.repositoryName ?? p.repository_name,
    preview_url: p.previewUrl ?? p.preview_url,
    contract_url: p.contractUrl ?? p.contract_url,
    project_status: p.projectStatus ?? p.project_status,
    total_value_cents: p.totalValueCents ?? p.total_value_cents ?? 0,
    amount_paid_cents: p.amountPaidCents ?? p.amount_paid_cents ?? 0,
    tech_stack: p.techStack ?? p.tech_stack ?? [],
    created_at: p.createdAt ?? p.created_at,
    client: p.client
      ? {
          company_name: p.client.companyName ?? p.client.company_name,
          contact_email: p.client.contactEmail ?? p.client.contact_email,
          github_org_name: p.client.githubOrgName ?? p.client.github_org_name,
          brand_color_hex: p.client.brandColorHex ?? p.client.brand_color_hex,
        }
      : undefined,
  }));

  // Enrich with GitHub data
  const enriched = await Promise.all(
    projects.map(async (project) => {
      if (!project.repository_name) return project;
      try {
        const [commits, openPRs, stack] = await Promise.all([
          github.getCommits(project.repository_name, 5, "main").catch(() => []),
          github.getOpenPullRequests(project.repository_name).catch(() => 0),
          github.detectTechStack(project.repository_name).catch(() => []),
        ]);
        return {
          ...project,
          commits: commits.map((c: GitHubCommit) => ({
            sha: c.sha,
            message: c.message,
            author: c.author.name,
            date: c.author.date,
          })),
          openPRs,
          detectedStack: stack.map((s) => s.name),
        };
      } catch {
        return project;
      }
    })
  );

  return enriched;
}

export function useOrgProjects() {
  const { isAdmin, isLoading: rolesLoading } = useRoles();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["orgProjects", isAdmin],
    queryFn: fetchOrgProjects,
    enabled: !rolesLoading,
    staleTime: 2 * 60 * 1000,
  });

  return {
    projects: data || [],
    isLoading: isLoading || rolesLoading,
    error: error ? (error as Error).message : null,
    refetch,
  };
}
