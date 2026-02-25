import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type PermissionRole = "admin" | "developer" | "designer" | "manager";

interface RolesData {
  role: PermissionRole | null;
  projectIds: number[];
}

async function fetchRoles(userId: string): Promise<RolesData> {
  // 1. Check team_member for this auth user
  const { data: teamMember } = await supabase
    .from("team_member")
    .select("team_member_id, permission_role")
    .eq("user_id", userId)
    .maybeSingle();

  if (teamMember && teamMember.permission_role) {
    const role = teamMember.permission_role as PermissionRole;

    // Fetch project_access rows for this team member
    const { data: accessRows } = await supabase
      .from("project_access")
      .select("project_id")
      .eq("team_member_id", teamMember.team_member_id);

    return {
      role,
      projectIds: (accessRows || []).map(
        (row) => (row as { project_id: number }).project_id
      ),
    };
  }

  // 2. Fallback: check admin_user table
  const { data: adminRow } = await supabase
    .from("admin_user")
    .select("admin_user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (adminRow) {
    return { role: "admin", projectIds: [] };
  }

  return { role: null, projectIds: [] };
}

export const useRoles = () => {
  const { user, isLoading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const { data, isLoading: queryLoading } = useQuery({
    queryKey: ["roles", userId],
    queryFn: () => fetchRoles(userId!),
    enabled: !!userId,
  });

  const role = data?.role ?? null;

  return {
    role,
    isAdmin: role === "admin",
    isDeveloper: role === "developer",
    isDesigner: role === "designer",
    isManager: role === "manager",
    projectIds: data?.projectIds ?? [],
    isLoading: authLoading || queryLoading,
  };
};
