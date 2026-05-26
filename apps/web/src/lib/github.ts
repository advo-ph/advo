// GitHub API Service for fetching commits and repo data
// This service integrates with the advo-ph organization

const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN;
const GITHUB_ORG = 'advo-ph';

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
  category: 'frontend' | 'backend' | 'database' | 'infrastructure' | 'other';
}

// Known dependency to tech stack mappings
const TECH_MAPPINGS: Record<string, TechStackItem> = {
  'next': { name: 'Next.js', category: 'frontend' },
  'react': { name: 'React', category: 'frontend' },
  'vue': { name: 'Vue.js', category: 'frontend' },
  'svelte': { name: 'Svelte', category: 'frontend' },
  '@supabase/supabase-js': { name: 'Supabase', category: 'backend' },
  'stripe': { name: 'Stripe', category: 'backend' },
  'tailwindcss': { name: 'TailwindCSS', category: 'frontend' },
  '@prisma/client': { name: 'Prisma', category: 'database' },
  'drizzle-orm': { name: 'Drizzle', category: 'database' },
  'express': { name: 'Express', category: 'backend' },
  'hono': { name: 'Hono', category: 'backend' },
  'typescript': { name: 'TypeScript', category: 'frontend' },
  'vite': { name: 'Vite', category: 'infrastructure' },
  'framer-motion': { name: 'Framer Motion', category: 'frontend' },
  'zod': { name: 'Zod', category: 'other' },
  '@tanstack/react-query': { name: 'React Query', category: 'frontend' },
};

class GitHubService {
  private headers: HeadersInit;
  
  constructor() {
    this.headers = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(GITHUB_TOKEN && { 'Authorization': `Bearer ${GITHUB_TOKEN}` }),
    };
  }

  /**
   * Fetch recent commits from a repository
   * @param branch - Branch name (defaults to main/master)
   */
  async getCommits(repoName: string, limit = 10, branch?: string): Promise<GitHubCommit[]> {
    try {
      const branchParam = branch ? `&sha=${branch}` : '';
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB_ORG}/${repoName}/commits?per_page=${limit}${branchParam}`,
        { headers: this.headers }
      );
      
      if (!response.ok) {
        console.error(`GitHub API error: ${response.status}`);
        return [];
      }
      
      const data = await response.json();
      
      return data.map((commit: Record<string, unknown>) => ({
        sha: (commit.sha as string).substring(0, 7),
        message: String((commit.commit as Record<string, Record<string, string>>).message).split('\n')[0],
        author: {
          name: (commit.commit as Record<string, Record<string, string>>).author.name,
          email: (commit.commit as Record<string, Record<string, string>>).author.email,
          date: (commit.commit as Record<string, Record<string, string>>).author.date,
          avatar_url: (commit.author as Record<string, string> | null)?.avatar_url,
        },
        html_url: commit.html_url,
        branch: branch || 'main',
      }));
    } catch (error) {
      console.error('Failed to fetch commits:', error);
      return [];
    }
  }

  /**
   * Fetch all branches for a repository
   */
  async getBranches(repoName: string): Promise<GitHubBranch[]> {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB_ORG}/${repoName}/branches`,
        { headers: this.headers }
      );
      
      if (!response.ok) return [];
      
      const data = await response.json();
      return data.map((branch: Record<string, unknown>) => ({
        name: branch.name,
        protected: branch.protected,
      }));
    } catch (error) {
      console.error('Failed to fetch branches:', error);
      return [];
    }
  }

  /**
   * Fetch repository info
   */
  async getRepository(repoName: string): Promise<GitHubRepo | null> {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB_ORG}/${repoName}`,
        { headers: this.headers }
      );
      
      if (!response.ok) return null;
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch repository:', error);
      return null;
    }
  }

  /**
   * Auto-detect tech stack from package.json
   */
  async detectTechStack(repoName: string, branch?: string): Promise<TechStackItem[]> {
    try {
      const branchParam = branch ? `?ref=${branch}` : '';
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB_ORG}/${repoName}/contents/package.json${branchParam}`,
        { headers: this.headers }
      );
      
      if (!response.ok) return [];
      
      const data = await response.json();
      const content = atob(data.content);
      const packageJson = JSON.parse(content);
      
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };
      
      const detected: TechStackItem[] = [];
      
      for (const dep of Object.keys(allDeps)) {
        if (TECH_MAPPINGS[dep]) {
          detected.push(TECH_MAPPINGS[dep]);
        }
      }
      
      return detected;
    } catch (error) {
      console.error('Failed to detect tech stack:', error);
      return [];
    }
  }

  /**
   * Get open pull requests
   */
  async getOpenPullRequests(repoName: string): Promise<number> {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB_ORG}/${repoName}/pulls?state=open`,
        { headers: this.headers }
      );
      
      if (!response.ok) return 0;
      
      const data = await response.json();
      return data.length;
    } catch (error) {
      console.error('Failed to fetch PRs:', error);
      return 0;
    }
  }

  /**
   * Get all repos in the org
   */
  async getOrgRepos(): Promise<GitHubRepo[]> {
    try {
      const response = await fetch(
        `https://api.github.com/orgs/${GITHUB_ORG}/repos?sort=pushed&per_page=20`,
        { headers: this.headers }
      );
      
      if (!response.ok) return [];
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch org repos:', error);
      return [];
    }
  }
}

export const github = new GitHubService();
