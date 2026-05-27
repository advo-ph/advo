import { useState, useEffect, useCallback } from "react";

type Theme = "dark" | "light";

export function useTheme(userId: number | undefined) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    if (!userId) return;
    const saved = localStorage.getItem(`advo-theme-${userId}`);
    if (saved === "light") setTheme("light");
  }, [userId]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      if (userId) localStorage.setItem(`advo-theme-${userId}`, next);
      return next;
    });
  }, [userId]);

  return { theme, toggle } as const;
}
