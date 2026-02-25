import { useState, useEffect, useCallback } from 'react';
import { github, GitHubCommit, GitHubRepo, GitHubBranch, TechStackItem } from '@/lib/github';

interface UseGitHubResult {
  commits: GitHubCommit[];
  repo: GitHubRepo | null;
  techStack: TechStackItem[];
  branches: GitHubBranch[];
  currentBranch: string;
  openPRs: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  setBranch: (branch: string) => void;
}

export function useGitHub(repoName: string | null): UseGitHubResult {
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [repo, setRepo] = useState<GitHubRepo | null>(null);
  const [techStack, setTechStack] = useState<TechStackItem[]>([]);
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>('main');
  const [openPRs, setOpenPRs] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!repoName) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const [commitsData, repoData, techData, prCount, branchesData] = await Promise.all([
        github.getCommits(repoName, 10, currentBranch),
        github.getRepository(repoName),
        github.detectTechStack(repoName, currentBranch),
        github.getOpenPullRequests(repoName),
        github.getBranches(repoName),
      ]);
      
      setCommits(commitsData);
      setRepo(repoData);
      setTechStack(techData);
      setOpenPRs(prCount);
      setBranches(branchesData);
      
      // Set default branch from repo info if available
      if (repoData?.default_branch && currentBranch === 'main' && repoData.default_branch !== 'main') {
        setCurrentBranch(repoData.default_branch);
      }
    } catch (err) {
      setError('Failed to fetch GitHub data');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [repoName, currentBranch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const setBranch = (branch: string) => {
    setCurrentBranch(branch);
  };

  return {
    commits,
    repo,
    techStack,
    branches,
    currentBranch,
    openPRs,
    isLoading,
    error,
    refetch: fetchData,
    setBranch,
  };
}
