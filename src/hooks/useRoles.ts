import { useAuth } from "@/hooks/useAuth";

export const useRoles = () => {
  const { user } = useAuth();

  const role = user?.role || null;

  return {
    role,
    isAdmin: role === "admin",
    isDeveloper: false,
    isDesigner: false,
    isManager: false,
    projectIds: [] as number[],
    isLoading: false,
  };
};
