import { useEffect, useRef } from "react";

const ScrollProgress = () => {
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let animationFrameId: number;

    const updateProgress = () => {
      if (!progressRef.current) return;
      
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollHeight <= 0) {
        progressRef.current.style.width = "0%";
        return;
      }
      
      const scrolled = (window.scrollY / scrollHeight) * 100;
      progressRef.current.style.width = `${Math.min(scrolled, 100)}%`;
    };

    const handleScroll = () => {
      // Cancel any pending frame
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      // Request new frame for smooth update
      animationFrameId = requestAnimationFrame(updateProgress);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    updateProgress();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
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
