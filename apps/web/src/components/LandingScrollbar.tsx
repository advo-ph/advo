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
 * Pointer events pass through it on purpose. It is a readout, not a control;
 * wheel, keys, touch and the page's own anchors move the page.
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

    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
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
