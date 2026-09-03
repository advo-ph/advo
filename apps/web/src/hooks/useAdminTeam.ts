import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export interface TeamMember {
  team_member_id: number;
  name: string;
  role: string;
  email: string | null;
  avatar_url: string | null;
  preview_image_url: string | null;
  bio: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  /** Shown on the public website. Nothing to do with logging in. */
  is_active: boolean;
  /**
   * Whether this person's login is switched on.
   *
   * null means there is no login account at all, which is a different state from false and
   * has to stay distinguishable: false is "switched off", null is "never had one".
   */
  can_login: boolean | null;
  /** The address on the login account, which may differ from the roster email. */
  login_email: string | null;
  /** Role on the login account: admin, team or client. */
  login_role: string | null;
}

function nullableBool(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  return Boolean(value);
}

function mapMember(m: Record<string, unknown>): TeamMember {
  return {
    team_member_id: (m.teamMemberId ?? m.team_member_id) as number,
    name: m.name as string,
    role: m.role as string,
    email: (m.email as string) || null,
    avatar_url: (m.avatarUrl ?? m.avatar_url ?? null) as string | null,
    preview_image_url: (m.previewImageUrl ?? m.preview_image_url ?? null) as string | null,
    bio: (m.bio as string) || null,
    linkedin_url: (m.linkedinUrl ?? m.linkedin_url ?? null) as string | null,
    github_url: (m.githubUrl ?? m.github_url ?? null) as string | null,
    is_active: Boolean(m.isActive ?? m.is_active ?? true),
    can_login: nullableBool(m.canLogin ?? m.can_login),
    login_email: (m.loginEmail ?? m.login_email ?? null) as string | null,
    login_role: (m.loginRole ?? m.login_role ?? null) as string | null,
  };
}

export interface TeamMemberInput {
  name: string;
  role: string;
  email?: string | null;
  avatar_url?: string | null;
  preview_image_url?: string | null;
  bio?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  is_active?: boolean;
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
    ...(input.preview_image_url !== undefined && { previewImageUrl: input.preview_image_url || null }),
    ...(input.bio !== undefined && { bio: input.bio || null }),
    ...(input.linkedin_url !== undefined && { linkedinUrl: input.linkedin_url || null }),
    ...(input.github_url !== undefined && { githubUrl: input.github_url || null }),
    ...(input.is_active !== undefined && { isActive: input.is_active }),
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
      return {
        member: mapMember(res.data!),
        // Present only when this request created a brand new login account.
        defaultPassword: (res.data?.defaultPassword as string) || null,
      };
    },
    onSuccess: ({ member, defaultPassword }) => {
      queryClient.setQueryData<TeamMember[]>(QUERY_KEY, (old = []) => [...old, member]);
      toast({
        title: "Created",
        description: defaultPassword
          ? `${member.name} added. They can log in with the password ${defaultPassword}.`
          : `${member.name} added to team`,
      });
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

  /**
   * Switch one person's login on or off.
   *
   * Separate from updateMember on purpose. This writes a different column on a different
   * table, it ends that person's open sessions when it turns off, and it applies the moment
   * it is clicked rather than waiting for a form save that might be cancelled.
   */
  const loginAccessMutation = useMutation({
    mutationFn: async ({ id, canLogin }: { id: number; canLogin: boolean }) => {
      const res = await patch<Record<string, unknown>>(`/api/team/${id}/login`, { canLogin });
      if (res.error) throw new Error(res.error);
      return {
        team_member_id: id,
        can_login: Boolean(res.data?.canLogin),
        message: (res.data?.message as string) || "",
      };
    },
    onSuccess: (result) => {
      queryClient.setQueryData<TeamMember[]>(QUERY_KEY, (old = []) =>
        old.map((m) =>
          m.team_member_id === result.team_member_id
            ? { ...m, can_login: result.can_login }
            : m,
        ),
      );
      toast({
        title: result.can_login ? "Login turned on" : "Login turned off",
        description: result.message,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const activeMembers = members.filter((m) => m.is_active);

  return {
    members,
    activeMembers,
    isLoading,
    createMember: createMutation.mutateAsync,
    updateMember: (id: number, input: TeamMemberInput) =>
      updateMutation.mutateAsync({ id, input }),
    setLoginAccess: (id: number, canLogin: boolean) =>
      loginAccessMutation.mutateAsync({ id, canLogin }),
    isSettingLoginAccess: loginAccessMutation.isPending,
    reorderMembers: reorderMutation.mutate,
    isSaving: createMutation.isPending || updateMutation.isPending,
  };
}
