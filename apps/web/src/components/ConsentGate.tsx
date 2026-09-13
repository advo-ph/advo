/**
 * ConsentGate — the explicit opt-in/opt-out choice ADVO must obtain before any
 * non-essential tracking runs (analytics, device fingerprinting, session replay).
 *
 * This module owns the DECISION only. It never sends a beacon, never reads a
 * device signal, and never loads a third-party script. Other modules read the
 * decision synchronously via `readConsent()` / `isConsentGranted()` and are
 * responsible for their own behaviour.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useReducedMotion } from "framer-motion";

export type ConsentStatus = "granted" | "denied" | "unset";

export interface ConsentRecord {
  /** The visitor's choice. */
  status: ConsentStatus;
  /** Epoch ms the choice was made. `null` while unset. */
  decided_at: number | null;
  /** Schema version, so a materially changed notice can invalidate old consent. */
  version: number;
}

const STORAGE_KEY = "advo.consent";

/**
 * Every browser-side identifier the tracker (lib/track.ts) may write once consent is
 * granted. A refusal or withdrawal removes all of them, so /privacy can truthfully say
 * that withdrawing clears what is stored in the browser. Owned here, not in track.ts,
 * because track.ts already imports this module.
 */
export const TRACKING_STORAGE_KEY = {
  visitorFallback: "advo.visitor.fallback",
  visitorFingerprint: "advo.visitor.fingerprint",
  session: "advo.session",
} as const;

const clearTrackingStorage = (): void => {
  try {
    window.localStorage.removeItem(TRACKING_STORAGE_KEY.visitorFallback);
    window.localStorage.removeItem(TRACKING_STORAGE_KEY.visitorFingerprint);
    window.sessionStorage.removeItem(TRACKING_STORAGE_KEY.session);
  } catch {
    /* storage unavailable — nothing was stored either */
  }
};

/**
 * Bump when the privacy notice changes in a way that materially widens what is
 * collected. Any stored record below this version is treated as unset and the
 * visitor is asked again.
 */
export const CONSENT_VERSION = 1;

/**
 * A denial is durable — it is NOT re-prompted on the next page load. We only
 * ask again after this long, or when the visitor re-opens the choice
 * themselves from /privacy.
 */
const REASK_AFTER_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

const UNSET: ConsentRecord = { status: "unset", decided_at: null, version: CONSENT_VERSION };

const CHANGE_EVENT = "advo:consent-change";
const OPEN_EVENT = "advo:consent-open";

/** Synchronous in-memory mirror so readers never pay a localStorage hit. */
let cachedRecord: ConsentRecord | null = null;

const isExpired = (record: ConsentRecord) =>
  record.decided_at !== null && Date.now() - record.decided_at > REASK_AFTER_MS;

const loadRecord = (): ConsentRecord => {
  if (typeof window === "undefined") return UNSET;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return UNSET;
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
    if (parsed.status !== "granted" && parsed.status !== "denied") return UNSET;
    if (parsed.version !== CONSENT_VERSION) return UNSET;
    const record: ConsentRecord = {
      status: parsed.status,
      decided_at: typeof parsed.decided_at === "number" ? parsed.decided_at : null,
      version: CONSENT_VERSION,
    };
    return isExpired(record) ? UNSET : record;
  } catch {
    // Private mode / disabled storage — behave as if no choice was ever made,
    // which means: no non-essential tracking.
    return UNSET;
  }
};

/**
 * Read the current decision synchronously. Safe to call during render, in a
 * module top-level, or from non-React code.
 */
export const readConsent = (): ConsentRecord => {
  if (cachedRecord === null) cachedRecord = loadRecord();
  return cachedRecord;
};

/**
 * THE SITE FLAG. Visitor analytics is off unless the deployment explicitly sets
 * `VITE_ANALYTICS=true` — unset, "", "false", "0" are all off. While off, the prompt never
 * renders, the tracker sends nothing, and /privacy says no analytics run. It stays off until
 * the prompt has been reviewed in a browser and the privacy text has had legal review.
 */
export const isAnalyticsEnabled = (): boolean => {
  const raw = import.meta.env.VITE_ANALYTICS as string | boolean | undefined;
  return raw === true || raw === "true" || raw === "1";
};

/** Convenience: has the visitor affirmatively allowed non-essential tracking? */
export const isConsentGranted = (): boolean => readConsent().status === "granted";

/** Write a decision and notify every subscriber in this tab. */
export const setConsent = (status: Exclude<ConsentStatus, "unset">): ConsentRecord => {
  const record: ConsentRecord = { status, decided_at: Date.now(), version: CONSENT_VERSION };
  cachedRecord = record;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage unavailable: the decision still holds for this page session.
  }
  if (status === "denied") clearTrackingStorage();
  window.dispatchEvent(new CustomEvent<ConsentRecord>(CHANGE_EVENT, { detail: record }));
  return record;
};

