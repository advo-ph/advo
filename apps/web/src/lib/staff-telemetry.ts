/**
 * staff-telemetry.ts — behavioural telemetry for ADVO staff inside `/admin`.
 *
 * SHIPPED DISABLED. READ THIS BEFORE FLIPPING ANYTHING.
 *
 * This collector processes personal data about employees under the Data Privacy Act of
 * 2012 (RA 10173). NPC Advisory Opinion 2024-003 permits workplace monitoring only where a
 * written policy exists AND staff have received notice BEFORE collection begins. The policy
 * exists in draft at `docs/MONITORING-POLICY.md` but has NOT been signed off and has NOT
 * been distributed. Turning this on now — collecting first, telling people after — is the
 * specific thing NPC Advisory Opinion 2018-084 refused to excuse. Do not enable it until
 * every step of §9 of that policy has actually happened, including the start date written
 * in by a human.
 *
 * The flag is therefore read from the environment and is OFF unless someone deliberately
 * sets it. With it off this module attaches no listener, allocates no buffer, reads no
 * device signal and sends no beacon: `startStaffTelemetry` returns a no-op teardown before
 * touching anything.
 *
 * SCOPE — matches §2 of the policy exactly, and nothing more:
 *   · which named `/admin` section has attention, and for how long (dwell)
 *   · route transitions between `/admin` sections
 *   · idle / active state of the admin tab
 *
 * EXCLUDED BY §3, and deliberately not implemented even behind the flag: keystrokes,
 * clipboard, form values or any typed content, screen/webcam capture, file or process
 * monitoring, location, and anything at all outside `/admin`. Those are the mechanisms
 * AO 2018-084 struck down. Adding one is a policy change first, a code change second.
 *
 * Transport is NOT duplicated here — every record goes through `track()` in
 * ./track.ts, which owns batching, the flush timer and the sendBeacon/fetch path.
 * Zero dependencies.
 */

import { useEffect, useRef } from "react";

import { trackStaff as track, flush } from "./track";

/**
 * THE FLAG. Off unless the deployment explicitly sets `VITE_STAFF_MONITORING=true`.
 * Anything else — unset, "", "false", "0" — is off. Never hardcode this to true.
 */
export const isStaffMonitoringEnabled = (): boolean => {
  const raw = import.meta.env.VITE_STAFF_MONITORING as string | boolean | undefined;
  return raw === true || raw === "true" || raw === "1";
};

/** Only `/admin` and below. A path outside it is never instrumented, flag or no flag. */
const ADMIN_PATH_PREFIX = "/admin";

const isAdminSurface = (): boolean => {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  return path === ADMIN_PATH_PREFIX || path.startsWith(`${ADMIN_PATH_PREFIX}/`);
};

/** Attention below this is a glance on the way somewhere else, not work. No row for it. */
const DWELL_MIN_MILLISECOND = 2000;
/** Longer than this without an interaction is a parked tab; capped so it cannot inflate. */
const IDLE_AFTER_MILLISECOND = 60_000;
/**
 * Hard throttle. An admin leaves this tab open all day, so a section can never emit more
 * often than this no matter how much they toggle between panels.
 */
const EMIT_MIN_INTERVAL_MILLISECOND = 30_000;
/** Idle polling is a single low-frequency timer — never a per-event timer or a rAF loop. */
const IDLE_POLL_INTERVAL_MILLISECOND = 15_000;

interface AttentionState {
  section: string;
  startedAt: number;
  /** Accrued only while the tab was focused and the staff member was active. */
  dwellMillisecond: number;
  lastEmittedAt: number;
}

export interface StaffTelemetryHandle {
  /** Point attention at a named `/admin` section. No-op if it is already the current one. */
  enterSection: (section: string) => void;
  /** Report what has accrued, detach every listener, clear the timer. */
  stop: () => void;
}

const INERT_HANDLE: StaffTelemetryHandle = { enterSection: () => {}, stop: () => {} };

/**
 * Start the collector for one `/admin` session.
 *
 * Inert — and provably so — when the flag is off or the surface is not `/admin`: it
 * returns the shared no-op handle before binding a listener, allocating a buffer or
 * reading anything at all.
 */
