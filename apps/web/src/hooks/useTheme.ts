import { useState, useEffect, useCallback } from "react";

type Theme = "dark" | "light";

/** Light is the default for an account that has never picked a side. */
const DEFAULT_THEME: Theme = "light";

const storageKey = (userId: number) => `advo-theme-${userId}`;

export function useTheme(userId: number | undefined) {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);

  // The choice is per account, not per browser: two people on one machine keep
  // their own setting. Assigns in both directions so signing out of a dark
  // account and into a fresh one does not leave the new account in dark.
  useEffect(() => {
    if (!userId) {
      setTheme(DEFAULT_THEME);
      return;
    }
    const saved = localStorage.getItem(storageKey(userId));
    setTheme(saved === "dark" || saved === "light" ? saved : DEFAULT_THEME);
  }, [userId]);

  // The theme class has to sit on <html>, above <body>. `body` resolves
  // `color: hsl(var(--foreground))` once, in its own scope; a class further down
  // the tree redefines the variable but never re-resolves that inherited colour,
  // so in light mode every element without an explicit text colour keeps the dark
  // theme's near-white ink on a white page. Radix portals and the toasters mount
  // on <body> as well, outside any wrapper div. Hoisting the class fixes both.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("admin-light", theme === "light");
    return () => root.classList.remove("admin-light");
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      if (userId) localStorage.setItem(storageKey(userId), next);
      return next;
    });
  }, [userId]);

  return { theme, toggle } as const;
}
