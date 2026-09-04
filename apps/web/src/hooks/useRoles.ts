import { useEffect, useRef, useState, useCallback, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/useAuth";
import { get } from "@/lib/api";

const VIEW_AS_MEMBER_KEY = "advo_view_as_member";
const VIEW_AS_MEMBER_EVENT = "advo:view-as-member";

const viewAsMemberStore = {
  get: () => sessionStorage.getItem(VIEW_AS_MEMBER_KEY) === "1",
  set: (on: boolean) => {
    if (on) sessionStorage.setItem(VIEW_AS_MEMBER_KEY, "1");
    else sessionStorage.removeItem(VIEW_AS_MEMBER_KEY);
    window.dispatchEvent(new Event(VIEW_AS_MEMBER_EVENT));
  },
  subscribe: (cb: () => void) => {
    window.addEventListener(VIEW_AS_MEMBER_EVENT, cb);
    return () => window.removeEventListener(VIEW_AS_MEMBER_EVENT, cb);
  },
};

interface MemberRow {
  assignmentId: number;
  teamMemberId: number;
  name: string;
  projectRole: string;
}

interface MeResponse {
  userId: number;
  email: string;
  role: string;
  isOwner: boolean;
  teamMemberId: number | null;
}

/**
 * Provides the minimal role surface that Phase 8 and the project people list need.
 *
 * isAdmin       — mirrors user.role === "admin". ProtectedRoute gates the whole
 *   /admin console on this, so it must never be undefined: an undefined value
 *   reads as "not an admin" and silently redirects every admin to /hub.
 * projectIds    — projects the user may reach when they are not an admin. Only
 *   consulted by ProtectedRoute's requireProjectAccess branch, which nothing
 *   currently uses; admins short-circuit it. Empty is the correct default.
 * isOwner       — true for the owner account. Drives money visibility in Phase 8.
 * teamMemberId  — the current user's team_member_id, or null if they have no roster row.
 * getProjectRole(projectId) — the first project_role this user holds on that project.
 *   Fetched lazily from GET /api/projects/:id/members on first call per projectId.
 *   Cached in local state; does not re-fetch on re-render.
 * isLoading     — true while /api/auth/me is in flight.
 *
 * Keep the surface minimal, but do not drop isAdmin or projectIds without first
 * updating every ProtectedRoute consumer in the same change.
 */
export const useRoles = () => {
  const { user } = useAuth();

  const [rawIsOwner, setIsOwner] = useState(false);
  const viewAsMember = useSyncExternalStore(viewAsMemberStore.subscribe, viewAsMemberStore.get);
  const isOwner = rawIsOwner && !viewAsMember;
  const [teamMemberId, setTeamMemberId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Cache: projectId → first project_role for the current user, or null if not assigned.
  const projectRoleCache = useRef<Map<number, string | null>>(new Map());
  // Track in-flight fetches so concurrent calls don't double-fetch the same project.
  const fetchingSet = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!user) {
      setIsOwner(false);
      setTeamMemberId(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    get<MeResponse>("/api/auth/me")
      .then((res) => {
        if (res.data && !res.error) {
          setIsOwner(res.data.isOwner ?? false);
          setTeamMemberId(res.data.teamMemberId ?? null);
        }
      })
      .catch(() => {
        // Leave previous values; a network blip should not zero out the owner flag.
      })
      .finally(() => {
        setIsLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId]); // intentionally keyed on userId only — user object identity changes on every render

  /**
   * Return the first project_role this user holds on projectId.
   * Fetches lazily and caches the result — safe to call on every render.
   * Returns null when not assigned, or while the fetch is in flight.
   */
  const getProjectRole = useCallback(
    (projectId: number): string | null => {
      if (projectRoleCache.current.has(projectId)) {
        return projectRoleCache.current.get(projectId) ?? null;
      }

      if (fetchingSet.current.has(projectId)) {
        return null; // fetch already in flight
      }

      fetchingSet.current.add(projectId);

      get<MemberRow[]>(`/api/projects/${projectId}/members`)
        .then((res) => {
          if (res.data && !res.error) {
            const myId = teamMemberId;
            const myRow = myId != null
              ? res.data.find((r) => r.teamMemberId === myId)
              : undefined;
            projectRoleCache.current.set(projectId, myRow?.projectRole ?? null);
          } else {
            // 403 or error — not assigned
            projectRoleCache.current.set(projectId, null);
          }
        })
        .catch(() => {
          projectRoleCache.current.set(projectId, null);
        })
        .finally(() => {
          fetchingSet.current.delete(projectId);
        });

      return null; // will be available on next render cycle after cache is set
    },
    [teamMemberId],
  );

  return {
    isAdmin: user?.role === "admin",
    projectIds: [] as number[],
    isOwner,
    teamMemberId,
    getProjectRole,
    isLoading,
    viewAsMember,
    setViewAsMember: viewAsMemberStore.set,
  };
};
