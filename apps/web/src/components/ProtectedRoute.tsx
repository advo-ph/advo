import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";

interface ProtectedRouteProps {
  requireAuth?: boolean;
  requireAdmin?: boolean;
  requireProjectAccess?: number;
  redirectAdminTo?: string;
}

const ProtectedRoute = ({
  requireAuth = false,
  requireAdmin = false,
  requireProjectAccess,
  redirectAdminTo,
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

  // Auth check — pass intended destination so login can redirect back.
  // Admin-area destinations send to /members; everything else to /clients.
  if ((requireAuth || requireAdmin) && !user) {
    const loginBase = location.pathname.startsWith("/admin") ? "/members" : "/clients";
    return <Navigate to={`${loginBase}?redirectTo=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // Admin check
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/hub" replace />;
  }

  // Bounce admins away from client-only routes
  if (redirectAdminTo && isAdmin) {
    return <Navigate to={redirectAdminTo} replace />;
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

