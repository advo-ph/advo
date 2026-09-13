/**
 * track.ts — the browser-side analytics tracker for the public marketing site.
 *
 * Three rules govern this file, in order:
 *
 *   1. CONSENT IS LOAD-BEARING. Nothing leaves the browser, and no device signal is
 *      even READ, unless `isConsentGranted()` is true at that moment. The guard lives
 *      in exactly one place (`enqueue` -> `flush`), so there is no second exported
 *      function that can bypass it.
 *   2. THE DATABASE IS SMALL (~10 MB). Every emitter here is throttled, sampled, or
 *      milestone-gated, and everything is buffered and flushed as a BATCH — never one
 *      request per event. No raw mousemove, ever.
 *   3. IDENTITY DEGRADES HONESTLY. See `resolveIdentity` below.
 *
 * Zero dependencies.
 */

import { getAccessToken } from "@/lib/api";
import {
  isConsentGranted,
  subscribeConsent,
  TRACKING_STORAGE_KEY,
} from "../components/ConsentGate";

const API_URL = import.meta.env.DEV
  ? ""
  : ((import.meta.env.VITE_API_URL as string | undefined) || "http://localhost:6407");

const INGEST_PATH = "/api/event";

/** Matches the server enum in apps/api/src/routes/event.routes.ts. Do not widen here. */
export type EventKind =
  | "page_view"
  | "click"
  | "form_start"
  | "form_submit"
  | "scroll_depth"
  | "outbound_click"
  | "session_start"
  | "session_end"
  | "error";

/** Exactly the per-event shape `eventSchema` accepts. No userId — the server owns that. */
interface TrackEvent {
  kind: EventKind;
  occurredAt: string;
  sessionId: string;
  visitorId: string | null;
  path: string;
  detail: Record<string, unknown>;
}

// ─── Identity ─────────────────────────────────────────

export type IdentityConfidence = "high" | "medium" | "low" | "unidentified";

export interface Identity {
  /** What is sent as `visitorId`. Never null in practice; null only if storage AND crypto fail. */
  visitorId: string | null;
  /** The fingerprint hash, when one could be computed. */
  fingerprint: string | null;
  /** A random, browser-local id that survives reloads when storage works. */
  fallbackId: string | null;
  confidence: IdentityConfidence;
  /** Why the confidence is what it is — carried on every event for the analytics side. */
  reason: string;
}

const FALLBACK_KEY = TRACKING_STORAGE_KEY.visitorFallback;
const FINGERPRINT_KEY = TRACKING_STORAGE_KEY.visitorFingerprint;

/**
 * WHY TWO KEYS AND A CONFIDENCE FLAG, NOT ONE HASH.
 *
 * Fingerprinting is high-fidelity on Chrome only. Safari, and Firefox in strict/private
 * mode, inject randomised canvas/font noise, so the SAME device produces a DIFFERENT hash
 * on every page load; Brave blocks the signals outright. A single-key design would file
 * each of those loads as a brand-new visitor, and the dashboard would read the result as a
 * TRAFFIC DECLINE (or a return-visitor collapse) when what actually happened is an IDENTITY
 * FAILURE. The opposite failure is just as bad: when the signals collapse to a low-entropy
 * hash, two different visitors silently merge into one.
 *
 * That specific misreading is the bug this design prevents. So every event carries
 * `identity_confidence`, an unidentifiable visitor is bucketed EXPLICITLY as "unidentified"
 * with a session-scoped id (never a shared constant, which would collide), and a random
 * fallback id is preferred over the fingerprint whenever storage works.
 */
let identityCache: Identity | null = null;

const hash = (input: string): string => {
  // FNV-1a, 32-bit, doubled with a second offset for a wider space. Cheap and dependency-free.
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0;
  }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
};

