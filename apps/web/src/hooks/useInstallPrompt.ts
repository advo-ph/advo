import { useCallback, useEffect, useState } from "react";

/**
 * Chromium's install event. Not in lib.dom, so it is declared here.
 * Firing `prompt()` is only legal once per event instance.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISSED_AT_KEY = "advo_install_dismissed_at";

/** How long a "Not now" buys. Long enough that the sheet is never a recurring tax. */
const QUIET_DAYS = 60;
const QUIET_MS = QUIET_DAYS * 24 * 60 * 60 * 1000;

/**
 * Small beat before the sheet slides up, so it lands after the page has painted
 * rather than on top of a half-drawn screen.
 */
const APPEAR_DELAY_MS = 2500;

/** How the user can actually install, which decides what the sheet may offer. */
export type InstallPlatform = "prompt" | "ios";

/**
 * True once the app is running from the home screen. Chromium reports the display
 * mode; iOS Safari never does and exposes `navigator.standalone` instead.
 */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * iOS has no `beforeinstallprompt` and never will, so the platform has to be
 * sniffed to know whether to show a button or written instructions.
 *
 * iPadOS 13+ reports itself as a Mac, which is why the touch-point check is here:
 * a real Mac reports 0, an iPad reports 5.
 */
function isIos(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1;
}

/** A dismissal inside the quiet window, or storage we are not allowed to read. */
function isDismissed(): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISSED_AT_KEY);
    if (!raw) return false;
    const at = Number(raw);
    // A corrupt value is treated as a dismissal rather than as a reason to nag.
    if (!Number.isFinite(at)) return true;
    return Date.now() - at < QUIET_MS;
  } catch {
    // Private mode or a blocked store. Staying quiet is the safer failure.
    return true;
  }
}

function rememberDismissal(): void {
  try {
    window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
  } catch {
    // Nothing to do. Worst case the sheet returns next session.
  }
}

export interface UseInstallPrompt {
  /** The sheet should be on screen. */
  visible: boolean;
  /** What the sheet is allowed to offer. `null` until a path is known. */
  platform: InstallPlatform | null;
  /** Hands off to the browser's install dialog. No-op on iOS. */
  install: () => Promise<void>;
  /** "Not now", a swipe down, or a tap outside. Persists the quiet window. */
  dismiss: () => void;
}

/**
 * Decides whether to offer installation, and on which terms.
 *
 * `enabled` is the caller's gate (this console is internal, so it is only ever
 * offered to a signed-in member). Everything else is browser state: already
 * installed, already dismissed, or no way to install at all.
 */
export function useInstallPrompt(enabled: boolean): UseInstallPrompt {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);

  // Capture the Chromium event regardless of `enabled`. It fires once, early, and
  // often before auth has resolved; missing it means the Install button can never
  // work for the rest of the page's life.
  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      // Suppresses Chrome's own mini-infobar so this sheet is the only ask.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setPlatform("prompt");
    };

    const onInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setDeferred(null);
      // Belt and braces: the app is on the home screen now, so even a browser tab
      // that never reports standalone should stop asking.
      rememberDismissal();
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // iOS never announces itself, so the only signal is the user agent.
  useEffect(() => {
    if (isIos() && !isStandalone()) setPlatform("ios");
  }, []);

  useEffect(() => {
    // Covers signing out with the sheet still open: the ask is only ever for a
    // signed-in member, so it leaves with them.
    if (!enabled) {
      setVisible(false);
      return;
    }
    if (installed || platform === null) return;
    if (isStandalone() || isDismissed()) return;

    const timer = window.setTimeout(() => setVisible(true), APPEAR_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, installed, platform]);

  const dismiss = useCallback(() => {
    rememberDismissal();
    setVisible(false);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;

    // Hide first. The browser dialog is the user's focus from here, and the event
    // is spent either way, so leaving the sheet up would strand it.
    setVisible(false);
    setDeferred(null);

    await deferred.prompt();
    const { outcome } = await deferred.userChoice;

    // Declining the browser's own dialog is still a "no". Recording it keeps the
    // sheet from reappearing on the next load with the same question.
    if (outcome === "dismissed") rememberDismissal();
  }, [deferred]);

  return { visible, platform, install, dismiss };
}
