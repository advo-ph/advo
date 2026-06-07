import type { ReactElement } from "react";
import { cn } from "@/lib/utils";

type Corner = "tl" | "tr" | "bl" | "br";

interface CornerBracketsProps {
  /** Which corners to render. Defaults to all four. */
  corners?: Corner[];
  /** Leg length in px. */
  size?: number;
  /** Inset from the container edge in px (0 sits on the existing border). */
  inset?: number;
  className?: string;
}

/**
 * CornerBrackets — static blueprint registration marks.
 *
 * L-shaped corners drawn from two 1px legs (horizontal + vertical) using the
 * border color. Purely decorative, no motion — reduced motion does not affect
 * them. Apply to the 4 bordered-container sections (NOT individual cards).
 *
 * The PARENT must be `relative`; these absolutely position to its corners and
 * sit at z-0 (behind text).
 *
 * Usage:
 *   <div className="relative ...">
 *     <CornerBrackets />
 *     {content}
 *   </div>
 */
export default function CornerBrackets({
  corners = ["tl", "tr", "bl", "br"],
  size = 24,
  inset = 0,
  className,
}: CornerBracketsProps): ReactElement {
  const weight = "var(--bracket-weight, 1px)";

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 z-0", className)}
    >
      {corners.map((corner) => {
        const vertical = corner[0] === "t" ? "top" : "bottom";
        const horizontal = corner[1] === "l" ? "left" : "right";
        const cornerPos = { [vertical]: inset, [horizontal]: inset } as const;

        return (
          <span key={corner}>
            {/* Horizontal leg */}
            <span
              className="absolute bg-border"
              style={{
                ...cornerPos,
                width: size,
                height: weight,
              }}
            />
            {/* Vertical leg */}
            <span
              className="absolute bg-border"
              style={{
                ...cornerPos,
                width: weight,
                height: size,
              }}
            />
          </span>
        );
      })}
    </div>
  );
}