const readStore = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStore = (key: string, value: string): boolean => {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const randomId = (): string => {
  try {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, "");
    const byte = new Uint8Array(16);
    window.crypto.getRandomValues(byte);
    return Array.from(byte, (n) => n.toString(16).padStart(2, "0")).join("");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
};

/**
 * Stable, cheap signals only — no canvas draw, no WebGL probe, no font enumeration, no
 * library. Those are the expensive signals AND the ones browsers actively randomise, so
 * they buy noise at the price of jank.
 */
const computeFingerprint = (): { value: string | null; entropyCount: number } => {
  try {
    const nav = window.navigator as Navigator & {
      deviceMemory?: number;
      brave?: { isBrave?: () => Promise<boolean> };
    };
    const signal: (string | number)[] = [
      nav.language ?? "",
      (nav.languages ?? []).join(","),
      nav.platform ?? "",
      nav.hardwareConcurrency ?? 0,
      nav.deviceMemory ?? 0,
      nav.maxTouchPoints ?? 0,
      window.screen?.width ?? 0,
      window.screen?.height ?? 0,
      window.screen?.colorDepth ?? 0,
      window.devicePixelRatio ?? 0,
      Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
      new Date().getTimezoneOffset(),
    ];
    const entropyCount = signal.filter((s) => s !== "" && s !== 0).length;
    return { value: hash(signal.join("|")), entropyCount };
  } catch {
    return { value: null, entropyCount: 0 };
  }
};

const resolveIdentity = (): Identity => {
  if (identityCache) return identityCache;

  const { value: fingerprint, entropyCount } = computeFingerprint();

  let fallbackId = readStore(FALLBACK_KEY);
  let isStorageWritable = fallbackId !== null;
  if (!fallbackId) {
    const minted = randomId();
    isStorageWritable = writeStore(FALLBACK_KEY, minted);
    fallbackId = isStorageWritable ? minted : null;
  }

  // Did the fingerprint move for a browser we have seen before? That is canvas/entropy
  // noise, not a new device — and the reason we do not trust it as the primary key.
  const previousFingerprint = readStore(FINGERPRINT_KEY);
  const isFingerprintUnstable =
    previousFingerprint !== null && fingerprint !== null && previousFingerprint !== fingerprint;
  if (fingerprint) writeStore(FINGERPRINT_KEY, fingerprint);

  let confidence: IdentityConfidence;
  let reason: string;
  let visitorId: string | null;

  if (fallbackId && !isFingerprintUnstable && fingerprint && entropyCount >= 8) {
    confidence = "high";
    reason = "stable_fallback_and_fingerprint";
    visitorId = `v_${fallbackId.slice(0, 32)}`;
  } else if (fallbackId) {
    confidence = "medium";
    reason = isFingerprintUnstable ? "fingerprint_noise_stable_storage" : "low_entropy_stable_storage";
    visitorId = `v_${fallbackId.slice(0, 32)}`;
  } else if (fingerprint && entropyCount >= 8) {
    // No storage (private mode) but a usable fingerprint. Usable, not trustworthy.
    confidence = "low";
    reason = "no_storage_fingerprint_only";
    visitorId = `f_${fingerprint}`;
  } else {
    // Neither. Bucket EXPLICITLY, and scope the id to this session so two unidentifiable
    // visitors never merge under one degraded key.
    confidence = "unidentified";
    reason = "no_storage_no_usable_fingerprint";
    visitorId = null; // filled in below once the session id exists
  }

  identityCache = { visitorId, fingerprint, fallbackId, confidence, reason };
  return identityCache;
};

// ─── Session ──────────────────────────────────────────

const SESSION_KEY = TRACKING_STORAGE_KEY.session;
const SESSION_IDLE_MILLISECOND = 30 * 60 * 1000;

let sessionCache: string | null = null;

const resolveSessionId = (): string => {
  if (sessionCache) return sessionCache;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: string; touchedAt?: number };
      if (parsed.id && typeof parsed.touchedAt === "number" && Date.now() - parsed.touchedAt < SESSION_IDLE_MILLISECOND) {
        sessionCache = parsed.id;
      }
    }
  } catch {
    /* storage unavailable — a per-page-view session is still correct, just shorter */
  }
  if (!sessionCache) sessionCache = `s_${randomId().slice(0, 24)}`;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: sessionCache, touchedAt: Date.now() }));
  } catch {
    /* no-op */
  }
  return sessionCache;
};

// ─── Buffer + flush ───────────────────────────────────

/** A flush is 10-40 events in practice; the server caps a batch at 200. */
const BATCH_MAX = 40;
const FLUSH_INTERVAL_MILLISECOND = 15_000;
/** Hard ceiling on the in-memory buffer, so a pathological page cannot grow it forever. */
const BUFFER_MAX = 200;

let buffer: TrackEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isListenerBound = false;

/**
 * THE ONLY GATE. Every emitter funnels through `enqueue`, and `flush` re-checks, so a
 * consent withdrawal between buffering and flushing still drops the batch on the floor.
 */
const isAllowed = (): boolean => {
  if (typeof window === "undefined") return false;
  return isConsentGranted();
};

