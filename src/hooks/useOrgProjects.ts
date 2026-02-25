import { useQuery } from "@tanstack/react-query";
import { github, GitHubCommit, GitHubRepo, TechStackItem } from "@/lib/github";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/useRoles";
import type { Project, Client } from "@/types/admin";

export interface MergedProject extends Project {
  // GitHub-enriched fields
  githubRepo: GitHubRepo | null;
  commits: GitHubCommit[];
  openPRs: number;
  lastPush: string | null;
  detectedTechStack: TechStackItem[];
}

interface FetchOrgProjectsArgs {
  isAdmin: boolean;
  projectIds: number[];
}

async function fetchOrgProjects({
  isAdmin,
  projectIds,
}: FetchOrgProjectsArgs): Promise<MergedProject[]> {
  // 1. Fetch Supabase projects + GitHub org repos in parallel
  const [dbResult, ghRepos] = await Promise.all([
    supabase
      .from("project")
      .select("*, client(*)")
      .order("created_at", { ascending: false }),
    github.getOrgRepos(),
  ]);

  if (dbResult.error) {
    throw new Error(dbResult.error.message);
  }

  const dbProjects = (dbResult.data || []) as Array<{
    project_id: number;
    client_id: number;
    title: string;
    description: string | null;
    repository_name: string | null;
    preview_url: string | null;
    project_status: Project["project_status"];
    total_value_cents: number;
    amount_paid_cents: number;
    is_active: boolean;
    tech_stack: string[] | null;
    created_at: string;
    updated_at: string;
    client: Client | null;
  }>;

  // 2. RBAC filter: non-admins only see assigned projects
  const filtered = isAdmin
    ? dbProjects
    : dbProjects.filter((p) => projectIds.includes(p.project_id));

  // 3. Build a map of GitHub repos by name for O(1) lookup
  const ghRepoMap = new Map<string, GitHubRepo>();
  for (const repo of ghRepos) {
    ghRepoMap.set(repo.name, repo);
  }

  // 4. For projects with a linked repo, fetch commits + PRs + tech stack in parallel
  const merged: MergedProject[] = await Promise.all(
    filtered.map(async (p) => {
      const repoName = p.repository_name;
      const matchedRepo = repoName ? ghRepoMap.get(repoName) ?? null : null;

      let commits: GitHubCommit[] = [];
      let openPRs = 0;
      let detectedTechStack: TechStackItem[] = [];

      if (repoName && matchedRepo) {
        const [c, pr, ts] = await Promise.all([
          github.getCommits(repoName, 5),
          github.getOpenPullRequests(repoName),
          github.detectTechStack(repoName),
        ]);
        commits = c;
        openPRs = pr;
        detectedTechStack = ts;
      }

      return {
        project_id: p.project_id,
        client_id: p.client_id,
        title: p.title,
        description: p.description || undefined,
        repository_name: p.repository_name || undefined,
        preview_url: p.preview_url || undefined,
        project_status: p.project_status,
        total_value_cents: p.total_value_cents,
        amount_paid_cents: p.amount_paid_cents,
        tech_stack: p.tech_stack || [],
        created_at: p.created_at,
        client: p.client || undefined,
        // GitHub-enriched
        githubRepo: matchedRepo,
        commits,
        openPRs,
        lastPush: matchedRepo?.pushed_at ?? null,
        detectedTechStack,
      };
    })
  );

  return merged;
}

export function useOrgProjects() {
  const { isAdmin, projectIds, isLoading: rolesLoading } = useRoles();

  const {
    data: projects = [],
    isLoading: queryLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["orgProjects", isAdmin, projectIds],
    queryFn: () => fetchOrgProjects({ isAdmin, projectIds }),
    enabled: !rolesLoading,
  });

  return {
    projects,
    isLoading: rolesLoading || queryLoading,
    error: error?.message ?? null,
    refetch,
  };
}
