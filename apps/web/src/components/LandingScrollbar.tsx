import { useEffect, useRef } from "react";

/**
 * The landing's scrollbar.
 *
 * The native one is hidden on the landing (`landing-page.css`, the sisia
 * approach): a classic bar consumes 10 to 17px of layout on Windows, so the
 * page read heavier on the right and shifted whenever a drawer locked
 * scrolling. Hiding it removes both problems at the root. What is lost is
 * the position cue, so this draws one back: a thin overlay thumb that mirrors
 * the document's scroll, shows while scrolling, and fades once it stops. It
 * takes no layout, so nothing on the page knows it is there.
 *
 * It started as a readout with pointer events passing through, and a 3px thumb
 * to match. That was too thin to read at a glance, and once it is wide enough
 * to see it is wide enough that people try to drag it — a bar that looks like
 * a control and refuses to act like one is worse than no bar. So it is a
 * control now: grab it and the page follows.
 *
 * MOUSE ONLY. The track is a 16px hit area pinned to the right edge, and on a
 * touch screen that strip would swallow taps and swipes along the border. CSS
 * gates `pointer-events` behind `(pointer: fine)`, so a finger never meets it.
 */
const HIDE_AFTER_MS = 900;

const LandingScrollbar = () => {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb) return;

    let frame = 0;
    let hideTimer = 0;

    const paint = () => {
      frame = 0;
      const doc = document.documentElement;
      const viewport = window.innerHeight;
      const total = doc.scrollHeight;
      if (total <= viewport + 1) {
        track.dataset.state = "idle";
        return;
      }
      const trackHeight = track.clientHeight;
      const thumbHeight = Math.max(32, (viewport / total) * trackHeight);
      const travel = trackHeight - thumbHeight;
      const progress = window.scrollY / (total - viewport);
      thumb.style.height = `${thumbHeight}px`;
      thumb.style.transform = `translateY(${Math.min(Math.max(progress, 0), 1) * travel}px)`;
      track.dataset.state = "active";
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        track.dataset.state = "idle";
      }, HIDE_AFTER_MS);
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(paint);
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(document.documentElement);

    // ── Drag ──────────────────────────────────────────
    //
    // Maps a pointer's Y within the track onto the document's scroll range. The
    // grab offset is kept so the thumb does not jump under the cursor on the
    // first move — grabbing the middle of the thumb should hold the middle.

    let grabOffset = 0;

    const scrollToPointer = (clientY: number) => {
      const doc = document.documentElement;
      const viewport = window.innerHeight;
      const total = doc.scrollHeight;
      const trackBox = track.getBoundingClientRect();
      const thumbHeight = thumb.getBoundingClientRect().height;
      const travel = trackBox.height - thumbHeight;
      if (travel <= 0) return;

      const top = clientY - trackBox.top - grabOffset;
      const progress = Math.min(Math.max(top / travel, 0), 1);
      // `instant` because the landing sets `scroll-behavior: smooth`, and a
      // smooth scroll per pointer-move fights the drag into a rubbery lag.
      window.scrollTo({ top: progress * (total - viewport), behavior: "instant" });
    };

    const onPointerMove = (event: PointerEvent) => scrollToPointer(event.clientY);

    const onPointerUp = () => {
      track.dataset.drag = "false";
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };

    const onPointerDown = (event: PointerEvent) => {
      // Left button only; a right-click should open a menu, not scroll.
      if (event.button !== 0) return;
      const thumbBox = thumb.getBoundingClientRect();
      const isOnThumb = event.clientY >= thumbBox.top && event.clientY <= thumbBox.bottom;
      // Clicking the empty track jumps there and then drags from its centre,
      // which is what a native scrollbar does.
      grabOffset = isOnThumb ? event.clientY - thumbBox.top : thumbBox.height / 2;

      track.dataset.drag = "true";
      // Stops the drag from selecting text down the length of the page.
      event.preventDefault();
      scrollToPointer(event.clientY);

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    };

    track.addEventListener("pointerdown", onPointerDown);

    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      track.removeEventListener("pointerdown", onPointerDown);
      onPointerUp();
      observer.disconnect();
      window.clearTimeout(hideTimer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="landing-scrollbar" ref={trackRef} data-state="idle" aria-hidden="true">
      <div ref={thumbRef} />
    </div>
  );
};

export default LandingScrollbar;
