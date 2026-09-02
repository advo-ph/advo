/**
 * Admin Time — logging effort, and reading who is carrying what.
 *
 * The screen exists to answer two questions the business has been asking without
 * evidence: what did this project actually cost in effort, and who is buried right now.
 *
 * Three decisions worth stating, because each is the difference between a timesheet
 * people fill in and one they resent:
 *
 *   HOURS IN, MINUTES STORED. Nobody types "480". The form takes hours as a decimal and
 *   converts once, at the keystroke; everything downstream is integer minutes. This is
 *   the only float in the path and it terminates immediately.
 *
 *   THE LOAD BAR IS A MEASUREMENT, NOT A VERDICT. A ratio under 1 does NOT mean somebody
 *   is idle — this table holds only what people bothered to record, and under-recording
 *   is the expected failure mode of every timesheet ever built. A ratio ABOVE 1 is the
 *   signal worth acting on, because it cannot be produced by under-recording. The copy
 *   says so on the panel rather than leaving people to infer a judgement.
 *
 *   NO MONEY ANYWHERE ON THIS SCREEN. No rate, no cost, no "this project lost ₱X". ADVO
 *   bills fixed-price, and the moment effort carries a peso figure per person a
 *   timesheet becomes a performance review. Effort informs the price of the NEXT
 *   proposal; that is a conversation a human has, not a number this screen prints.
 */
import { useState } from "react";
import { Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, Panel, Empty, Stat, StatStrip } from "@/components/admin/_ui";
import {
  formatDuration,
  hourToMinute,
  useTimeEntry,
  type MemberCapacity,
} from "@/hooks/useTimeEntry";
import type { Project } from "@/types/admin";

interface TeamMemberLike {
  team_member_id?: number;
  teamMemberId?: number;
  name: string;
}

interface AdminTimeProps {
  projects: Project[];
  team?: TeamMemberLike[];
}

