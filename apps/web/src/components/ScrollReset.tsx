/**
 * Scroll position across navigation — the thing React Router does not do for you.
 *
 * `BrowserRouter` + `<Routes>` changes the rendered tree and touches scroll not at all.
 * The scroll container keeps whatever offset the previous page left on it, so opening a
 * page from halfway down a long one drops you into its middle. Nothing in this app
 * handled that.
 *
 * ─── Why this is more than `window.scrollTo(0, 0)` ────────────────────────────
 *
 * THIS APP HAS TWO SCROLL CONTAINERS, and which one is live depends on the route:
 *
 *   * Default (admin, hub, legal): `index.css` sets `html, body { overflow: hidden }`
 *     and `#root { overflow-y: auto }`. **`#root` scrolls; `window.scrollY` is always 0.**
 *   * Landing routes: `landing-page.css` flips it back with
 *     `html:has(.landing-page) { overflow-y: auto }` and `#root { overflow: visible }`,
 *     because a `#root` scrollbar shrinks in-flow content while a fixed nav stays
 *     viewport-wide. **The document scrolls.**
 *
 * A reset written against only one of them silently does nothing on half the routes —
 * and "silently does nothing" is exactly the bug being fixed. So both are written, and
 * the one that is not scrolling absorbs a harmless no-op.
 *
 * AND THE LANDING SETS `scroll-behavior: smooth`. A plain `scrollTo(0, 0)` there does not
 * jump — it ANIMATES the whole way back up, which on a long landing page is a visible
 * slide that looks broken. Every reset below passes `behavior: "instant"` explicitly to
 * defeat the CSS.
 *
 * ─── Three navigation kinds, three different correct answers ──────────────────
 *
 *   PUSH / REPLACE, no hash   → top, instantly. The reported bug.
 *   POP (back / forward)      → RESTORE where the person was. Jumping to top on Back is
 *                               its own annoyance, and arguably the worse one: it throws
 *                               away a position the person expects to return to. React
 *                               Router keeps the DOM mounted across a POP, so nothing
 *                               restores this by itself.
 *   Any navigation WITH a hash → leave it alone and scroll to the anchor instead.
 *                               `landing-footer.tsx` links `/#work` from sub-routes, and
 *                               React Router does not honour a hash on navigation — so
 *                               that link has never actually reached its section. Handled
 *                               here rather than left broken.
 *
 * ─── Refresh is deliberately NOT touched ──────────────────────────────────────
 *
 * `history.scrollRestoration` stays `auto`. On a refresh the browser restores document
 * scroll, which is the behaviour people expect from every other site — and on the
 * `#root`-scrolling routes there is nothing to restore anyway, because browsers only
 * restore the DOCUMENT's scroll, never an inner element's. So refresh already lands at
 * the top on admin/hub and holds position on the landing. Setting it to `manual` would
 * break the landing's natural restore in exchange for nothing.
 */
import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * How long to keep looking for a hash target before giving up.
 *
 * Long enough to cover a route mount plus its first data fetch; short enough that a
 * genuinely absent anchor does not hold a rAF loop open behind the person's back.
 */
const HASH_WAIT_MS = 1500;

/** The element that is actually scrolling on this route. See the header. */
function scrollElement(): { root: HTMLElement | null; document_: Element | null } {
  return {
    root: document.getElementById("root"),
    document_: document.scrollingElement,
  };
}

/** Whichever container holds a non-zero offset. Only one of the two is ever live. */
function currentOffset(): number {
  const { root, document_ } = scrollElement();
  return Math.max(root?.scrollTop ?? 0, document_?.scrollTop ?? 0);
}

/**
 * Write an offset to BOTH containers.
 *
 * `behavior: "instant"` is not decoration — the landing sets `scroll-behavior: smooth`,
 * and CSS smooth scrolling applies to programmatic scrolls too. Without this, navigating
 * animates a slow slide instead of arriving.
 */
function scrollTo(offset: number): void {
  const { root, document_ } = scrollElement();
  root?.scrollTo({ top: offset, left: 0, behavior: "instant" });
  document_?.scrollTo({ top: offset, left: 0, behavior: "instant" });
}

const ScrollReset = () => {
  const location = useLocation();
  const navigationType = useNavigationType();

  /**
   * Offset per history entry, keyed by React Router's `location.key`.
   *
   * A ref, not state: writing it must never trigger a render, and it is read only inside
   * the effect that follows a navigation. A Map on a ref also dies with the tab, which is
   * correct — restoring a position across a full page load is the browser's job, and it
   * already does it.
   */
  const offsetByKey = useRef(new Map<string, number>());
  /** The entry we are LEAVING. Its offset has to be captured before the new page paints. */
  const previousKey = useRef(location.key);

  useEffect(() => {
    // Capture where the outgoing entry was sitting, so a later Back can return to it.
    // This runs after the new route renders but before the browser paints, and the
    // container has not been touched yet — so the offset still belongs to the old page.
    if (previousKey.current !== location.key) {
      offsetByKey.current.set(previousKey.current, currentOffset());
      previousKey.current = location.key;
    }

    // A hash wins over everything.
    //
    // The target frequently does NOT exist yet. `/#work` from a sub-route mounts the
    // whole landing, whose sections render behind an async portfolio fetch — so a single
    // `requestAnimationFrame` looks for an element that is still seconds away, finds
    // nothing, and silently leaves the page at the top. (Written that way first; the
    // browser check caught it.)
    //
    // So: poll per frame until the element appears or the deadline passes. Bounded, and
    // cancelled the moment another navigation happens, so a missing anchor costs one
    // second of rAF and never leaks into the next route.
    if (location.hash) {
      const id = decodeURIComponent(location.hash.slice(1));
      const deadline = performance.now() + HASH_WAIT_MS;
      let frame = 0;

      const seek = () => {
        const target = document.getElementById(id);
        if (target) {
          target.scrollIntoView({ block: "start", behavior: "instant" });
          return;
        }
        // A stale or wrong anchor is not an error — give up quietly and leave the page
        // where it is rather than throwing it to the top.
        if (performance.now() < deadline) frame = requestAnimationFrame(seek);
      };

      frame = requestAnimationFrame(seek);
      return () => cancelAnimationFrame(frame);
    }

    if (navigationType === "POP") {
      // Back / forward: return to where the person was, or the top if this entry was
      // never visited in this session (a cold Back into history).
      scrollTo(offsetByKey.current.get(location.key) ?? 0);
      return;
    }

    // PUSH / REPLACE — a new page. Top, instantly. The reported bug.
    scrollTo(0);
  }, [location.key, location.hash, navigationType]);

  return null;
};

export default ScrollReset;
