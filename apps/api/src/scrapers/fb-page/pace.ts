/**
 * Account safety + host courtesy as pure functions (testable without a browser).
 * A checkpoint on the warmed account costs more than any coverage gain, so the
 * page-load budget is a hard ceiling, not a hint.
 */
import os from "node:os";

export function makeBudget(per_hour: number, now: () => number = Date.now) {
  const stamp: number[] = [];
  const prune = () => {
    const cut = now() - 3_600_000;
    while (stamp.length && stamp[0] <= cut) stamp.shift();
  };
  return {
    /** ms to wait before the next page load is allowed (0 = go). */
    wait_ms(): number {
      prune();
      return stamp.length < per_hour ? 0 : Math.max(0, stamp[0] + 3_600_000 - now());
    },
    take(): void {
      prune();
      stamp.push(now());
    },
    used(): number {
      prune();
      return stamp.length;
    },
  };
}

export function loadPerCpu(avg: number[] = os.loadavg(), cpu: number = os.cpus().length || 1): number {
  return avg[0] / cpu;
}

/** Exponential cool-down after consecutive failures: 1,2,4… min, capped at 30 min. */
export function coolDownMs(consecutive_fail: number): number {
  return consecutive_fail <= 0 ? 0 : Math.min(60_000 * 2 ** (consecutive_fail - 1), 30 * 60_000);
}

/** Human-ish jittered delay so request spacing is not metronomic. */
export function jitter(base_ms: number, spread = 0.4, rnd: () => number = Math.random): number {
  return Math.round(base_ms * (1 - spread + 2 * spread * rnd()));
}
