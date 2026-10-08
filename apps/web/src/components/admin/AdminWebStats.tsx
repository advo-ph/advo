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
import { BarChart3, Loader2, RefreshCw } from "lucide-react";
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
import { useVisitorStats } from "@/hooks/useVisitorStats";
import VisitorWorldMap from "@/components/admin/VisitorWorldMap";

const WINDOW_OPTION = [7, 30, 90];

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
  if (value === null) return "—";
  if (value < 60) return `${Math.round(value)}s`;
  return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
}

const AdminWebStats = () => {
  const [windowDay, setWindowDay] = useState(30);
  const { summary, pages, sections, scrollDepth, geo, isLoading, error, refetch } =
    useVisitorStats(windowDay);

  const hasAnyData =
    !!summary && (summary.uniqueVisitorCount > 0 || summary.sessionCount > 0 || summary.pageViewCount > 0);

  const chartData = useMemo(
    () =>
      (summary?.byDay ?? []).map((d) => ({
        ...d,
        label: new Date(`${d.date}T00:00:00Z`).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
      })),
    [summary],
  );

  const maxScrollReach = scrollDepth.reduce((max, s) => Math.max(max, s.reachedSessionCount), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Web Statistics"
        meta={summary ? `${summary.uniqueVisitorCount} visitors · last ${windowDay} days` : "Public site visitors"}
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
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        }
      />

      {isLoading && !summary ? (
        <div className="px-4 py-16 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Empty text={error} icon={BarChart3} />
      ) : !hasAnyData ? (
        <Empty text="No visitor activity in this range." icon={BarChart3} />
      ) : (
        <>
          <StatStrip>
            <Stat label="Unique visitors" value={String(summary?.uniqueVisitorCount ?? 0)} accent />
            <Stat label="Sessions" value={String(summary?.sessionCount ?? 0)} />
            <Stat label="Page views" value={String(summary?.pageViewCount ?? 0)} />
            <Stat
              label="Cities tracked"
              value={String(geo?.cities.length ?? 0)}
              sub="With resolved geo"
            />
          </StatStrip>

          {/* Traffic over time */}
          <div className="border border-border rounded-lg bg-card p-4">
            <h2 className="text-sm font-medium mb-3">Traffic over time</h2>
            {chartData.length === 0 ? (
              <Empty text="No daily data in this range." />
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, color: "hsl(var(--foreground))" }}
                      labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                    />
                    <Area name="Page views" type="monotone" dataKey="pageViewCount" stroke="hsl(var(--accent))" fill="hsl(var(--accent) / 0.15)" strokeWidth={2} />
                    <Area name="Unique visitors" type="monotone" dataKey="uniqueVisitorCount" stroke="#60a5fa" fill="#60a5fa15" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Visitor map */}
          <div className="border border-border rounded-lg bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Visitor locations</h2>
              <p className="text-xs text-muted-foreground">City-level, approximate</p>
            </div>
            {!geo || geo.cities.length === 0 ? (
              <Empty text="No resolved locations in this range." icon={BarChart3} />
            ) : (
              <VisitorWorldMap cities={geo.cities} />
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Top pages */}
            <Table minWidth="420px">
              <THead>
                <span className="flex-1">Page</span>
                <span className="w-[80px] shrink-0 text-right">Views</span>
                <span className="w-[90px] shrink-0 text-right">Sessions</span>
              </THead>
              <TBody>
                {pages.length === 0 ? (
                  <Empty text="No page views in this range." />
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

            {/* Landing sections */}
            <div>
              <Table minWidth="420px">
                <THead>
                  <span className="flex-1">Landing section</span>
                  <span className="w-[90px] shrink-0 text-right">Views</span>
                  <span className="w-[110px] shrink-0 text-right">Avg dwell</span>
                </THead>
                <TBody>
                  {sections.length === 0 ? (
                    <Empty text="No section attention recorded in this range." />
                  ) : (
                    sections.map((s) => (
                      <TRow key={s.section}>
                        <span className="flex-1 min-w-0 truncate font-medium">
                          {KNOWN_SECTION_LABEL[s.section] ?? s.section}
                        </span>
                        <span className="w-[90px] shrink-0 tabular-nums text-right">{s.viewCount}</span>
                        <span className="w-[110px] shrink-0 tabular-nums text-right text-muted-foreground">
                          {formatSecond(s.avgDwellSecond)}
                        </span>
                      </TRow>
                    ))
                  )}
                </TBody>
              </Table>
              <p className="mt-1.5 px-1 text-xs text-muted-foreground">
                Only the hero, solutions, services and process sections are instrumented.
              </p>
            </div>
          </div>

          {/* Scroll-depth funnel */}
          <div className="border border-border rounded-lg bg-card p-4">
            <h2 className="text-sm font-medium mb-3">Scroll-depth funnel</h2>
            <div className="grid grid-cols-4 gap-3">
              {scrollDepth.map((s) => (
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
                  <Empty text="No resolved countries in this range." />
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
                  <Empty text="No resolved cities in this range." />
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
        </>
      )}
    </div>
  );
};

export default AdminWebStats;
