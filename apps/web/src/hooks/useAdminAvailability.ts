import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export type BlockType = "school" | "break" | "work" | "unavailable";

export interface AvailabilityBlock {
  block_id: number;
  team_member_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  block_type: BlockType;
  label: string | null;
  /** Manila dates bounding the recurrence. null = open-ended. Migration 024. */
  effective_from: string | null;
  effective_to: string | null;
}

/**
 * Does this recurring block apply on a given Manila date?
 *
 * The day-of-week match is only half the question. Without the effective window a
 * student's "Tuesdays 10:00" class was asserted for every Tuesday that has ever existed
 * and every Tuesday to come — navigate the calendar to 2029 and the chip was still there.
 *
 * `dateKey` is YYYY-MM-DD, so the bound comparisons are plain string comparisons.
 */
export function blockAppliesOn(
  block: Pick<AvailabilityBlock, "day_of_week" | "effective_from" | "effective_to">,
  dateKey: string,
  dayOfWeek: number,
): boolean {
  if (block.day_of_week !== dayOfWeek) return false;
  if (block.effective_from && dateKey < block.effective_from) return false;
  if (block.effective_to && dateKey > block.effective_to) return false;
  return true;
}

function mapBlock(b: Record<string, unknown>): AvailabilityBlock {
  return {
    block_id: (b.blockId ?? b.block_id) as number,
    team_member_id: (b.teamMemberId ?? b.team_member_id) as number,
    day_of_week: (b.dayOfWeek ?? b.day_of_week) as number,
    start_time: (b.startTime ?? b.start_time) as string,
    end_time: (b.endTime ?? b.end_time) as string,
    block_type: (b.blockType ?? b.block_type) as BlockType,
    label: (b.label as string | null) || null,
    effective_from: ((b.effectiveFrom ?? b.effective_from) as string | null) || null,
    effective_to: ((b.effectiveTo ?? b.effective_to) as string | null) || null,
  };
}

export interface AvailabilityBlockInput {
  team_member_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  block_type: BlockType;
  label: string | null;
  effective_from: string | null;
  effective_to: string | null;
}

function toApiPayload(input: AvailabilityBlockInput) {
  return {
    teamMemberId: input.team_member_id,
    dayOfWeek: input.day_of_week,
    startTime: input.start_time,
    endTime: input.end_time,
    blockType: input.block_type,
    // null, never undefined. The server PATCH is .partial(), so an absent key is a no-op
    // — coercing "" to undefined here meant clearing a label sent nothing and the old
    // label stayed in the database while the dialog closed as if it had saved.
    label: input.label && input.label.trim() ? input.label.trim() : null,
    effectiveFrom: input.effective_from || null,
    effectiveTo: input.effective_to || null,
  };
}

const QUERY_KEY = ["adminAvailability"];

async function fetchBlocks(): Promise<AvailabilityBlock[]> {
  const res = await get<Record<string, unknown>[]>("/api/availability");
  return (res.data || []).map(mapBlock);
}

export function useAdminAvailability() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: blocks = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchBlocks,
    staleTime: 2 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (input: AvailabilityBlockInput) => {
      const res = await post<Record<string, unknown>>("/api/availability", toApiPayload(input));
      if (res.error) throw new Error(res.error);
      return mapBlock(res.data!);
    },
    onSuccess: (created) => {
      queryClient.setQueryData<AvailabilityBlock[]>(QUERY_KEY, (old = []) => [...old, created]);
      toast({ title: "Added", description: "Schedule block added" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: number; input: AvailabilityBlockInput }) => {
      const res = await patch<Record<string, unknown>>(
        `/api/availability/${id}`,
        toApiPayload(input),
      );
      if (res.error) throw new Error(res.error);
      return mapBlock(res.data!);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<AvailabilityBlock[]>(QUERY_KEY, (old = []) =>
        old.map((b) => (b.block_id === updated.block_id ? updated : b)),
      );
      toast({ title: "Updated", description: "Schedule block updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await del(`/api/availability/${id}`);
      if (res.error) throw new Error(res.error);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const prev = queryClient.getQueryData<AvailabilityBlock[]>(QUERY_KEY);
      queryClient.setQueryData<AvailabilityBlock[]>(QUERY_KEY, (old = []) =>
        old.filter((b) => b.block_id !== id),
      );
      return { prev };
    },
    onError: (err: Error, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEY, ctx.prev);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    onSuccess: () => toast({ title: "Deleted", description: "Schedule block removed" }),
  });

  return {
    blocks,
    isLoading,
    createBlock: createMutation.mutateAsync,
    updateBlock: (id: number, input: AvailabilityBlockInput) =>
      updateMutation.mutateAsync({ id, input }),
    deleteBlock: deleteMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending,
  };
}
