import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";

interface ProtectedRouteProps {
  requireAuth?: boolean;
  requireAdmin?: boolean;
  requireProjectAccess?: number;
}

const ProtectedRoute = ({
  requireAuth = false,
  requireAdmin = false,
  requireProjectAccess,
}: ProtectedRouteProps) => {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, projectIds, isLoading: rolesLoading } = useRoles();
  const location = useLocation();

  // Show spinner while loading
  if (authLoading || rolesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Auth check — pass intended destination so login can redirect back
  if ((requireAuth || requireAdmin) && !user) {
    return <Navigate to={`/login?redirectTo=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // Admin check
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/hub" replace />;
  }

  // Project access check
  if (
    requireProjectAccess !== undefined &&
    !isAdmin &&
    !projectIds.includes(requireProjectAccess)
  ) {
    return <Navigate to="/hub" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;

