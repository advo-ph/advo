import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export type CalSource =
  | "manual"
  | "deliverable"
  | "invoice"
  | "project"
  | "social"
  | "contract"
  | "bir";

export interface CalEvent {
  id: string;
  source: CalSource;
  category: string;
  title: string;
  start: string; // ISO
  end: string | null;
  allDay: boolean;
  projectId: number | null;
  projectTitle: string | null;
  editable: boolean;
  location: string | null;
  description: string | null;
}

export interface NewEvent {
  title: string;
  category: string;
  startsAt: string; // ISO
  endsAt?: string | null;
  isAllDay?: boolean;
  description?: string | null;
  location?: string | null;
  projectId?: number | null;
}

// Numeric id of a manual event from its prefixed CalEvent id ("manual-12" -> 12).
export const manualEventId = (id: string) => Number(id.replace("manual-", ""));

export function useCalendar(from: Date, to: Date) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const queryKey = ["calendar", from.toISOString(), to.toISOString()];

  const { data: events = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const qs = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
      const res = await get<CalEvent[]>(`/api/calendar?${qs.toString()}`);
      return res.data || [];
    },
    staleTime: 30 * 1000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["calendar"] });
  const onErr = (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" });

  const createMutation = useMutation({
    mutationFn: async (e: NewEvent) => {
      const r = await post("/api/calendar", e);
      if (r.error) throw new Error(r.error);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Event added" });
    },
    onError: onErr,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch: body }: { id: number; patch: Partial<NewEvent> }) => {
      const r = await patch(`/api/calendar/${id}`, body);
      if (r.error) throw new Error(r.error);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Event updated" });
    },
    onError: onErr,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await del(`/api/calendar/${id}`);
      if (r.error) throw new Error(r.error);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Event deleted" });
    },
    onError: onErr,
  });

  return {
    events,
    isLoading,
    createEvent: createMutation.mutateAsync,
    updateEvent: updateMutation.mutateAsync,
    deleteEvent: deleteMutation.mutateAsync,
    isMutating: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  };
}
