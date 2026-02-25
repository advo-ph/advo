import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import type { Project, Client, Lead, RecentActivity, UpcomingDeadline } from "@/types/admin";
import * as db from "@/lib/db";
import { formatDistanceToNow } from "date-fns";

interface AdminData {
  projects: Project[];
  clients: Client[];
  leads: Lead[];
  recentActivity: RecentActivity[];
  upcomingDeadlines: UpcomingDeadline[];
}

async function fetchAdminData(): Promise<AdminData> {
  const [projectsRes, clientsRes, leadsRes, activityRes, deadlinesRes] =
    await Promise.all([
      db.getProjects(),
      db.getClients(),
      db.getLeads(),
      db.getRecentProgressUpdates(5),
      db.getUpcomingDeadlines(5),
    ]);

  const projects = projectsRes.data || [];

  const clients = (clientsRes.data || []).map((c) => ({
    ...c,
    projectCount:
      projects.filter((p) => p.client_id === c.client_id).length || 0,
  }));

  const leads = leadsRes.data || [];

  // Build activity feed from real data
  const activities: RecentActivity[] = [];
  if (activityRes.data) activities.push(...activityRes.data);
  leads.slice(0, 3).forEach((l) => {
    activities.push({
      action: "New lead received",
      target: l.company || l.name,
      time: formatDistanceToNow(new Date(l.submitted_at), { addSuffix: true }),
    });
  });

  return {
    projects,
    clients,
    leads,
    recentActivity: activities.slice(0, 6),
    upcomingDeadlines: deadlinesRes.data || [],
  };
}

interface UseAdminDataReturn {
  projects: Project[];
  clients: Client[];
  leads: Lead[];
  recentActivity: RecentActivity[];
  upcomingDeadlines: UpcomingDeadline[];
  isLoading: boolean;
  refetch: () => void;
}

export const useAdminData = (user: User | null): UseAdminDataReturn => {
  const {
    data,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["adminData", user?.id],
    queryFn: fetchAdminData,
    enabled: !!user,
  });

  return {
    projects: data?.projects ?? [],
    clients: data?.clients ?? [],
    leads: data?.leads ?? [],
    recentActivity: data?.recentActivity ?? [],
    upcomingDeadlines: data?.upcomingDeadlines ?? [],
    isLoading,
    refetch,
  };
};
