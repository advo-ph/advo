import { useState, useEffect, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import type { Project, Client, Lead, RecentActivity, UpcomingDeadline } from "@/types/admin";
import * as db from "@/lib/db";
import { formatDistanceToNow } from "date-fns";

interface UseAdminDataReturn {
  projects: Project[];
  clients: Client[];
  leads: Lead[];
  recentActivity: RecentActivity[];
  upcomingDeadlines: UpcomingDeadline[];
  isLoading: boolean;
  refetch: () => Promise<void>;
}

export const useAdminData = (user: User | null): UseAdminDataReturn => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [upcomingDeadlines, setUpcomingDeadlines] = useState<UpcomingDeadline[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    const [projectsRes, clientsRes, leadsRes, activityRes, deadlinesRes] = await Promise.all([
      db.getProjects(),
      db.getClients(),
      db.getLeads(),
      db.getRecentProgressUpdates(5),
      db.getUpcomingDeadlines(5),
    ]);

    if (projectsRes.data) setProjects(projectsRes.data);
    
    if (clientsRes.data) {
      const clientsWithCount = clientsRes.data.map(c => ({
        ...c,
        projectCount: projectsRes.data?.filter(p => p.client_id === c.client_id).length || 0,
      }));
      setClients(clientsWithCount);
    }

    if (leadsRes.data) setLeads(leadsRes.data);

    // Build activity feed from real data
    const activities: RecentActivity[] = [];
    if (activityRes.data) activities.push(...activityRes.data);
    if (leadsRes.data) {
      leadsRes.data.slice(0, 3).forEach((l) => {
        activities.push({
          action: "New lead received",
          target: l.company || l.name,
          time: formatDistanceToNow(new Date(l.submitted_at), { addSuffix: true }),
        });
      });
    }
    setRecentActivity(activities.slice(0, 6));

    if (deadlinesRes.data) setUpcomingDeadlines(deadlinesRes.data);

    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    projects,
    clients,
    leads,
    recentActivity,
    upcomingDeadlines,
    isLoading,
    refetch: fetchData,
  };
};
