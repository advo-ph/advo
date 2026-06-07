import { cn } from "@/lib/utils";
import { forwardRef } from "react";
import { EdgeGlow } from "@/components/motion/EdgeGlow";

type SectionProps = React.HTMLAttributes<HTMLElement> & {
  narrow?: boolean;
  divided?: boolean;
  /**
   * Glow the content column's edges as the spine comet sweeps past. Defaults to
   * on for full-width sections (whose edges sit on the rails). Auto-disabled for
   * `narrow` sections, whose edges don't reach the rails.
   */
  glow?: boolean;
};

export const Section = forwardRef<HTMLElement, SectionProps>(
  ({ className, narrow, divided, glow = true, children, ...props }, ref) => {
    const inner = cn("mx-auto w-full", narrow ? "max-w-3xl" : "max-w-6xl");
    return (
      <section
        ref={ref}
        className={cn(
          "py-24 px-6",
          divided && "border-t border-border",
          className,
        )}
        {...props}
      >
        {glow && !narrow ? (
          <EdgeGlow className={inner}>{children}</EdgeGlow>
        ) : (
          <div className={inner}>{children}</div>
        )}
      </section>
    );
  },
);
Section.displayName = "Section";

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
  number?: string;
  className?: string;
};

export const SectionHeader = ({
  eyebrow,
  title,
  subtitle,
  align = "left",
  number,
  className,
}: SectionHeaderProps) => (
  <div className={cn("mb-16", align === "center" && "text-center", className)}>
    <div
      className={cn(
        "flex items-baseline gap-6 mb-4",
        align === "center" && "justify-center",
      )}
    >
      {number && (
        <span className="text-[48px] md:text-[64px] font-mono font-light text-muted-foreground/30 leading-none tracking-tighter">
          {number}
        </span>
      )}
      {eyebrow && (
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-[0.18em]">
          {eyebrow}
        </span>
      )}
    </div>
    <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
      {title}
    </h2>
    {subtitle && (
      <p
        className={cn(
          "text-muted-foreground mt-4 max-w-xl",
          align === "center" && "mx-auto",
        )}
      >
        {subtitle}
      </p>
    )}
  </div>
);
