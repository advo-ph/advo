import { useEffect, useRef } from "react";

const ScrollProgress = () => {
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let animationFrameId: number;
    const scrollEl = document.getElementById("root");
    if (!scrollEl) return;

    const updateProgress = () => {
      if (!progressRef.current) return;
      const scrollHeight = scrollEl.scrollHeight - scrollEl.clientHeight;
      if (scrollHeight <= 0) {
        progressRef.current.style.width = "0%";
        return;
      }
      const scrolled = (scrollEl.scrollTop / scrollHeight) * 100;
      progressRef.current.style.width = `${Math.min(scrolled, 100)}%`;
    };

    const handleScroll = () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(updateProgress);
    };

    scrollEl.addEventListener("scroll", handleScroll, { passive: true });
    updateProgress();

    return () => {
      scrollEl.removeEventListener("scroll", handleScroll);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div 
      ref={progressRef}
      className="scroll-progress" 
      style={{ width: "0%" }}
      aria-hidden="true"
    />
  );
};

export default ScrollProgress;
