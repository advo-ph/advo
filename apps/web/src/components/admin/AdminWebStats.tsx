/**
 * Web statistics — visitor numbers for the public site.
 *
 * Reads GET /api/visitor-stats/* (admin-gated, process/general-plans/active/
 * visitor-analytics_PLAN_09-10-26.md §4.7-4.8). Every number here comes straight off the
 * raw analytics_event table for the selected date range — no new fingerprinting, nothing
 * beyond what apps/web/src/lib/track.ts already records.
 */
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  StatStrip,
  Stat,
  Table,
  THead,
  TBody,
  TRow,
  Empty,
} from "@/components/admin/_ui";
import { useVisitorStats, type ScrollDepthRow, type SectionRow } from "@/hooks/useVisitorStats";
import { isAnalyticsEnabled } from "@/components/ConsentGate";
import VisitorWorldMap from "@/components/admin/VisitorWorldMap";

const WINDOW_OPTION = [7, 30, 90];
const MILLISECOND_PER_DAY = 24 * 60 * 60 * 1000;
const SCROLL_MILESTONE: ScrollDepthRow["milestone"][] = [25, 50, 75, 100];

/** Only these ids exist on the landing page's instrumented sections (lib/track.ts's
 * observeLandingSection watches section[id] — the marquee section has no id and is
 * invisible to this data). Anything else returned by the API is an unexpected key and is
 * shown as-is rather than silently dropped, so a future section addition is visible here
 * immediately instead of needing a code change to appear. */
const KNOWN_SECTION_LABEL: Record<string, string> = {
  top: "Hero",
  solutions: "Solutions",
  services: "Services",
  process: "Process",
};

let countryNames: Intl.DisplayNames | null = null;
function countryName(code: string | null): string {
  if (!code) return "Unknown";
  if (!countryNames) {
    try {
      countryNames = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      return code;
    }
  }
  try {
    return countryNames.of(code) ?? code;
  } catch {
    return code;
  }
}

function formatSecond(value: number | null): string {
  if (value === null) return "0s";
  if (value < 60) return `${Math.round(value)}s`;
  return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
}

/** Every UTC day in the window, oldest first, so the chart draws a flat zero line on quiet
 * days instead of skipping them (or showing nothing when the whole range is empty). */
function dayKeysFor(windowDay: number): string[] {
  const now = Date.now();
  const key: string[] = [];
  for (let i = windowDay; i >= 0; i -= 1) {
    key.push(new Date(now - i * MILLISECOND_PER_DAY).toISOString().slice(0, 10));
  }
  return key;
}

/** Small inline marker for a card whose read failed. The card still renders with zeros. */
const LoadError = ({ message }: { message: string | null }) =>
  message ? <span className="text-xs text-destructive">Could not load: {message}</span> : null;

