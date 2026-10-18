import { useEffect } from "react";

/**
 * Switches off the page scroll while `active`, and puts it back when it stops being active
 * or the caller unmounts.
 *
 * The app scrolls inside #root, not on the document (see index.css: html and body are
 * overflow hidden). So the lock is on #root: no scrolling, and no rubber-band bounce at
 * either end. Used by the admin pages that size themselves to the screen instead of
 * scrolling. Popups portal outside #root, so they still scroll inside themselves.
 */
export function useRootScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.getElementById("root");
    if (!root) return;

    const previous = {
      overflowY: root.style.overflowY,
      overscrollBehavior: root.style.overscrollBehavior,
    };
    root.scrollTop = 0;
    root.style.overflowY = "hidden";
    root.style.overscrollBehavior = "none";

    return () => {
      root.style.overflowY = previous.overflowY;
      root.style.overscrollBehavior = previous.overscrollBehavior;
    };
  }, [active]);
}
