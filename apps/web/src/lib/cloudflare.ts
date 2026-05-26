/**
 * Cloudflare Pages API Integration
 * For checking deployment status of preview URLs
 */

const CLOUDFLARE_API_TOKEN = import.meta.env.VITE_CLOUDFLARE_TOKEN || '';
const CLOUDFLARE_ACCOUNT_ID = import.meta.env.VITE_CLOUDFLARE_ACCOUNT_ID || '';

export interface CloudflareDeployment {
  id: string;
  url: string;
  environment: 'production' | 'preview';
  project_name: string;
  deployment_trigger: {
    type: string;
    metadata: {
      branch: string;
      commit_hash: string;
      commit_message: string;
    };
  };
  latest_stage: {
    name: string;
    status: 'idle' | 'active' | 'success' | 'failure' | 'canceled';
    started_on: string;
    ended_on: string | null;
  };
  created_on: string;
}

export interface DeploymentStatus {
  state: 'ready' | 'building' | 'error' | 'queued';
  url: string;
  branch: string;
  commit: string;
  createdAt: string;
}

class CloudflareService {
  private baseUrl = 'https://api.cloudflare.com/client/v4';

  private get headers() {
    return {
      'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Get deployments for a Cloudflare Pages project
   */
  async getDeployments(projectName: string): Promise<CloudflareDeployment[]> {
    if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
      console.warn('Cloudflare credentials not configured');
      return [];
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${projectName}/deployments`,
        { headers: this.headers }
      );

      if (!response.ok) {
        throw new Error(`Cloudflare API error: ${response.status}`);
      }

      const data = await response.json();
      return data.result || [];
    } catch (error) {
      console.error('Failed to fetch Cloudflare deployments:', error);
      return [];
    }
  }

  /**
   * Get the latest deployment status
   */
  async getLatestDeployment(projectName: string, environment: 'production' | 'preview' = 'production'): Promise<DeploymentStatus | null> {
    const deployments = await this.getDeployments(projectName);
    
    const deployment = deployments.find(d => d.environment === environment) || deployments[0];
    
    if (!deployment) return null;

    return {
      state: this.mapStatus(deployment.latest_stage.status),
      url: deployment.url,
      branch: deployment.deployment_trigger?.metadata?.branch || 'main',
      commit: deployment.deployment_trigger?.metadata?.commit_hash?.substring(0, 7) || '',
      createdAt: deployment.created_on,
    };
  }

  /**
   * Map Cloudflare status to our unified status
   */
  private mapStatus(status: string): 'ready' | 'building' | 'error' | 'queued' {
    switch (status) {
      case 'success':
        return 'ready';
      case 'active':
        return 'building';
      case 'failure':
      case 'canceled':
        return 'error';
      case 'idle':
      default:
        return 'queued';
    }
  }

  /**
   * Extract project name from Cloudflare Pages URL
   * e.g., https://my-project.pages.dev -> my-project
   */
  extractProjectName(url: string): string | null {
    try {
      const hostname = new URL(url).hostname;
      // Handle *.pages.dev URLs
      if (hostname.endsWith('.pages.dev')) {
        return hostname.replace('.pages.dev', '').split('.')[0];
      }
      // For custom domains, return null (need manual mapping)
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get status badge styling for UI
   */
  getStatusBadge(state: DeploymentStatus['state']) {
    const badges = {
      ready: {
        label: 'Live',
        color: 'text-green-500 border-green-500/30',
        icon: '●',
      },
      building: {
        label: 'Building',
        color: 'text-yellow-500 border-yellow-500/30',
        icon: '◐',
      },
      error: {
        label: 'Failed',
        color: 'text-red-500 border-red-500/30',
        icon: '●',
      },
      queued: {
        label: 'Queued',
        color: 'text-muted-foreground border-border',
        icon: '○',
      },
    };

    return badges[state] || badges.queued;
  }
}

export const cloudflare = new CloudflareService();
