/**
 * Client engagement — who has gone quiet.
 *
 * The stalest client is at the TOP, and a client who has opened nothing at all is above
 * everyone. That ordering is the whole product: this panel exists so "the client has not
 * opened the proposal in 9 days" is a thing ADVO can see rather than guess.
 *
 * Order comes from the server; this file renders it and does not re-sort.
 */
import { useState } from "react";
import { Activity, ChevronDown, Loader2, RefreshCw } from "lucide-react";
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
  Dot,
} from "@/components/admin/_ui";
import {
  useEngagement,
  type EngagementRow,
  type EngagementSurface,
} from "@/hooks/useEngagement";

const WINDOW_OPTION = [30, 90, 180, 365];

const surfaceLabel: Record<EngagementSurface, string> = {
  proposal: "Proposal",
  contract: "Contract",
  preview: "Preview",
  invoice: "Invoice",
  portal: "Portal",
  other: "Other",
};

/**
 * Colour is a staleness scale, not decoration: red = gone quiet, green = active today.
 * Accent orange is reserved for the one headline metric, per the design language.
 */
function staleTone(staleDay: number | null): { dot: string; text: string } {
  if (staleDay === null) return { dot: "bg-red-500", text: "text-red-400" };
  if (staleDay >= 14) return { dot: "bg-red-500", text: "text-red-400" };
  if (staleDay >= 7) return { dot: "bg-amber-500", text: "text-amber-400" };
  if (staleDay >= 3) return { dot: "bg-blue-500", text: "text-blue-400" };
  return { dot: "bg-green-500", text: "text-green-400" };
}

function staleLabel(staleDay: number | null): string {
  if (staleDay === null) return "Never opened";
  if (staleDay === 0) return "Today";
  if (staleDay === 1) return "1 day ago";
  return `${staleDay} days ago`;
}

const EngagementRowView = ({ row }: { row: EngagementRow }) => {
  const [isOpen, setIsOpen] = useState(false);
  const tone = staleTone(row.stale_day);
  const top = row.surface[0];

  return (
    <div>
      <TRow onClick={() => setIsOpen((open) => !open)}>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform ${
            isOpen ? "" : "-rotate-90"
          }`}
        />
        <div className="w-[220px] min-w-0 flex items-center gap-2">
          <Dot className={tone.dot} />
          <span className="truncate font-medium">{row.company_name}</span>
        </div>
        <div className={`w-[120px] shrink-0 tabular-nums ${tone.text}`}>
          {staleLabel(row.stale_day)}
        </div>
        <div className="w-[150px] shrink-0 truncate text-muted-foreground">
          {top ? `Last: ${surfaceLabel[top.surface]}` : "No activity"}
        </div>
        <div className="w-[90px] shrink-0 tabular-nums text-muted-foreground text-right">
          {row.view_count}
        </div>
        <div className="w-[90px] shrink-0 tabular-nums text-muted-foreground text-right">
          {row.session_count}
        </div>
        <div className="flex-1 min-w-0 truncate text-right text-muted-foreground">
          {row.contact_email ?? "—"}
        </div>
      </TRow>

      {isOpen && (
        <div className="bg-secondary/20 border-t border-border px-3 py-2">
          {row.surface.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">
              Nothing opened in this window — no proposal, contract, or preview view recorded.
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {row.surface.map((s) => {
                const surfaceTone = staleTone(s.stale_day);
                return (
                  <div
                    key={s.surface}
                    className="flex items-center gap-3 h-8 text-xs text-muted-foreground"
                  >
                    <span className="w-[220px] shrink-0 text-foreground">
                      {surfaceLabel[s.surface]}
                    </span>
                    <span className={`w-[120px] shrink-0 tabular-nums ${surfaceTone.text}`}>
                      {staleLabel(s.stale_day)}
                    </span>
                    <span className="w-[150px] shrink-0 tabular-nums">
                      {s.view_count} view · {s.session_count} session
                    </span>
                    <span className="flex-1 min-w-0 truncate">
                      {s.last_seen_at ? new Date(s.last_seen_at).toLocaleString() : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AdminEngagement = () => {
  const [windowDay, setWindowDay] = useState(90);
  const { report, engagement, isLoading, error, refetch } = useEngagement(windowDay);

  // The count worth acting on today: quiet for a week or more, or never seen at all.
  const staleCount = engagement.filter(
    (e) => e.stale_day === null || e.stale_day >= 7,
  ).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Engagement"
        meta={
          report
            ? `${report.client_count} client · last ${report.window_day} days`
            : "Client hub activity"
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
              aria-label="Refresh engagement"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        }
      />

      <StatStrip>
        <Stat
          label="Gone quiet (7d+)"
          value={String(staleCount)}
          sub="Needs a nudge"
          accent
        />
        <Stat
          label="Never opened"
          value={report ? String(report.silent_count) : "—"}
          sub="No view in window"
        />
        <Stat label="Client tracked" value={report ? String(report.client_count) : "—"} />
        <Stat
          label="View recorded"
          value={String(engagement.reduce((sum, e) => sum + e.view_count, 0))}
          sub={report ? `Last ${report.window_day} days` : undefined}
        />
      </StatStrip>

      <Table>
        <THead>
          <span className="w-3.5 shrink-0" />
          <span className="w-[220px]">Client</span>
          <span className="w-[120px] shrink-0">Last seen</span>
          <span className="w-[150px] shrink-0">Latest surface</span>
          <span className="w-[90px] shrink-0 text-right">View</span>
          <span className="w-[90px] shrink-0 text-right">Session</span>
          <span className="flex-1 text-right">Contact</span>
        </THead>
        <TBody>
          {isLoading ? (
            <div className="px-4 py-10 flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <Empty text={error} icon={Activity} />
          ) : engagement.length === 0 ? (
            <Empty text="No clients to track yet." icon={Activity} />
          ) : (
            engagement.map((row) => <EngagementRowView key={row.client_id} row={row} />)
          )}
        </TBody>
      </Table>
    </div>
  );
};

export default AdminEngagement;
