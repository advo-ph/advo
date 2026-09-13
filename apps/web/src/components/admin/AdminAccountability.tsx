import { ShieldCheck, Loader2, AlertTriangle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageHeader, StatStrip, Stat, Table, THead, TBody, TRow, Empty, Panel } from "@/components/admin/_ui";
import { useAccountability, sinceLabel, type AccountabilityRow } from "@/hooks/useAccountability";

const initial = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/**
 * On-time reliability, rendered honestly.
 *
 * Below the API's small-sample floor there is no percentage at all — the raw
 * "2/3" is shown greyed instead. A percentage next to a colleague's name is a
 * claim about them; it needs a denominator worth believing.
 */
const OnTime = ({ row, minSample }: { row: AccountabilityRow; minSample: number }) => {
  if (row.gradable_count === 0) {
    return <span className="text-muted-foreground/60">no due-dated work</span>;
  }
  if (row.on_time_rate === null) {
    return (
      <span
        className="text-muted-foreground/70 tabular-nums"
        title={`Fewer than ${minSample} completed deliverables with a due date — too few to state a rate.`}
      >
        {row.on_time_count}/{row.gradable_count}
        <span className="ml-1.5 text-[11px] text-muted-foreground/50">low sample</span>
      </span>
    );
  }
  const pct = Math.round(row.on_time_rate * 100);
  const tone = pct >= 85 ? "text-green-500" : pct >= 60 ? "text-amber-500" : "text-red-500";
  return (
    <span className="tabular-nums">
      <span className={`font-medium ${tone}`}>{pct}%</span>
      {/* The denominator always travels with the rate. */}
      <span className="ml-1.5 text-xs text-muted-foreground">
        {row.on_time_count}/{row.gradable_count}
      </span>
    </span>
  );
};

const AdminAccountability = () => {
  const { row, minSample, isLoading, error, accountability } = useAccountability();

  const overdueTotal = row.reduce((sum, r) => sum + r.overdue_count, 0);
  const openTotal = row.reduce((sum, r) => sum + r.open_count, 0);
  const verifiedTotal = row.reduce((sum, r) => sum + r.verified_count, 0);
  const ratedCount = row.filter((r) => r.on_time_rate !== null).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Accountability"
        meta={
          accountability
            ? `derived from deliverables · as of ${new Date(accountability.as_of).toLocaleString()}`
            : "derived from deliverables"
        }
      />

      <StatStrip>
        <Stat label="Overdue" value={String(overdueTotal)} sub="open past due date" accent={overdueTotal > 0} />
        <Stat label="Open assigned" value={String(openTotal)} sub="not completed" />
        <Stat label="Verified sign-off" value={String(verifiedTotal)} sub="verified_at set" />
        <Stat
          label="Members rated"
          value={`${ratedCount}/${row.length}`}
          sub={`needs ${minSample}+ due-dated completions`}
        />
      </StatStrip>

      {isLoading ? (
        <Panel>
          <div className="flex items-center justify-center py-14">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </Panel>
      ) : error ? (
        <Panel>
          <Empty text={error.message || "Could not load accountability"} icon={AlertTriangle} />
        </Panel>
      ) : row.length === 0 ? (
        <Panel>
          <Empty text="No active team members" icon={ShieldCheck} />
        </Panel>
      ) : (
        <Table>
          <THead>
            <span className="flex-1 min-w-0">Member</span>
            <span className="w-16 text-right">Open</span>
            <span className="w-20 text-right">Overdue</span>
            <span className="w-40">On time (n)</span>
            <span className="w-20 text-right">Verified</span>
            <span className="w-20 text-right">Penalty</span>
            <span className="w-24 text-right">Last active</span>
          </THead>
          <TBody>
            {row.map((r) => (
              <TRow key={r.team_member_id}>
                <span className="flex-1 min-w-0 flex items-center gap-2.5">
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarImage src={r.avatar_url ?? undefined} alt={r.name} />
                    <AvatarFallback className="text-[10px]">{initial(r.name)}</AvatarFallback>
                  </Avatar>
                  <span className="truncate">{r.name}</span>
                  <span className="text-xs text-muted-foreground truncate hidden sm:inline">{r.role}</span>
                </span>
                <span className="w-16 text-right tabular-nums">{r.open_count}</span>
                <span
                  className={`w-20 text-right tabular-nums ${
                    r.overdue_count > 0 ? "text-red-500 font-medium" : "text-muted-foreground/60"
                  }`}
                >
                  {r.overdue_count}
                </span>
                <span className="w-40 text-sm">
                  <OnTime row={r} minSample={minSample} />
                </span>
                <span className="w-20 text-right tabular-nums text-muted-foreground">
                  {r.verified_count}
                </span>
                <span
                  className={`w-20 text-right tabular-nums ${
                    r.penalty_point_count > 0 ? "text-amber-500" : "text-muted-foreground/50"
                  }`}
                >
                  {r.penalty_point_count}
                </span>
                <span className="w-24 text-right text-xs text-muted-foreground tabular-nums">
                  {sinceLabel(r.last_activity_at ?? r.last_completed_at)}
                </span>
              </TRow>
            ))}
          </TBody>
        </Table>
      )}

      <p className="text-xs text-muted-foreground/70 leading-relaxed">
        Ranked most-behind first, weighted by overdue work, open load and penalty points.
        Every figure is derived from existing deliverable records — nothing is tracked for this
        view. An on-time rate is withheld below {minSample} completed deliverables with a due
        date; the raw count is shown instead, because a percentage off a handful of items says
        more about the sample than the person.
      </p>
    </div>
  );
};

export default AdminAccountability;
