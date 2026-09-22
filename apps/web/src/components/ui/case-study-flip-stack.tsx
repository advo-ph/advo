"use client";

import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";

export interface CaseStudyFlipItem {
  number?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  image: string;
  imageAlt: string;
  background?: string;
  foreground?: string;
}

interface CaseStudyFlipStackProps {
  items: CaseStudyFlipItem[];
  width?: number | string;
  height?: number | string;
  cardDistance?: number;
  verticalDistance?: number;
  activeIndex?: number;
  instant?: boolean;
  onCardClick?: (index: number) => void;
  className?: string;
}

function FlipCard({
  item,
  index,
  total,
  activeIndex,
  width,
  height,
  cardDistance,
  verticalDistance,
  instant,
  onCardClick,
}: {
  item: CaseStudyFlipItem;
  index: number;
  total: number;
  activeIndex: number;
  width: number | string;
  height: number | string;
  cardDistance: number;
  verticalDistance: number;
  instant: boolean;
  onCardClick?: (index: number) => void;
}) {
  const isGone = index < activeIndex;
  const distance = Math.max(index - activeIndex, 0);
  const numericHeight = typeof height === "number" ? height : 400;

  return (
    <motion.div
      className="card work-card"
      initial={false}
      animate={{
        x: distance * cardDistance,
        y: isGone ? numericHeight * 1.35 : -distance * verticalDistance,
        z: -distance * cardDistance * 1.5,
        rotateX: isGone ? 16 : 0,
        rotateZ: isGone ? -1.5 : 0,
        opacity: isGone ? 0 : 1,
      }}
      transition={
        instant
          ? { duration: 0 }
          : { duration: 0.72, ease: [0.22, 1, 0.36, 1] }
      }
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        width,
        height,
        marginLeft: typeof width === "number" ? -width / 2 : "-50%",
        marginTop: typeof height === "number" ? -height / 2 : "-50%",
        x: 0,
        y: 0,
        zIndex: isGone ? total + 1 : total - index,
        transformOrigin: "center center",
        transformStyle: "preserve-3d",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        pointerEvents: isGone ? "none" : "auto",
      }}
      role={onCardClick ? "button" : undefined}
      aria-hidden={isGone ? true : undefined}
      tabIndex={onCardClick && !isGone ? 0 : undefined}
      onClick={() => onCardClick?.(index)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onCardClick?.(index);
        }
      }}
    >
      <img
        src={item.image}
        alt={item.imageAlt}
        className="h-full w-full"
        loading={index < 2 ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
      />
    </motion.div>
  );
}

export function CaseStudyFlipStack({
  items,
  width = 500,
  height = 400,
  cardDistance = 60,
  verticalDistance = 70,
  activeIndex = 0,
  instant = false,
  onCardClick,
  className,
}: CaseStudyFlipStackProps) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const safeItems = items ?? [];
  if (safeItems.length === 0) return null;

  const currentIndex = Math.min(Math.max(activeIndex, 0), safeItems.length - 1);
  const shouldSnap = instant || prefersReducedMotion;

  return (
    <div
      className={cn("card-swap-container", className)}
      style={{ width, height }}
    >
      {safeItems.map((item, index) => (
        <FlipCard
          key={`${item.image}-${index}`}
          item={item}
          index={index}
          total={safeItems.length}
          activeIndex={currentIndex}
          width={width}
          height={height}
          cardDistance={cardDistance}
          verticalDistance={verticalDistance}
          instant={shouldSnap}
          onCardClick={onCardClick}
        />
      ))}
    </div>
  );
}