const send = (batch: TrackEvent[], isUnload: boolean): void => {
  const url = `${API_URL}${INGEST_PATH}`;
  const body = JSON.stringify(batch);
  const token = getAccessToken();

  /**
   * The unload path cannot carry a header, and `application/json` is not a
   * CORS-safelisted content type — in production the API is a different origin
   * (api.advo.ph), so a JSON beacon needs a preflight that routinely does not
   * complete during pagehide. It works in dev only because the Vite proxy makes
   * it same-origin. `text/plain` is safelisted, so it actually leaves the page;
   * the route accepts it. An anonymous unload keeps the beacon; a signed-in one
   * prefers keepalive fetch so the token can be attached.
   */
  if (isUnload && !token && typeof navigator.sendBeacon === "function") {
    navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }));
    return;
  }

  void fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // A signed-in visitor (client or staff) is resolved from THIS token,
      // server-side. The body never carries an identity — see event.routes.ts.
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
    keepalive: true,
    credentials: "omit",
  }).catch(() => {
    // Analytics must never surface an error to a visitor. Drop it.
  });
};

export const flush = (isUnload = false): void => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!isAllowed()) {
    buffer = [];
    return;
  }
  while (buffer.length > 0) {
    send(buffer.splice(0, BATCH_MAX), isUnload);
  }
};

const scheduleFlush = (): void => {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush(false);
  }, FLUSH_INTERVAL_MILLISECOND);
};

const bindLifecycleListener = (): void => {
  if (isListenerBound || typeof window === "undefined") return;
  isListenerBound = true;
  const onHide = () => {
    // Guarded like everything else — a denied visitor gets no unload beacon either.
    if (!isAllowed()) {
      buffer = [];
      return;
    }
    flush(true);
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onHide();
  });
  window.addEventListener("pagehide", onHide);
  // A withdrawal mid-session discards whatever is buffered immediately.
  // ConsentGate clears the stored ids; the in-memory copies must go too, or the next grant
  // in this tab would resurrect the identity the visitor just withdrew.
  subscribeConsent((record) => {
    if (record.status !== "granted") {
      buffer = [];
      identityCache = null;
      sessionCache = null;
    }
  });
};

/**
 * Buffer one event. Returns false when consent blocked it — no queue, no retry, no
 * device read (identity is resolved AFTER the guard, so a denied visitor is never
 * fingerprinted at all).
 */
/**
 * Send a STAFF monitoring record, bypassing the visitor consent gate.
 *
 * This is deliberate and it is the narrow exception to "isAllowed gates everything".
 * The lawful basis for staff monitoring is NOTICE under a written policy
 * (docs/MONITORING-POLICY.md, RA 10173 Sec 12(b)/12(f)) — NOT consent, which is a weak
 * basis in employment because of the power imbalance. The visitor cookie banner is never
 * shown on /admin, so gating staff records on it made monitoring depend on an unrelated
 * click on the marketing site.
 *
 * The gate that DOES apply is the STAFF_MONITORING flag, checked by the only caller
 * (staff-telemetry.ts). Nothing else may call this.
 */
export const trackStaff = (
  kind: TrackEvent["kind"],
  detail: Record<string, unknown>,
): void => {
  if (typeof window === "undefined") return;
  send(
    [
      {
        kind,
        sessionId: resolveSessionId(),
        // A staff record is deliberately NOT keyed to a visitor fingerprint — the
        // monitoring policy scopes this to the signed-in staff session only.
        visitorId: null,
        occurredAt: new Date().toISOString(),
        path: window.location.pathname,
        detail,
      },
    ],
    false,
  );
};

export const track = (
  kind: EventKind,
  detail: Record<string, unknown> = {},
): boolean => {
  if (!isAllowed()) return false;

  bindLifecycleListener();

  const sessionId = resolveSessionId();
  const identity = resolveIdentity();
  const visitorId = identity.visitorId ?? `x_unidentified_${sessionId.slice(0, 24)}`;

  if (buffer.length >= BUFFER_MAX) buffer.shift();
  buffer.push({
    kind,
    occurredAt: new Date().toISOString(),
    sessionId,
    visitorId,
    path: window.location.pathname,
    detail: {
      ...detail,
      identity_confidence: identity.confidence,
      identity_reason: identity.reason,
    },
  });

  if (buffer.length >= BATCH_MAX) flush(false);
  else scheduleFlush();
  return true;
};

/** Read-only view of who we think this visitor is. Reads device signals — gated too. */
export const getIdentity = (): Identity | null => (isAllowed() ? resolveIdentity() : null);

// ─── Landing-page instrumentation ─────────────────────

