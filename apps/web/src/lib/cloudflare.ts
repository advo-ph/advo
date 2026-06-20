/**
 * Cloudflare Pages deploy-status helpers.
 *
 * Note (audit S4): this used to read VITE_CLOUDFLARE_TOKEN and call
 * api.cloudflare.com directly from the browser — a token-in-bundle leak. The
 * token was never set in prod, so the live call was already a no-op. Live
 * deploy status now requires a backend integration (not built); the
 * client-side fetch + token read are removed. The pure helpers below
 * (status badge styling, project-name parsing) stay.
 */

export interface DeploymentStatus {
  state: "ready" | "building" | "error" | "queued";
  url: string;
  branch: string;
  commit: string;
  createdAt: string;
}

class CloudflareService {
  /**
   * Latest deployment status. No client-side Cloudflare call (no browser
   * token); returns null until a backend deploy-status endpoint exists.
   */
  async getLatestDeployment(
    _projectName: string,
    _environment: "production" | "preview" = "production",
  ): Promise<DeploymentStatus | null> {
    return null;
  }

  /**
   * Extract project name from a Cloudflare Pages URL.
   * e.g. https://my-project.pages.dev -> my-project
   */
  extractProjectName(url: string): string | null {
    try {
      const hostname = new URL(url).hostname;
      if (hostname.endsWith(".pages.dev")) {
        return hostname.replace(".pages.dev", "").split(".")[0];
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Status badge styling for the UI. */
  getStatusBadge(state: DeploymentStatus["state"]) {
    const badges = {
      ready: { label: "Live", color: "text-green-500 border-green-500/30", icon: "●" },
      building: { label: "Building", color: "text-yellow-500 border-yellow-500/30", icon: "◐" },
      error: { label: "Failed", color: "text-red-500 border-red-500/30", icon: "●" },
      queued: { label: "Queued", color: "text-muted-foreground border-border", icon: "○" },
    };
    return badges[state] || badges.queued;
  }
}

export const cloudflare = new CloudflareService();
