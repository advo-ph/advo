import { useEffect, useState, useCallback } from "react";

const CustomCursor = () => {
  const [position, setPosition] = useState({ x: -100, y: -100 });
  const [isHovering, setIsHovering] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isInWindow, setIsInWindow] = useState(true);

  const updatePosition = useCallback((e: MouseEvent) => {
    setPosition({ x: e.clientX, y: e.clientY });
    if (!isVisible) setIsVisible(true);
  }, [isVisible]);

  const handleMouseDown = useCallback(() => setIsClicking(true), []);
  const handleMouseUp = useCallback(() => setIsClicking(false), []);
  const handleMouseLeave = useCallback(() => setIsInWindow(false), []);
  const handleMouseEnter = useCallback(() => setIsInWindow(true), []);

  useEffect(() => {
    // Check if user prefers reduced motion or is on touch device
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    
    if (prefersReducedMotion || isTouchDevice) {
      return; // Don't show custom cursor
    }

    document.body.classList.add("cursor-custom");

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInteractive = !!(
        target.tagName === "A" ||
        target.tagName === "BUTTON" ||
        target.closest("a") ||
        target.closest("button") ||
        target.getAttribute("role") === "button" ||
        target.classList.contains("cursor-pointer")
      );
      
      setIsHovering(isInteractive);
    };

    window.addEventListener("mousemove", updatePosition, { passive: true });
    window.addEventListener("mouseover", handleMouseOver, { passive: true });
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("mouseenter", handleMouseEnter);

    return () => {
      document.body.classList.remove("cursor-custom");
      window.removeEventListener("mousemove", updatePosition);
      window.removeEventListener("mouseover", handleMouseOver);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("mouseenter", handleMouseEnter);
    };
  }, [updatePosition, handleMouseDown, handleMouseUp, handleMouseLeave, handleMouseEnter]);

  // Hide when not visible, mouse hasn't moved yet, or mouse left window
  if (!isVisible || !isInWindow) return null;

  return (
    <div
      className={`custom-cursor ${isHovering ? "hovering" : ""} ${isClicking ? "clicking" : ""}`}
      style={{ left: position.x, top: position.y }}
      aria-hidden="true"
    />
  );
};

export default CustomCursor;
