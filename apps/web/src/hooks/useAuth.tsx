import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import {
  get,
  post,
  setTokens,
  clearTokens,
  hasRefreshToken,
  ensureFreshAccessToken,
  onAuthRejected,
  onTokensChanged,
} from "@/lib/api";
import {
  getSavedAccounts,
  rememberAccount,
  forgetAccount,
  getDeviceKeyFor,
  getLastUser,
  setLastUser,
  type SavedAccount,
} from "@/lib/saved-accounts";
import AccountPanel from "@/components/AccountPanel";

export interface AuthUser {
  userId: number;
  email: string;
  role: "admin" | "team" | "client";
  /** From team_member.name where the roster knows the person, never derived from the email. */
  displayName: string;
  avatarUrl: string | null;
  id: string; // alias for compatibility (userId as string)
}

/** Shape shared by /login, /magic-link/verify, /refresh and /device-login. */
interface AuthUserPayload {
  userId: number;
  email: string;
  role: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ error: string | null; user: AuthUser | null }>;
  loginWithMagicLink: (email: string) => Promise<{ error: string | null }>;
  verifyMagicLink: (token: string) => Promise<{ error: string | null; user: AuthUser | null }>;
  /** Accounts this browser remembers. Survives sign-out on purpose. */
  savedAccounts: SavedAccount[];
  /** One tap, no typing. Exchanges the saved device key for a fresh session. */
  loginWithSavedAccount: (account: SavedAccount) => Promise<{ error: string | null; user: AuthUser | null }>;
  forgetSavedAccount: (userId: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const mapUser = (u: AuthUserPayload): AuthUser => ({
  userId: u.userId,
  email: u.email,
  role: u.role as AuthUser["role"],
  displayName: u.displayName || u.email.split("@")[0] || u.email,
  avatarUrl: u.avatarUrl ?? null,
  id: String(u.userId),
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  /**
   * Seeded from the cached identity rather than null.
   *
   * A cold load used to start signed out and only become signed in once /api/auth/me came
   * back. Offline, or against a restarting API, that request failed, the old code read the
   * failure as a rejection and deleted the credential, and the user was signed out for good
   * by a problem that had nothing to do with their session. Starting from the cache means an
   * outage costs the user nothing, and the background check below is still the only thing
   * that can grant or revoke anything real.
   */
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (!hasRefreshToken()) return null;
    const cached = getLastUser();
    return cached ? mapUser(cached) : null;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>(() => getSavedAccounts());

  /** Guards the background restore against re-entry from cross-tab token changes. */
  const restoring = useRef(false);

  const adoptUser = useCallback((payload: AuthUserPayload) => {
    const mapped = mapUser(payload);
    setUser(mapped);
    setLastUser({
      userId: mapped.userId,
      email: mapped.email,
      role: mapped.role,
      displayName: mapped.displayName,
      avatarUrl: mapped.avatarUrl,
    });
    return mapped;
  }, []);

  /**
   * Revoke device keys for accounts that a new sign-in replaced. Best effort and not awaited:
   * the browser no longer holds these keys, so a failed revoke only leaves a server-side
   * record that nothing here can use.
   */
  const revokeDisplaced = useCallback((displaced: SavedAccount[]) => {
    for (const account of displaced) {
      void post("/api/auth/device-key/revoke", { deviceKey: account.deviceKey });
    }
  }, []);

  /**
   * Ask the server to remember this browser, so the account can be offered as a one-tap
   * target after sign-out. Failure is not surfaced: not being remembered is a smaller
   * problem than a login that reports an error after it has already succeeded.
   */
  const registerDevice = useCallback(async (u: AuthUser) => {
    const res = await post<{ deviceKey: string; user: AuthUserPayload }>(
      "/api/auth/device-key",
      { deviceKey: getDeviceKeyFor(u.userId) }
    );
    if (res.error || !res.data?.deviceKey) return;

    const remembered = rememberAccount({
      userId: u.userId,
      email: u.email,
      displayName: res.data.user?.displayName || u.displayName,
      avatarUrl: res.data.user?.avatarUrl ?? u.avatarUrl,
      role: u.role,
      deviceKey: res.data.deviceKey,
    });
    setSavedAccounts(remembered.accounts);
    revokeDisplaced(remembered.displaced);
  }, [revokeDisplaced]);

  /**
   * Confirm the cached identity against the server.
   *
   * The only outcome that signs anybody out is a genuine rejection, which arrives through
   * the onAuthRejected subscription below rather than being inferred here. A failure this
   * function cannot explain leaves the cached user in place.
   */
  const restoreSession = useCallback(async () => {
    if (restoring.current) return;
    restoring.current = true;
    try {
      if (!hasRefreshToken()) {
        setUser(null);
        setLastUser(null);
        return;
      }

      // Skip the 401 we already know is coming when the access token has aged out. Nothing
      // to do with the result: a failure here still gets one honest attempt at /me below.
      await ensureFreshAccessToken();

      const res = await get<AuthUserPayload & { isActive: boolean }>("/api/auth/me");

      if (res.data && !res.error) {
        adoptUser(res.data);
      }
      // No else. A missing body or an error string here can mean "offline", "API
      // restarting", or "proxy returned 502" just as easily as it can mean "signed out",
      // and only the server saying 401 is allowed to end a session.
    } finally {
      restoring.current = false;
      setIsLoading(false);
    }
  }, [adoptUser]);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  /** The server rejected the credential, or another tab signed out. Either way, it is over. */
  useEffect(
    () =>
      onAuthRejected(() => {
        setUser(null);
        setLastUser(null);
      }),
    []
  );

  /** Another tab signed in or refreshed. Adopt its session instead of sitting stale. */
  useEffect(
    () =>
      onTokensChanged(() => {
        setSavedAccounts(getSavedAccounts());
        if (hasRefreshToken()) void restoreSession();
      }),
    [restoreSession]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await post<{
        accessToken: string;
        refreshToken: string;
        user: AuthUserPayload;
      }>("/api/auth/login", { email, password });

      if (res.error || !res.data) {
        return { error: res.error || "Login failed", user: null };
      }

      setTokens(res.data.accessToken, res.data.refreshToken);
      const mapped = adoptUser(res.data.user);
      await registerDevice(mapped);
      return { error: null, user: mapped };
    },
    [adoptUser, registerDevice]
  );

  const loginWithMagicLink = useCallback(async (email: string) => {
    const res = await post<{ message: string }>("/api/auth/magic-link", { email });
    return { error: res.error };
  }, []);

  const verifyMagicLink = useCallback(
    async (token: string) => {
      const res = await post<{
        accessToken: string;
        refreshToken: string;
        user: AuthUserPayload;
      }>("/api/auth/magic-link/verify", { token });

      if (res.error || !res.data) {
        return { error: res.error || "Invalid magic link", user: null };
      }

      setTokens(res.data.accessToken, res.data.refreshToken);
      const mapped = adoptUser(res.data.user);
      await registerDevice(mapped);
      return { error: null, user: mapped };
    },
    [adoptUser, registerDevice]
  );

  const loginWithSavedAccount = useCallback(
    async (account: SavedAccount) => {
      const res = await post<{
        accessToken: string;
        refreshToken: string;
        deviceKey: string;
        user: AuthUserPayload;
      }>("/api/auth/device-login", { deviceKey: account.deviceKey });

      if (res.error || !res.data) {
        return { error: res.error || "Saved login failed", user: null };
      }

      setTokens(res.data.accessToken, res.data.refreshToken);
      const mapped = adoptUser(res.data.user);

      // Refresh the stored label.
      const remembered = rememberAccount({
        userId: mapped.userId,
        email: mapped.email,
        displayName: mapped.displayName,
        avatarUrl: mapped.avatarUrl,
        role: mapped.role,
        deviceKey: account.deviceKey,
      });
      setSavedAccounts(remembered.accounts);
      revokeDisplaced(remembered.displaced);

      return { error: null, user: mapped };
    },
    [adoptUser, revokeDisplaced]
  );

  const forgetSavedAccount = useCallback(async (userId: number) => {
    const account = getSavedAccounts().find((a) => a.userId === userId);
    setSavedAccounts(forgetAccount(userId));
    if (account) {
      // Best effort. The button is already gone locally; a failed revoke leaves a key the
      // browser no longer holds, which cannot be used from here anyway.
      await post("/api/auth/device-key/revoke", { deviceKey: account.deviceKey });
    }
  }, []);

  /**
   * Ends the session. Deliberately does not touch the saved account list — the whole point
   * of saving an account is that it is still offered on the login screen afterwards.
   */
  const signOut = useCallback(async () => {
    const refreshToken = localStorage.getItem("advo_refresh_token");
    if (refreshToken) {
      await post("/api/auth/logout", { refreshToken });
    }
    clearTokens();
    setLastUser(null);
    setUser(null);
    setSavedAccounts(getSavedAccounts());
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        signOut,
        login,
        loginWithMagicLink,
        verifyMagicLink,
        savedAccounts,
        loginWithSavedAccount,
        forgetSavedAccount,
      }}
    >
      {children}
      {/* Mounted here rather than on a page, because every signed-in role needs to be able
          to change their password and only admins have a settings screen. */}
      {user ? (
        <AccountPanel
          user={{ displayName: user.displayName, email: user.email, role: user.role }}
        />
      ) : null}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
