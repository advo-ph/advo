/**
 * The behaviours every mobile nav drawer needs while open, in one place —
 * the exact three the nav rewrite dropped (drawer-a11y) plus the two the
 * first restoration missed:
 *
 * 1. Escape closes it.
 * 2. The page does not scroll behind it. The lock lands on BOTH scroll
 *    containers — `documentElement` and `body` — because the landing moved
 *    document scroll onto `html` (landing-page.css `html:has(.landing-page)`),
 *    where a body-only lock is a no-op: the page kept scrolling under the
 *    open drawer. FloatingNav's body-only lock had the same blind spot.
 * 3. Tab stays inside the drawer — the page behind is hidden under an
 *    overlay, so tabbing out of the drawer lands focus on content a touch
 *    user cannot see.
 * 4. Opening moves focus into the drawer; closing returns it to the button
 *    that opened it, found by its aria-controls — the standard disclosure
 *    contract.
 *
 * Every value captured while open is restored by the same cleanup, so an
 * early return while closed leaves nothing attached.
 */
import { useEffect } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useDrawerLock(open: boolean, close: () => void, drawerId: string) {
  useEffect(() => {
    if (!open) return;

    const drawer = document.getElementById(drawerId);
    const trigger = document.querySelector<HTMLElement>(`[aria-controls="${drawerId}"]`);

    // Restore the PREVIOUS values rather than clearing to "": another overlay
    // may hold its own lock, and clearing would release theirs too.
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    // Hiding overflow removes a classic scrollbar, and the page (plus any
    // fixed bar) shifts right by its width under the open drawer. Measure that
    // width first and hand it out as a custom property; the page and the bar
    // pad by it only while locked. Overlay scrollbars measure 0 and pad 0.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.setProperty("--drawer-scrollbar", `${scrollbarWidth}px`);
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    drawer?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !drawer.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.removeProperty("--drawer-scrollbar");
      window.removeEventListener("keydown", onKey);
      // Only pull focus back when the drawer still holds it — a link inside
      // may have already navigated and moved focus itself.
      if (drawer && document.activeElement instanceof Element && drawer.contains(document.activeElement)) {
        trigger?.focus();
      }
    };
  }, [open, close, drawerId]);
}
