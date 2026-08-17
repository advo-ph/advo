import { useEffect, useRef } from "react";

const ScrollProgress = () => {
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let animationFrameId: number;
    const isLanding = Boolean(document.querySelector(".landing-page"));
    const scrollEl = isLanding ? null : document.getElementById("root");
    if (!isLanding && !scrollEl) return;

    const updateProgress = () => {
      if (!progressRef.current) return;
      const scrollHeight = isLanding
        ? document.documentElement.scrollHeight - window.innerHeight
        : scrollEl!.scrollHeight - scrollEl!.clientHeight;
      if (scrollHeight <= 0) {
        progressRef.current.style.width = "0%";
        return;
      }
      const scrolled = isLanding
        ? (window.scrollY / scrollHeight) * 100
        : (scrollEl!.scrollTop / scrollHeight) * 100;
      progressRef.current.style.width = `${Math.min(scrolled, 100)}%`;
    };

    const handleScroll = () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(updateProgress);
    };

    const target: Window | HTMLElement = isLanding ? window : scrollEl!;
    target.addEventListener("scroll", handleScroll, { passive: true });
    updateProgress();

    return () => {
      target.removeEventListener("scroll", handleScroll);
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
