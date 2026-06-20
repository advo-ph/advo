// GitHub service — routes through the ADVO backend so no token ever lives in
// the browser bundle (closes audit S4). Commits come from the backend's
// github_event webhook cache; branches from the backend (server-side token).
// Repo/tech-stack/PR enrichment has no backend endpoint yet → returns empty
// (the UI already degrades gracefully). Previously this called api.github.com
// directly with VITE_GITHUB_TOKEN — a public-bundle leak waiting to happen.
import { get } from "@/lib/api";

const GITHUB_ORG = "advo-ph";

export interface GitHubCommit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
    avatar_url?: string;
  };
  html_url: string;
  branch?: string;
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
}

export interface GitHubBranch {
  name: string;
  protected: boolean;
}

export interface GitHubRepo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  open_issues_count: number;
  pushed_at: string;
  default_branch: string;
}

export interface TechStackItem {
  name: string;
  icon?: string;
  category: "frontend" | "backend" | "database" | "infrastructure" | "other";
}

class GitHubService {
  /** Recent commits, from the backend's webhook cache (no token in the browser). */
  async getCommits(repoName: string, limit = 10, branch?: string): Promise<GitHubCommit[]> {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (branch) qs.set("branch", branch);
    const res = await get<Record<string, unknown>[]>(
      `/api/github/repos/${encodeURIComponent(repoName)}/commits?${qs.toString()}`,
    );
    return (res.data || []).map((r) => {
      const sha = String(r.commitSha ?? r.commit_sha ?? "");
      return {
        sha: sha.substring(0, 7),
        message: String(r.message ?? "").split("\n")[0],
        author: {
          name: String(r.author ?? "unknown"),
          email: "",
          date: String(r.createdAt ?? r.created_at ?? ""),
        },
        html_url: sha
          ? `https://github.com/${GITHUB_ORG}/${repoName}/commit/${sha}`
          : `https://github.com/${GITHUB_ORG}/${repoName}`,
        branch: String(r.branch ?? branch ?? "main"),
      } as GitHubCommit;
    });
  }

  /** Branches, fetched server-side by the backend. */
  async getBranches(repoName: string): Promise<GitHubBranch[]> {
    const res = await get<GitHubBranch[]>(
      `/api/github/repos/${encodeURIComponent(repoName)}/branches`,
    );
    return res.data || [];
  }

  // No backend endpoints yet — enrichment-only, degrade to empty.
  async getRepository(_repoName: string): Promise<GitHubRepo | null> {
    return null;
  }
  async detectTechStack(_repoName: string, _branch?: string): Promise<TechStackItem[]> {
    return [];
  }
  async getOpenPullRequests(_repoName: string): Promise<number> {
    return 0;
  }
  async getOrgRepos(): Promise<GitHubRepo[]> {
    return [];
  }
}

export const github = new GitHubService();
