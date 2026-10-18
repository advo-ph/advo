import { useEffect } from "react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import { isNativeApp } from "@/lib/platform";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";

/**
 * Members-only route allowlist for the native shell. Renders nothing — a
 * pure side-effect redirector, run on `isNativeApp()` only, so the public
 * web app at advo.ph (where `isNativeApp()` is always `false`) is completely
 * unaffected.
 *
 * Allowlist, not denylist: the public marketing site keeps growing routes
 * (`/`, `/team`, `/client-guide`, ...) that must never be reachable inside
 * the native app, so this explicitly lists what IS reachable instead of
 * trying to keep a denylist in sync with every new public page.
 */
const ALLOWED_PATTERNS = [
  "/login",
  "/members",
  "/clients",
  "/p/:token",
  "/terms",
  "/privacy",
  "/refund",
  "/dispute",
  "/hub",
  "/admin",
  "/admin/:section",
];

function isAllowedPath(pathname: string): boolean {
  return ALLOWED_PATTERNS.some((pattern) => matchPath({ path: pattern, end: true }, pathname) !== null);
}

const NativeGate = () => {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: rolesLoading } = useRoles();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNativeApp()) return;
    if (authLoading || rolesLoading) return;
    if (isAllowedPath(location.pathname)) return;

    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    navigate(isAdmin ? "/admin" : "/hub", { replace: true });
  }, [location.pathname, user, isAdmin, authLoading, rolesLoading, navigate]);

  return null;
};

export default NativeGate;