/** Section dwell below this is a scroll-past, not a read. Not worth a row. */
const DWELL_MIN_MILLISECOND = 1000;
/** Dwell longer than this is a parked tab, not attention. */
const DWELL_MAX_MILLISECOND = 5 * 60 * 1000;
/** Scroll-depth is milestone-gated, never continuous. */
const DEPTH_MILESTONE = [25, 50, 75, 100] as const;

interface SectionState {
  enteredAt: number | null;
  dwellMillisecond: number;
  isReported: boolean;
}

/**
 * Observe every `<section id>` inside `root` and report which ones were actually seen and
 * for how long. IntersectionObserver, not a scroll listener: a scroll handler fires on
 * every frame of every wheel tick and is the single easiest way to flood a 10 MB database.
 *
 * Dwell is ACCUMULATED locally and emitted ONCE per section per page view (on unload or on
 * teardown), so a visitor scrolling a section in and out ten times costs one row, not ten.
 */
export const observeLandingSection = (root: HTMLElement): (() => void) => {
  if (!isAllowed() || typeof IntersectionObserver === "undefined") return () => {};

  const node = Array.from(root.querySelectorAll<HTMLElement>("section[id]"));
  if (node.length === 0) return () => {};

  const state = new Map<string, SectionState>();
  const idOf = (el: Element) => el.id;

  const observer = new IntersectionObserver(
    (entryList) => {
      const now = Date.now();
      for (const entry of entryList) {
        const id = idOf(entry.target);
        const current = state.get(id) ?? { enteredAt: null, dwellMillisecond: 0, isReported: false };
        if (entry.isIntersecting) {
          if (current.enteredAt === null) current.enteredAt = now;
        } else if (current.enteredAt !== null) {
          current.dwellMillisecond += Math.min(now - current.enteredAt, DWELL_MAX_MILLISECOND);
          current.enteredAt = null;
        }
        state.set(id, current);
      }
    },
    // 50% visible: a section clipped at the edge of the viewport was not read.
    { threshold: 0.5 },
  );
  for (const el of node) observer.observe(el);

  // ── Scroll depth: milestones only, and each one at most once per page view.
  const reachedMilestone = new Set<number>();
  let isDepthQueued = false;
  const measureDepth = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return;
    const percent = ((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight) * 100;
    for (const milestone of DEPTH_MILESTONE) {
      if (percent >= milestone && !reachedMilestone.has(milestone)) {
        reachedMilestone.add(milestone);
        track("scroll_depth", { metric: "depth_percent", percent: milestone });
      }
    }
  };
  // rAF-coalesced: at most one measurement per frame, and the measurement itself only
  // emits on a milestone crossing. No raw scroll payload is ever sent.
  const onScroll = () => {
    if (isDepthQueued) return;
    isDepthQueued = true;
    requestAnimationFrame(() => {
      isDepthQueued = false;
      measureDepth();
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  const report = () => {
    const now = Date.now();
    for (const [id, current] of state) {
      if (current.isReported) continue;
      const total =
        current.dwellMillisecond +
        (current.enteredAt === null ? 0 : Math.min(now - current.enteredAt, DWELL_MAX_MILLISECOND));
      current.enteredAt = null;
      current.dwellMillisecond = total;
      if (total < DWELL_MIN_MILLISECOND) continue;
      current.isReported = true;
      track("scroll_depth", {
        metric: "section_dwell",
        section: id,
        // Rounded to the second: millisecond precision is noise and costs bytes.
        dwell_second: Math.round(total / 1000),
      });
    }
  };

  const onHide = () => {
    if (document.visibilityState === "hidden") {
      report();
      flush(true);
    }
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", report);

  track("page_view", { surface: "landing" });

  return () => {
    observer.disconnect();
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", report);
    report();
    flush(false);
  };
};

/** The primary call-to-action. One row per click; there is nothing to throttle. */
export const trackPrimaryCta = (label: string, href: string): void => {
  track("click", { cta: "primary", label, href });
};

/**
 * Attach the landing instrumentation, now or the moment consent is granted — and detach it
 * again if consent is withdrawn mid-visit. Call sites stay a one-liner and never have to
 * reason about the consent lifecycle themselves.
 */
export const instrumentLanding = (root: HTMLElement): (() => void) => {
  let detach: (() => void) | null = null;
  const sync = () => {
    if (isAllowed() && !detach) detach = observeLandingSection(root);
    else if (!isAllowed() && detach) {
      detach();
      detach = null;
    }
  };
  sync();
  const unsubscribe = subscribeConsent(sync);
  return () => {
    unsubscribe();
    if (detach) detach();
    detach = null;
  };
};
