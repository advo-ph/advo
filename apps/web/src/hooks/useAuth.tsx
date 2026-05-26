import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import {
  get,
  post,
  setTokens,
  clearTokens,
  hasRefreshToken,
} from "@/lib/api";

export interface AuthUser {
  userId: number;
  email: string;
  role: "admin" | "team" | "client";
  id: string; // alias for compatibility (userId as string)
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ error: string | null; user: AuthUser | null }>;
  loginWithMagicLink: (email: string) => Promise<{ error: string | null }>;
  verifyMagicLink: (token: string) => Promise<{ error: string | null; user: AuthUser | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const mapUser = (u: { userId: number; email: string; role: string }): AuthUser => ({
    userId: u.userId,
    email: u.email,
    role: u.role as AuthUser["role"],
    id: String(u.userId),
  });

  // On mount, try to restore session via refresh token
  useEffect(() => {
    (async () => {
      if (!hasRefreshToken()) {
        setIsLoading(false);
        return;
      }

      const res = await get<{
        userId: number;
        email: string;
        role: string;
        isActive: boolean;
      }>("/api/auth/me");

      if (res.data && !res.error) {
        setUser(mapUser(res.data));
      } else {
        clearTokens();
      }
      setIsLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await post<{
      accessToken: string;
      refreshToken: string;
      user: { userId: number; email: string; role: string };
    }>("/api/auth/login", { email, password });

    if (res.error || !res.data) {
      return { error: res.error || "Login failed", user: null };
    }

    setTokens(res.data.accessToken, res.data.refreshToken);
    const mapped = mapUser(res.data.user);
    setUser(mapped);
    return { error: null, user: mapped };
  }, []);

  const loginWithMagicLink = useCallback(async (email: string) => {
    const res = await post<{ message: string }>("/api/auth/magic-link", { email });
    return { error: res.error };
  }, []);

  const verifyMagicLink = useCallback(async (token: string) => {
    const res = await post<{
      accessToken: string;
      refreshToken: string;
      user: { userId: number; email: string; role: string };
    }>("/api/auth/magic-link/verify", { token });

    if (res.error || !res.data) {
      return { error: res.error || "Invalid magic link", user: null };
    }

    setTokens(res.data.accessToken, res.data.refreshToken);
    const mapped = mapUser(res.data.user);
    setUser(mapped);
    return { error: null, user: mapped };
  }, []);

  const signOut = useCallback(async () => {
    const refreshToken = localStorage.getItem("advo_refresh_token");
    if (refreshToken) {
      await post("/api/auth/logout", { refreshToken });
    }
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, signOut, login, loginWithMagicLink, verifyMagicLink }}
    >
      {children}
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
