/**
 * Time entry (migration 024) — logging effort, and reading capacity.
 *
 * `minuteCount` crosses this boundary as INTEGER MINUTES, exactly as it is stored. The
 * hours-to-minutes conversion happens once, in the form, at the moment a person types
 * a number — never in the hook and never in the query cache. A float that reaches the
 * cache gets summed on every render of every summary, and this feeds a pricing argument.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export interface TimeEntry {
  timeEntryId: number;
  projectId: number;
  deliverableId: number | null;
  teamMemberId: number;
  /** YYYY-MM-DD, Asia/Manila. */
  workedOn: string;
  minuteCount: number;
  note: string | null;
  createdBy: number | null;
  createdAt: string;
}

export interface TimeEntryInput {
  projectId: number;
  deliverableId?: number | null;
  teamMemberId: number;
  workedOn: string;
  minuteCount: number;
  note?: string | null;
}

export interface MemberCapacity {
  teamMemberId: number;
  minuteCount: number;
  projectCount: number;
  workingDayEquivalent: number;
  /** Recorded minutes over the window's nominal capacity. Above 1 is the real signal. */
  loadRatio: number;
}

export interface CapacityWindow {
  fromOn: string;
  toOn: string;
  member: MemberCapacity[];
}

const ENTRY_KEY = ["time-entry"];
const CAPACITY_KEY = ["time-entry", "capacity"];

/** Minutes as a human duration: 930 → "15h 30m". Mirrors the server's formatDuration. */
export function formatDuration(minuteCount: number): string {
  if (minuteCount <= 0) return "0m";
  const hour = Math.floor(minuteCount / 60);
  const minute = minuteCount % 60;
  if (hour === 0) return `${minute}m`;
  if (minute === 0) return `${hour}h`;
  return `${hour}h ${minute}m`;
}

/**
 * Hours typed by a person into integer minutes.
 *
 * Rounds, and rounding here is correct: someone typing "1.5" means ninety minutes, and
 * someone typing "0.333" means twenty, near enough. This is the ONE place a float is
 * allowed near this number, and it terminates immediately — nothing downstream sees it.
 * Returns null for anything unparseable rather than NaN, which would reach the API as
 * `null` and fail validation with a message about a missing field.
 */
export function hourToMinute(raw: string): number | null {
  const hour = Number(raw);
  if (!Number.isFinite(hour) || hour <= 0) return null;
  return Math.round(hour * 60);
}

export function useTimeEntry(projectId?: number) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: entry = [], isLoading } = useQuery({
    queryKey: [...ENTRY_KEY, projectId ?? "all"],
    queryFn: async () =>
      (await get<TimeEntry[]>(`/api/insight/time${projectId ? `?projectId=${projectId}` : ""}`))
        .data || [],
    staleTime: 30 * 1000,
  });

  const { data: capacity } = useQuery({
    queryKey: CAPACITY_KEY,
    queryFn: async () => (await get<CapacityWindow>("/api/insight/capacity")).data,
    staleTime: 60 * 1000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ENTRY_KEY });
    qc.invalidateQueries({ queryKey: CAPACITY_KEY });
  };
  const onErr = (e: Error) =>
    toast({ title: "Error", description: e.message, variant: "destructive" });

  const createMutation = useMutation({
    mutationFn: async (input: TimeEntryInput) => {
      const r = await post("/api/insight/time", input);
      if (r.error) throw new Error(r.error);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Time logged" });
    },
    onError: onErr,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await del(`/api/insight/time/${id}`);
      if (r.error) throw new Error(r.error);
    },
    onSuccess: () => {
      invalidate();
      // A correction is an edit or a delete — never a negative entry. See 024.
      toast({ title: "Entry removed" });
    },
    onError: onErr,
  });

  return {
    entry,
    capacity,
    isLoading,
    createTimeEntry: createMutation.mutateAsync,
    deleteTimeEntry: deleteMutation.mutateAsync,
    isSaving: createMutation.isPending || deleteMutation.isPending,
  };
}