export const startStaffTelemetry = (initialSection: string): StaffTelemetryHandle => {
  if (!isStaffMonitoringEnabled()) return INERT_HANDLE;
  if (!isAdminSurface()) return INERT_HANDLE;

  let current: AttentionState | null = null;
  let lastActiveAt = Date.now();
  let isIdle = false;
  /** Focus/idle both suspend accrual; a blurred tab or a locked screen produces nothing. */
  let isAccruing = document.visibilityState === "visible";

  const settle = (now: number): void => {
    if (!current) return;
    if (isAccruing) current.dwellMillisecond += now - current.startedAt;
    current.startedAt = now;
  };

  /** One record: section name, route, dwell in seconds. No content, ever. */
  const report = (now: number, isForced: boolean): void => {
    if (!current) return;
    settle(now);
    if (current.dwellMillisecond < DWELL_MIN_MILLISECOND) return;
    if (!isForced && now - current.lastEmittedAt < EMIT_MIN_INTERVAL_MILLISECOND) return;
    track("scroll_depth", {
      surface: "admin",
      metric: "section_attention",
      section: current.section,
      route: window.location.pathname,
      dwell_second: Math.round(current.dwellMillisecond / 1000),
    });
    current.dwellMillisecond = 0;
    current.lastEmittedAt = now;
  };

  const enter = (section: string): void => {
    const now = Date.now();
    if (current?.section === section) return;
    if (current) report(now, true);
    current = { section, startedAt: now, dwellMillisecond: 0, lastEmittedAt: now };
    // Route transition between admin sections. Section name and path only.
    track("page_view", { surface: "admin", metric: "route_transition", section, route: window.location.pathname });
  };

  // ── Activity: presence signals only. Never the key itself, never a value.
  const markActive = (): void => {
    lastActiveAt = Date.now();
    if (!isIdle) return;
    isIdle = false;
    isAccruing = document.visibilityState === "visible";
    if (current) current.startedAt = lastActiveAt;
    track("session_start", { surface: "admin", metric: "idle_state", state: "active" });
  };
  // `keydown` is bound for PRESENCE ONLY — the handler receives no argument and reads no
  // key, code, target or value. Nothing typed is captured. See §3 of the policy.
  const activityEvent = ["pointerdown", "pointermove", "keydown", "wheel", "focus"] as const;
  let isActivityQueued = false;
  const onActivity = (): void => {
    // Coalesced to one bookkeeping tick per second; pointermove must not run per-frame work.
    if (isActivityQueued) return;
    isActivityQueued = true;
    setTimeout(() => {
      isActivityQueued = false;
      markActive();
    }, 1000);
  };

  const pollIdle = (): void => {
    const now = Date.now();
    if (!isIdle && now - lastActiveAt >= IDLE_AFTER_MILLISECOND) {
      settle(now);
      isIdle = true;
      isAccruing = false;
      report(now, true);
      track("session_end", { surface: "admin", metric: "idle_state", state: "idle" });
      return;
    }
    if (!isIdle) report(now, false);
  };

  const onVisibility = (): void => {
    const now = Date.now();
    settle(now);
    if (document.visibilityState === "hidden") {
      isAccruing = false;
      report(now, true);
      flush(true);
    } else {
      isAccruing = !isIdle;
      lastActiveAt = now;
    }
  };

  const onPageHide = (): void => {
    report(Date.now(), true);
    flush(true);
  };

  for (const name of activityEvent) {
    window.addEventListener(name, onActivity, { passive: true });
  }
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  const idleTimer = setInterval(pollIdle, IDLE_POLL_INTERVAL_MILLISECOND);

  enter(initialSection);

  return {
    enterSection: enter,
    stop: () => {
      clearInterval(idleTimer);
      for (const name of activityEvent) window.removeEventListener(name, onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      report(Date.now(), true);
      current = null;
      flush(false);
    },
  };
};

/**
 * The one call site: mount from the `/admin` shell with the section currently on screen.
 * Starts the collector once and re-points it on every section change. Does nothing —
 * literally nothing — while the flag is off, so it is safe to leave mounted today.
 */
export const useStaffTelemetry = (section: string): void => {
  const handle = useRef<StaffTelemetryHandle | null>(null);
  const sectionRef = useRef(section);
  sectionRef.current = section;

  useEffect(() => {
    handle.current = startStaffTelemetry(sectionRef.current);
    return () => {
      handle.current?.stop();
      handle.current = null;
    };
  }, []);

  useEffect(() => {
    handle.current?.enterSection(section);
  }, [section]);
};
