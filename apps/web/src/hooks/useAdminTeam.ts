import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export interface TeamMember {
  team_member_id: number;
  name: string;
  role: string;
  email: string | null;
  avatar_url: string | null;
  bio: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  is_active: boolean;
  /** Manual tally; auto-accrual deferred. */
  penalty_point_count: number;
}

function mapMember(m: Record<string, unknown>): TeamMember {
  return {
    team_member_id: (m.teamMemberId ?? m.team_member_id) as number,
    name: m.name as string,
    role: m.role as string,
    email: (m.email as string) || null,
    avatar_url: (m.avatarUrl ?? m.avatar_url ?? null) as string | null,
    bio: (m.bio as string) || null,
    linkedin_url: (m.linkedinUrl ?? m.linkedin_url ?? null) as string | null,
    github_url: (m.githubUrl ?? m.github_url ?? null) as string | null,
    is_active: Boolean(m.isActive ?? m.is_active ?? true),
    penalty_point_count: Number(m.penaltyPointCount ?? m.penalty_point_count ?? 0),
  };
}

export interface TeamMemberInput {
  name: string;
  role: string;
  email?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  is_active?: boolean;
  /** Admin-only; omit on create (DB default 0). */
  penalty_point_count?: number;
}

function toApiPayload(input: TeamMemberInput) {
  // Preserve explicit nulls so that clearing a field on edit actually persists
  // (the API columns are nullable and the zod schema is .nullish()). Coercing
  // to undefined would drop the key from the JSON body and leave the old value.
  return {
    name: input.name,
    role: input.role,
    ...(input.email !== undefined && { email: input.email || null }),
    ...(input.avatar_url !== undefined && { avatarUrl: input.avatar_url || null }),
    ...(input.bio !== undefined && { bio: input.bio || null }),
    ...(input.linkedin_url !== undefined && { linkedinUrl: input.linkedin_url || null }),
    ...(input.github_url !== undefined && { githubUrl: input.github_url || null }),
    ...(input.is_active !== undefined && { isActive: input.is_active }),
    ...(input.penalty_point_count !== undefined && {
      penaltyPointCount: input.penalty_point_count,
    }),
  };
}

const QUERY_KEY = ["adminTeam"];

async function fetchTeam(): Promise<TeamMember[]> {
  const [teamRes, publicRes] = await Promise.all([
    get<Record<string, unknown>[]>("/api/team"),
    get<{ key: string; value: unknown }[]>("/api/settings/public"),
  ]);
  const mapped = (teamRes.data || []).map(mapMember);
  const orderRow = (publicRes.data || []).find((row) => row.key === "team_order");
  if (orderRow?.value) {
    const order = (typeof orderRow.value === "string"
      ? JSON.parse(orderRow.value)
      : orderRow.value) as number[];
    mapped.sort((a, b) => {
      const ai = order.indexOf(a.team_member_id);
      const bi = order.indexOf(b.team_member_id);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }
  return mapped;
}

export function useAdminTeam() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: members = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchTeam,
    staleTime: 2 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (input: TeamMemberInput) => {
      const res = await post<Record<string, unknown>>("/api/team", toApiPayload(input));
      if (res.error) throw new Error(res.error);
      return mapMember(res.data!);
    },
    onSuccess: (created) => {
      queryClient.setQueryData<TeamMember[]>(QUERY_KEY, (old = []) => [...old, created]);
      toast({ title: "Created", description: `${created.name} added to team` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: number; input: TeamMemberInput }) => {
      const res = await patch<Record<string, unknown>>(`/api/team/${id}`, toApiPayload(input));
      if (res.error) throw new Error(res.error);
      return mapMember(res.data!);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<TeamMember[]>(QUERY_KEY, (old = []) =>
        old.map((m) => (m.team_member_id === updated.team_member_id ? updated : m)),
      );
      toast({ title: "Updated", description: `${updated.name} updated` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedMembers: TeamMember[]) => {
      const order = orderedMembers.map((m) => m.team_member_id);
      const res = await post("/api/team/reorder", { order });
      if (res.error) throw new Error(res.error);
    },
    onMutate: async (orderedMembers) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const prev = queryClient.getQueryData<TeamMember[]>(QUERY_KEY);
      queryClient.setQueryData<TeamMember[]>(QUERY_KEY, orderedMembers);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEY, ctx.prev);
      toast({ title: "Error", description: "Failed to save order", variant: "destructive" });
    },
    onSuccess: () => toast({ title: "Order saved" }),
  });

  const activeMembers = members.filter((m) => m.is_active);

  return {
    members,
    activeMembers,
    isLoading,
    createMember: createMutation.mutateAsync,
    updateMember: (id: number, input: TeamMemberInput) =>
      updateMutation.mutateAsync({ id, input }),
    reorderMembers: reorderMutation.mutate,
    isSaving: createMutation.isPending || updateMutation.isPending,
  };
}
