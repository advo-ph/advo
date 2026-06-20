/**
 * Shared admin UI primitives — the Linear-inspired design language in one place.
 * Use these across every admin section (and the hub) so the look stays consistent.
 *
 * Vocabulary: dark cool-charcoal panels, hairline borders, 8px radius (rounded-lg),
 * ADVO orange (`accent`) ONLY for primary CTAs / active state / one key metric,
 * Hanken Grotesk (global) — never `font-mono`, use `tabular-nums` for figures.
 * Dense by default: page wrapper space-y-4/5, panel padding p-4, rows h-11 px-3.
 */
import type { ReactNode, ElementType } from "react";

/** Page title row: title + optional meta + optional right-aligned action. */
export const PageHeader = ({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
}) => (
  <div className="flex items-center justify-between gap-4">
    <div className="flex items-baseline gap-3 min-w-0">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      {meta && <span className="text-xs text-muted-foreground truncate">{meta}</span>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

/** One bordered row of inline metrics, hairline-separated. Put <Stat/> children inside. */
export const StatStrip = ({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) => (
  <div
    className={`grid grid-cols-2 ${
      cols === 3 ? "lg:grid-cols-3" : cols === 2 ? "" : "lg:grid-cols-4"
    } gap-px bg-border rounded-lg border border-border overflow-hidden`}
  >
    {children}
  </div>
);

export const Stat = ({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) => (
  <div className="bg-card px-4 py-3">
    <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
    <p className={`text-2xl font-semibold tracking-tight tabular-nums ${accent ? "text-accent" : ""}`}>
      {value}
    </p>
    {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
  </div>
);

/** Bordered panel with an optional header bar (title + meta/action). */
export const Panel = ({
  title,
  meta,
  action,
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) => (
  <div className={`border border-border rounded-lg bg-card ${className ?? ""}`}>
    {(title || action) && (
      <div className="flex items-center justify-between gap-3 px-4 h-11 border-b border-border">
        {title && <h2 className="text-sm font-medium">{title}</h2>}
        <div className="flex items-center gap-3">
          {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
          {action}
        </div>
      </div>
    )}
    {bodyClassName ? <div className={bodyClassName}>{children}</div> : children}
  </div>
);

/** Inline empty state — quiet, no oversized hero icon. */
export const Empty = ({ text, icon: Icon }: { text: string; icon?: ElementType }) => (
  <div className="px-4 py-10 text-center">
    {Icon && <Icon className="h-7 w-7 text-muted-foreground/40 mx-auto mb-2" />}
    <p className="text-sm text-muted-foreground">{text}</p>
  </div>
);

/** Small status dot (pass a bg-* color class). */
export const Dot = ({ className }: { className?: string }) => (
  <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${className ?? "bg-muted-foreground"}`} />
);

/**
 * Dense table scaffold. Use <THead> for the header row and <TRow> for body rows
 * inside a <Table>. Lay columns out with flex + fixed widths (see AdminLeads).
 */
export const Table = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={`border border-border rounded-lg bg-card overflow-hidden ${className ?? ""}`}>{children}</div>
);

export const THead = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center gap-3 px-3 h-9 border-b border-border text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
    {children}
  </div>
);

export const TBody = ({ children }: { children: ReactNode }) => (
  <div className="divide-y divide-border">{children}</div>
);

export const TRow = ({
  children,
  onClick,
  selected,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}) => (
  <div
    onClick={onClick}
    className={`flex items-center gap-3 px-3 h-11 text-sm transition-colors ${
      onClick ? "hover:bg-secondary/40 cursor-pointer" : ""
    } ${selected ? "bg-accent/[0.06]" : ""} ${className ?? ""}`}
  >
    {children}
  </div>
);