/** Today as YYYY-MM-DD in the browser's own timezone — the day the person is having. */
function todayOn(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const memberIdOf = (one: TeamMemberLike) => one.teamMemberId ?? one.team_member_id ?? 0;

const LoadBar = ({ member, name }: { member: MemberCapacity; name: string }) => {
  // Capped at 100% width so an over-loaded bar does not run off the panel; the NUMBER
  // still reads past 1.0, which is the part that matters.
  const width = Math.min(100, Math.round(member.loadRatio * 100));
  return (
    <div className="px-4 py-3 space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm truncate">{name}</span>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {formatDuration(member.minuteCount)} · {member.projectCount}{" "}
          {member.projectCount === 1 ? "project" : "projects"}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={member.loadRatio > 1 ? "h-full bg-foreground" : "h-full bg-foreground/50"}
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {member.workingDayEquivalent}d recorded
        {member.loadRatio > 1 && " — above nominal capacity for this window"}
      </p>
    </div>
  );
};

const AdminTime = ({ projects, team = [] }: AdminTimeProps) => {
  const { entry, capacity, isLoading, createTimeEntry, deleteTimeEntry, isSaving } =
    useTimeEntry();

  const [projectId, setProjectId] = useState<string>("");
  const [teamMemberId, setTeamMemberId] = useState<string>("");
  const [workedOn, setWorkedOn] = useState<string>(todayOn());
  const [hour, setHour] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const minuteCount = hourToMinute(hour);
  const canSubmit = !!projectId && !!teamMemberId && !!workedOn && minuteCount !== null;

  const onSubmit = async () => {
    if (!canSubmit || minuteCount === null) return;
    await createTimeEntry({
      projectId: Number(projectId),
      teamMemberId: Number(teamMemberId),
      workedOn,
      minuteCount,
      note: note.trim() || null,
    });
    // Project, person and date persist deliberately: logging a week is several entries
    // against the same three, and re-picking them every time is what makes people stop.
    setHour("");
    setNote("");
  };

  const totalMinute = entry.reduce((sum, one) => sum + one.minuteCount, 0);
  const projectTitleOf = (id: number) =>
    projects.find((p) => p.project_id === id)?.title ?? `Project ${id}`;
  const memberNameOf = (id: number) =>
    team.find((m) => memberIdOf(m) === id)?.name ?? `Member ${id}`;

  return (
    <div className="space-y-5">
      <PageHeader title="Time" meta="Effort recorded — not billing, not surveillance" />

      <StatStrip cols={3}>
        <Stat label="Recorded" value={formatDuration(totalMinute)} sub={`${entry.length} entries`} />
        <Stat
          label="People logging"
          value={String(capacity?.member.length ?? 0)}
          sub={capacity ? `${capacity.fromOn} → ${capacity.toOn}` : "last 14 days"}
        />
        <Stat
          label="Over capacity"
          value={String((capacity?.member ?? []).filter((m) => m.loadRatio > 1).length)}
          sub="above nominal for the window"
        />
      </StatStrip>

      {/* ─── Log ─── */}
      <Panel title="Log time">
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="time-project" className="text-xs">
              Project
            </Label>
            <select
              id="time-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select…</option>
              {projects.map((p) => (
                <option key={p.project_id} value={p.project_id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="time-member" className="text-xs">
              Who
            </Label>
            <select
              id="time-member"
              value={teamMemberId}
              onChange={(e) => setTeamMemberId(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select…</option>
              {team.map((m) => (
                <option key={memberIdOf(m)} value={memberIdOf(m)}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="time-date" className="text-xs">
              Day
            </Label>
            <Input
              id="time-date"
              type="date"
              value={workedOn}
              // The API refuses a future date; stopping it here means a sentence
              // instead of a round trip.
              max={todayOn()}
              onChange={(e) => setWorkedOn(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="time-hour" className="text-xs">
              Hours
            </Label>
            <Input
              id="time-hour"
              type="number"
              step="0.25"
              min="0.25"
              max="16"
              value={hour}
              onChange={(e) => setHour(e.target.value)}
              placeholder="3.5"
              className="h-9"
            />
            {/* The conversion, shown. Somebody typing 3.5 should see 3h 30m before they
                commit, not discover the rounding later in a summary. */}
            <p className="text-xs text-muted-foreground h-4">
              {minuteCount !== null ? formatDuration(minuteCount) : ""}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="time-note" className="text-xs">
              On what
            </Label>
            <Input
              id="time-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="optional"
              className="h-9"
            />
          </div>
        </div>
        <div className="px-4 pb-4">
          <Button size="sm" disabled={!canSubmit || isSaving} onClick={onSubmit}>
            <Clock className="h-3.5 w-3.5 mr-1.5" />
            {isSaving ? "Saving…" : "Log"}
          </Button>
        </div>
      </Panel>

      {/* ─── Capacity ─── */}
      <Panel
        title="Load"
        meta={capacity ? `${capacity.fromOn} → ${capacity.toOn}` : "last 14 days"}
      >
        {!capacity || capacity.member.length === 0 ? (
          <Empty text="Nobody has logged time in this window." icon={Clock} />
        ) : (
          <div className="divide-y divide-border">
            {capacity.member.map((one) => (
              <LoadBar
                key={one.teamMemberId}
                member={one}
                name={memberNameOf(one.teamMemberId)}
              />
            ))}
          </div>
        )}
        <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
          A measurement, not a verdict. Under nominal usually means under-recorded — this
          only holds what people entered. Above nominal is the signal worth acting on,
          because under-recording cannot produce it. Nothing here blocks an assignment.
        </p>
      </Panel>

      {/* ─── Recent ─── */}
      <Panel title="Recent entries" meta={`${entry.length}`}>
        {isLoading ? (
          <Empty text="Loading…" />
        ) : entry.length === 0 ? (
          <Empty text="No time logged yet." icon={Clock} />
        ) : (
          <ul className="divide-y divide-border">
            {entry.slice(0, 30).map((one) => (
              <li key={one.timeEntryId} className="px-4 py-2.5 flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate">
                    {projectTitleOf(one.projectId)}
                    {one.note && <span className="text-muted-foreground"> — {one.note}</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {memberNameOf(one.teamMemberId)} · {one.workedOn}
                  </span>
                </span>
                <span className="text-sm tabular-nums shrink-0">
                  {formatDuration(one.minuteCount)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isSaving}
                  // A correction is an edit or a delete, never a negative entry — 024
                  // CHECKs minute_count positive so an anti-entry cannot exist.
                  onClick={() => deleteTimeEntry(one.timeEntryId)}
                  aria-label="Remove entry"
                  className="shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
};

export default AdminTime;
