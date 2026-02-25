import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ExternalLink, GitBranch, GitCommit, GitPullRequest, RefreshCw, Loader2, FileEdit, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import StatusStepper from "./StatusStepper";
import FundingBar from "./FundingBar";
import { useGitHub } from "@/hooks/useGitHub";
import { cloudflare, DeploymentStatus } from "@/lib/cloudflare";
import { formatDistanceToNow } from "date-fns";

type ProjectStatus = "discovery" | "architecture" | "development" | "testing" | "shipped";

interface ProgressUpdate {
  progress_update_id: number;
  update_title: string;
  update_body?: string;
  commit_sha_reference?: string;
  created_at: string;
}

interface Project {
  project_id: number;
  title: string;
  description?: string;
  repository_name?: string;
  preview_url?: string;
  project_status: ProjectStatus;
  total_value_cents: number;
  amount_paid_cents: number;
  tech_stack: string[];
  progress_update: ProgressUpdate[];
}

interface ProjectDashboardProps {
  project: Project;
}

// Combined feed item type
interface FeedItem {
  id: string;
  type: 'commit' | 'update';
  title: string;
  body?: string;
  author: string;
  avatar_url?: string;
  date: string;
  sha?: string;
  html_url?: string;
}

const ProjectDashboard = ({ project }: ProjectDashboardProps) => {
  const { 
    commits, 
    techStack, 
    branches,
    currentBranch,
    openPRs, 
    isLoading, 
    refetch,
    setBranch 
  } = useGitHub(project.repository_name || null);

  const [deployment, setDeployment] = useState<DeploymentStatus | null>(null);
  
  // Fetch Cloudflare Pages deployment status
  useEffect(() => {
    const fetchDeployment = async () => {
      if (project.preview_url) {
        const projectName = cloudflare.extractProjectName(project.preview_url);
        if (projectName) {
          const dep = await cloudflare.getLatestDeployment(projectName);
          setDeployment(dep);
        }
      }
    };
    fetchDeployment();
  }, [project.preview_url]);
  
  // Use GitHub-detected tech stack if available, fallback to DB
  const displayTechStack = techStack.length > 0 
    ? techStack.map(t => t.name) 
    : project.tech_stack;

  // Merge GitHub commits and DB progress updates into a single feed
  const buildFeed = (): FeedItem[] => {
    const items: FeedItem[] = [];
    
    // Add GitHub commits
    commits.forEach(commit => {
      items.push({
        id: `commit-${commit.sha}`,
        type: 'commit',
        title: commit.message,
        author: commit.author.name,
        avatar_url: commit.author.avatar_url,
        date: commit.author.date,
        sha: commit.sha,
        html_url: commit.html_url,
      });
    });
    
    // Add DB progress updates (manual updates from admin)
    project.progress_update.forEach(update => {
      items.push({
        id: `update-${update.progress_update_id}`,
        type: 'update',
        title: update.update_title,
        body: update.update_body,
        author: 'ADVO Team',
        date: update.created_at,
        sha: update.commit_sha_reference,
      });
    });
    
    // Sort by date descending
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    return items.slice(0, 10);
  };

  const feed = buildFeed();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">{project.title}</h1>
          {project.description && (
            <p className="text-muted-foreground">{project.description}</p>
          )}
          
          {/* Tech Stack - Auto-detected from GitHub */}
          {displayTechStack.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {displayTechStack.map((tech) => (
                <Badge key={tech} variant="outline" className="font-mono text-xs">
                  {tech}
                </Badge>
              ))}
              {techStack.length > 0 && (
                <Badge variant="secondary" className="text-xs text-green-500 border-green-500/30">
                  Auto-detected
                </Badge>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {project.repository_name && (
            <Button 
              variant="outline" 
              size="sm" 
              className="font-mono"
              asChild
            >
              <a 
                href={`https://github.com/advo-ph/${project.repository_name}`} 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <GitBranch className="h-4 w-4 mr-2" />
                {project.repository_name}
              </a>
            </Button>
          )}
          {openPRs > 0 && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <GitPullRequest className="h-3 w-3" />
              {openPRs} open PR{openPRs > 1 ? 's' : ''}
            </Badge>
          )}
          {project.preview_url && (
            <Button size="sm" asChild>
              <a href={project.preview_url} target="_blank" rel="noopener noreferrer">
                {deployment && (
                  <span className="mr-2">
                    {cloudflare.getStatusBadge(deployment.state).icon}
                  </span>
                )}
                Live Preview
                <ExternalLink className="h-4 w-4 ml-2" />
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Status Stepper */}
      <div className="p-6 bg-card border border-border rounded-xl shadow-card">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4 block">Project Status</span>
        <StatusStepper currentStatus={project.project_status} />
      </div>

      {/* Grid: Funding + Engineering Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FundingBar
          totalCents={project.total_value_cents}
          paidCents={project.amount_paid_cents}
        />
        
        {/* Live GitHub Commits Feed */}
        <div className="p-6 bg-card border border-border rounded-xl shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Engineering Feed</span>
              
              {/* Branch Selector */}
              {branches.length > 0 && (
                <Select value={currentBranch} onValueChange={setBranch}>
                  <SelectTrigger className="w-[140px] h-8 text-xs font-mono">
                    <GitBranch className="h-3 w-3 mr-1" />
                    <SelectValue placeholder="Branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map(branch => (
                      <SelectItem key={branch.name} value={branch.name} className="font-mono text-xs">
                        {branch.name}
                        {branch.protected && (
                          <span className="ml-2 text-muted-foreground">🔒</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            
            {project.repository_name && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={refetch}
                disabled={isLoading}
                className="h-8 w-8 p-0"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
          
          <div className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : feed.length > 0 ? (
              feed.slice(0, 5).map((item) => (
                <div key={item.id} className="flex gap-3 group">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center overflow-hidden ${
                      item.type === 'update' ? 'bg-accent/20' : 'bg-secondary'
                    }`}>
                      {item.type === 'commit' && item.avatar_url ? (
                        <img 
                          src={item.avatar_url} 
                          alt={item.author}
                          className="w-full h-full object-cover"
                        />
                      ) : item.type === 'update' ? (
                        <FileEdit className="h-4 w-4 text-accent" />
                      ) : (
                        <GitCommit className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="w-px flex-1 bg-border mt-2" />
                  </div>
                  <div className="pb-4 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {item.sha && (
                        <code className="text-xs text-accent font-mono bg-accent/10 px-1.5 py-0.5 rounded">
                          {item.sha}
                        </code>
                      )}
                      {item.type === 'update' && (
                        <Badge variant="outline" className="text-xs text-accent border-accent/30">
                          Update
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(item.date), { addSuffix: true })}
                      </span>
                    </div>
                    {item.html_url ? (
                      <a 
                        href={item.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-sm hover:text-accent transition-colors"
                      >
                        {item.title}
                      </a>
                    ) : (
                      <span className="font-medium text-sm">{item.title}</span>
                    )}
                    {item.body && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {item.body}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      by {item.author}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No updates yet
              </p>
            )}
          </div>
          
          <div className="mt-4 pt-4 border-t border-border flex items-center gap-2">
            {commits.length > 0 && (
              <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">
                <GitCommit className="h-3 w-3 mr-1" />
                Live from GitHub
              </Badge>
            )}
            {deployment && (
              <Badge variant="outline" className={`text-xs ${cloudflare.getStatusBadge(deployment.state).color}`}>
                {cloudflare.getStatusBadge(deployment.state).icon} CF: {cloudflare.getStatusBadge(deployment.state).label}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ProjectDashboard;
