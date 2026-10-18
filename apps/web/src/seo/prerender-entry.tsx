/**
 * Server-side entry for scripts/prerender.mjs. Not part of the browser bundle.
 *
 * It renders the real route table (AppRoutes) to HTML, with the portfolio and
 * team already in the query cache, so a crawler that never runs JavaScript
 * reads the same words a visitor sees.
 */
/* eslint-disable react-refresh/only-export-components -- a build-time entry, never hot-reloaded */
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/useAuth";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppRoutes } from "@/App";
import { fetchShipped, type ShippedProject } from "@/hooks/usePortfolio";
import { fetchTeam } from "@/hooks/useAdminTeam";
import type { PublicPerson } from "./site";

export { publicPages, structuredData, SITE_URL } from "./site";
export { buildLlmsTxt } from "./llms";

export interface PrerenderData {
  client: QueryClient;
  /** Null when the API could not be reached. */
  portfolio: ShippedProject[] | null;
  /** Active members, as the team page lists them. Null when the API could not be reached. */
  people: PublicPerson[] | null;
}

/** Fill the cache with the same queries the pages run, under the same keys. */
export async function loadData(): Promise<PrerenderData> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const [portfolio, team] = await Promise.allSettled([
    client.fetchQuery({ queryKey: ["publicPortfolio"], queryFn: fetchShipped }),
    client.fetchQuery({ queryKey: ["publicTeam"], queryFn: fetchTeam }),
  ]);
  return {
    client,
    portfolio: portfolio.status === "fulfilled" ? portfolio.value : null,
    people:
      team.status === "fulfilled"
        ? team.value
            .filter((member) => member.is_active)
            .map(({ name, role, linkedin_url, github_url }) => ({ name, role, linkedin_url, github_url }))
        : null,
  };
}

export function render(path: string, client: QueryClient) {
  return renderToString(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <TooltipProvider>
          <StaticRouter location={path}>
            <AppRoutes />
          </StaticRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