const AdminWebStats = () => {
  const [windowDay, setWindowDay] = useState(30);
  const { summary, pages, sections, scrollDepth, geo, isLoading, error, refetch } =
    useVisitorStats(windowDay);
  const isTrackingOn = isAnalyticsEnabled();

  const chartData = useMemo(() => {
    const byDate = new Map((summary?.byDay ?? []).map((d) => [d.date, d]));
    return dayKeysFor(windowDay).map((date) => {
      const day = byDate.get(date);
      return {
        date,
        uniqueVisitorCount: day?.uniqueVisitorCount ?? 0,
        sessionCount: day?.sessionCount ?? 0,
        pageViewCount: day?.pageViewCount ?? 0,
        label: new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }),
      };
    });
  }, [summary, windowDay]);

  // The four instrumented sections always show, at zero when nothing was recorded. Any
  // other id the API returns is appended as-is.
  const sectionRow = useMemo<SectionRow[]>(() => {
    const bySection = new Map(sections.map((s) => [s.section, s]));
    const known = Object.keys(KNOWN_SECTION_LABEL).map(
      (id) => bySection.get(id) ?? { section: id, viewCount: 0, avgDwellSecond: null },
    );
    const extra = sections.filter((s) => !(s.section in KNOWN_SECTION_LABEL));
    return [...known, ...extra];
  }, [sections]);

  const scrollRow = useMemo<ScrollDepthRow[]>(() => {
    const byMilestone = new Map(scrollDepth.map((s) => [s.milestone, s.reachedSessionCount]));
    return SCROLL_MILESTONE.map((milestone) => ({
      milestone,
      reachedSessionCount: byMilestone.get(milestone) ?? 0,
    }));
  }, [scrollDepth]);

  const maxScrollReach = scrollRow.reduce((max, s) => Math.max(max, s.reachedSessionCount), 0);
  const visitorCount = summary?.uniqueVisitorCount ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Web Statistics"
        meta={
          isLoading
            ? "Loading"
            : `${visitorCount} visitor${visitorCount === 1 ? "" : "s"} · last ${windowDay} days`
        }
        action={
          <div className="flex items-center gap-1">
            {WINDOW_OPTION.map((day) => (
              <button
                key={day}
                onClick={() => setWindowDay(day)}
                className={`px-2 h-7 rounded-md text-xs tabular-nums transition-colors ${
                  day === windowDay
                    ? "bg-accent/10 text-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
              >
                {day}d
              </button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => refetch()}
              aria-label="Refresh web statistics"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        }
      />

      {!isTrackingOn && (
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Visitor tracking is off on the public site. New visits are not recorded until it is
          turned on.
        </div>
      )}

      <div className={`space-y-4 transition-opacity ${isLoading ? "opacity-60" : ""}`} aria-busy={isLoading}>
        <StatStrip>
          <Stat
            label="Unique visitors"
            value={String(visitorCount)}
            sub={error.summary ? "Could not load" : "Who allowed tracking"}
            accent
          />
          <Stat label="Sessions" value={String(summary?.sessionCount ?? 0)} sub={error.summary ? "Could not load" : undefined} />
          <Stat label="Page views" value={String(summary?.pageViewCount ?? 0)} sub={error.summary ? "Could not load" : undefined} />
          <Stat
            label="Cities tracked"
            value={String(geo?.cities.length ?? 0)}
            sub={error.geo ? "Could not load" : "With resolved geo"}
          />
        </StatStrip>

        {/* Traffic over time */}
        <div className="border border-border rounded-lg bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Traffic over time</h2>
            <LoadError message={error.summary} />
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} width={32} allowDecimals={false} domain={[0, (max: number) => Math.max(max, 4)]} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, color: "hsl(var(--foreground))" }}
                  labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                />
                <Area name="Page views" type="monotone" dataKey="pageViewCount" stroke="hsl(var(--accent))" fill="hsl(var(--accent) / 0.15)" strokeWidth={2} />
                <Area name="Unique visitors" type="monotone" dataKey="uniqueVisitorCount" stroke="#60a5fa" fill="#60a5fa15" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Visitor map */}
        <div className="border border-border rounded-lg bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Visitor locations</h2>
            {error.geo ? (
              <LoadError message={error.geo} />
            ) : (
              <p className="text-xs text-muted-foreground">City-level, approximate</p>
            )}
          </div>
          <VisitorWorldMap cities={geo?.cities ?? []} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Top pages. min-w-0 lets the table scroll inside its own box on a phone instead
              of stretching the grid cell past the screen edge. */}
          <div className="min-w-0">
            <Table minWidth="420px">
              <THead>
                <span className="flex-1">Page</span>
                <span className="w-[80px] shrink-0 text-right">Views</span>
                <span className="w-[90px] shrink-0 text-right">Sessions</span>
              </THead>
              <TBody>
                {pages.length === 0 ? (
                  <Empty text={error.pages ? "Could not load top pages." : "No page views yet."} />
                ) : (
                  pages.map((p) => (
                    <TRow key={p.path}>
                      <span className="flex-1 min-w-0 truncate font-medium">{p.path}</span>
                      <span className="w-[80px] shrink-0 tabular-nums text-right">{p.viewCount}</span>
                      <span className="w-[90px] shrink-0 tabular-nums text-right text-muted-foreground">
                        {p.sessionCount}
                      </span>
                    </TRow>
                  ))
                )}
              </TBody>
            </Table>
          </div>

          {/* Landing sections */}
          <div className="min-w-0">
            <Table minWidth="420px">
              <THead>
                <span className="flex-1">Landing section</span>
                <span className="w-[90px] shrink-0 text-right">Views</span>
                <span className="w-[110px] shrink-0 text-right">Avg dwell</span>
              </THead>
              <TBody>
                {sectionRow.map((s) => (
                  <TRow key={s.section}>
                    <span className="flex-1 min-w-0 truncate font-medium">
                      {KNOWN_SECTION_LABEL[s.section] ?? s.section}
                    </span>
                    <span className="w-[90px] shrink-0 tabular-nums text-right">{s.viewCount}</span>
                    <span className="w-[110px] shrink-0 tabular-nums text-right text-muted-foreground">
                      {formatSecond(s.avgDwellSecond)}
                    </span>
                  </TRow>
                ))}
              </TBody>
            </Table>
            <p className="mt-1.5 px-1 text-xs text-muted-foreground">
              {error.sections ? (
                <LoadError message={error.sections} />
              ) : (
                "Only the hero, solutions, services and process sections are instrumented."
              )}
            </p>
          </div>
        </div>

        {/* Scroll-depth funnel */}
        <div className="border border-border rounded-lg bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Scroll-depth funnel</h2>
            <LoadError message={error.scrollDepth} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {scrollRow.map((s) => (
              <div key={s.milestone} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{s.milestone}%</span>
                  <span className="font-medium tabular-nums">{s.reachedSessionCount}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{
                      width: `${maxScrollReach > 0 ? (s.reachedSessionCount / maxScrollReach) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Countries + cities */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Table minWidth="320px">
            <THead>
              <span className="flex-1">Country</span>
              <span className="w-[90px] shrink-0 text-right">Views</span>
            </THead>
            <TBody>
              {!geo || geo.countries.length === 0 ? (
                <Empty text={error.geo ? "Could not load countries." : "No countries yet."} />
              ) : (
                geo.countries.map((c) => (
                  <TRow key={c.country}>
                    <span className="flex-1 min-w-0 truncate font-medium">{countryName(c.country)}</span>
                    <span className="w-[90px] shrink-0 tabular-nums text-right">{c.viewCount}</span>
                  </TRow>
                ))
              )}
            </TBody>
          </Table>

          <Table minWidth="320px">
            <THead>
              <span className="flex-1">City</span>
              <span className="w-[90px] shrink-0 text-right">Views</span>
            </THead>
            <TBody>
              {!geo || geo.cities.length === 0 ? (
                <Empty text={error.geo ? "Could not load cities." : "No cities yet."} />
              ) : (
                geo.cities.map((c) => (
                  <TRow key={`${c.country}-${c.city}`}>
                    <span className="flex-1 min-w-0 truncate font-medium">
                      {c.city ?? "Unknown"}
                      <span className="text-muted-foreground"> · {countryName(c.country)}</span>
                    </span>
                    <span className="w-[90px] shrink-0 tabular-nums text-right">{c.viewCount}</span>
                  </TRow>
                ))
              )}
            </TBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default AdminWebStats;