/** Clear the decision entirely (the visitor withdrawing consent outright). */
export const resetConsent = (): void => {
  cachedRecord = UNSET;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* no-op */
  }
  clearTrackingStorage();
  window.dispatchEvent(new CustomEvent<ConsentRecord>(CHANGE_EVENT, { detail: UNSET }));
};

/** Re-open the choice on demand (e.g. a "Change your choice" link on /privacy). */
export const openConsentPrompt = (): void => {
  window.dispatchEvent(new Event(OPEN_EVENT));
};

/** Subscribe to decision changes. Returns an unsubscribe function. */
export const subscribeConsent = (
  listener: (record: ConsentRecord) => void,
): (() => void) => {
  const onChange = (event: Event) => {
    const detail = (event as CustomEvent<ConsentRecord>).detail;
    listener(detail ?? readConsent());
  };
  // Another tab wrote a decision — invalidate the mirror and re-read.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    cachedRecord = null;
    listener(readConsent());
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
};

/**
 * Routes that never show the prompt — the signed-in product surface. `/work` was here on
 * the Mac branch, where it was a staff page; on main `/work/:slug` is a PUBLIC case study,
 * so it is a marketing route and gets the prompt like any other.
 */
const EXCLUDED_PREFIX = ["/admin", "/hub"];

const ConsentGate = () => {
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);

  const [isVisible, setIsVisible] = useState(() => readConsent().status === "unset");

  useEffect(() => {
    const unsubscribe = subscribeConsent((record) => {
      setIsVisible(record.status === "unset");
    });
    const onOpen = () => setIsVisible(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      unsubscribe();
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // Escape dismisses the prompt for this page view without recording a
  // decision — it is NOT taken as consent, and it will be asked again.
  useEffect(() => {
    if (!isVisible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsVisible(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isVisible]);

  const decide = useCallback((status: Exclude<ConsentStatus, "unset">) => {
    setConsent(status);
    setIsVisible(false);
  }, []);

  const isExcluded = EXCLUDED_PREFIX.some(
    (prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`),
  );
  if (!isAnalyticsEnabled() || isExcluded || !isVisible) return null;

  return (
    <div
      // Non-modal: no backdrop, no focus trap, no scroll lock. The page stays
      // fully usable and every control behind it stays reachable.
      role="region"
      aria-label="Privacy choice"
      ref={panelRef}
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 60,
        maxWidth: 560,
        marginLeft: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "16px 18px",
        // House monotone: solid #0C0C0C, 1px hairline, no glass, no shadow.
        borderRadius: 8,
        border: "1px solid hsl(0 0% 100% / 0.12)",
        background: "#0C0C0C",
        color: "hsl(0 0% 96%)",
        animation: reduceMotion ? undefined : "advo-consent-rise 200ms ease-out",
      }}
    >
      <style>{`@keyframes advo-consent-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){[aria-label="Privacy choice"]{animation:none !important}}`}</style>

      <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0, color: "hsl(0 0% 78%)" }}>
        <strong style={{ color: "hsl(0 0% 98%)", fontWeight: 600 }}>
          Analytics and device recognition.
        </strong>{" "}
        With your permission we record which pages and sections you view, store a random visitor
        id in your browser, and compute a{" "}
        <strong style={{ color: "hsl(0 0% 92%)", fontWeight: 600 }}>device fingerprint</strong> — an
        identifier derived from your browser and device settings — so we recognise a return visit.
        If you are signed in, that activity is linked to your account. Say no and none of it runs.
        Either way the site works the same.{" "}
        <Link to="/privacy" style={{ textDecoration: "underline", color: "hsl(0 0% 92%)" }}>
          Read the privacy notice
        </Link>
        .
      </p>

      <div style={{ display: "flex", gap: 8 }}>
        {/* Both buttons are deliberately identical in size, weight, and colour:
            refusing must cost no more effort or attention than accepting. */}
        <button
          type="button"
          onClick={() => decide("denied")}
          style={consentButtonStyle}
        >
          No, don't track me
        </button>
        <button
          type="button"
          onClick={() => decide("granted")}
          style={consentButtonStyle}
        >
          Yes, that's fine
        </button>
      </div>
    </div>
  );
};

const consentButtonStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 38,
  padding: "0 14px",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  borderRadius: 8,
  border: "1px solid hsl(0 0% 100% / 0.16)",
  background: "hsl(0 0% 100% / 0.06)",
  color: "hsl(0 0% 96%)",
};

export default ConsentGate;
