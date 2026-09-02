import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { get, patch, post } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

/** Rows come back from raw SQL in snake_case, exactly as the tables are named. */
export interface CorpusStat {
  source_count: number;
  fact_count: number;
  verified_fact_count: number;
  open_action_count: number;
  overdue_action_count: number;
  template_count: number;
  term_count: number;
}
export interface CorpusSource {
  corpus_source_id: number;
  kind: string;
  external_id: string;
  url: string | null;
  title: string;
  document_kind: string | null;
  occurred_at: string | null;
  duration_second: number | null;
  summary: string | null;
  project_id: number | null;
  lead_name: string | null;
  fact_count: string | number;
  open_action_count: string | number;
}
export interface CorpusFact {
  corpus_fact_id: number;
  corpus_source_id: number;
  claim: string;
  category: string;
  quote: string | null;
  locator: string | null;
  speaker: string | null;
  basis: string;
  confidence: string | number;
  occurred_at: string | null;
  project_id: number | null;
  is_verified: boolean;
  superseded_by_fact_id: number | null;
  source_kind: string;
  source_title: string;
  source_url: string | null;
}
export interface CorpusAction {
  corpus_action_id: number;
  corpus_source_id: number;
  description: string;
  owner_name: string | null;
  owner_team_member_id: number | null;
  project_id: number | null;
  due_at: string | null;
  locator: string | null;
  basis: string;
  status: "open" | "done" | "dropped";
  resolved_at: string | null;
  resolution_note: string | null;
  source_title: string;
  source_url: string | null;
  source_occurred_at: string | null;
}
export interface CorpusTerm {
  corpus_term_id: number;
  name: string;
  value: string;
  unit: string | null;
  quote: string | null;
  source_title: string;
  occurred_at: string | null;
  project_id: number | null;
}
export interface CorpusTemplate {
  corpusTemplateId: number;
  kind: string;
  name: string;
  body: string;
  placeholder: string[];
  version: number;
  isActive: boolean;
}
export interface CheckMatch {
  corpusFactId: number;
  claim: string;
  quote: string | null;
  locator: string | null;
  basis: string;
  confidence: number;
  isVerified: boolean;
  occurredAt: string | null;
  projectId: number | null;
  rank: number;
  source: { corpusSourceId: number; kind: string; title: string; url: string | null };
  sharesEveryNumber: boolean;
}
export interface CheckResult {
  claim: string;
  numberInClaim: string[];
  verdict: "supported" | "conflicting" | "unknown";
  isContested: boolean;
  match: CheckMatch[];
}

const KEY = ["corpus"];

export function useCorpus(filter: { q?: string; projectId?: number | null; category?: string; status?: string } = {}) {
  const { user } = useAuth();
  const enabled = Boolean(user);
  const qc = useQueryClient();
  const { toast } = useToast();
  const query = (path: string) => async () => {
    const res = await get<unknown>(path);
    if (res.error) throw new Error(res.error);
    return res.data;
  };
  const search = new URLSearchParams();
  if (filter.q) search.set("q", filter.q);
  if (filter.projectId) search.set("projectId", String(filter.projectId));
  if (filter.category) search.set("category", filter.category);
  const factPath = `/api/corpus/fact${search.toString() ? `?${search}` : ""}`;
  const actionSearch = new URLSearchParams();
  if (filter.status) actionSearch.set("status", filter.status);
  if (filter.projectId) actionSearch.set("projectId", String(filter.projectId));
  const actionPath = `/api/corpus/action${actionSearch.toString() ? `?${actionSearch}` : ""}`;

  const stat = useQuery({ queryKey: [...KEY, "stat"], queryFn: query("/api/corpus/stat"), enabled });
  const source = useQuery({ queryKey: [...KEY, "source"], queryFn: query("/api/corpus/source"), enabled });
  const fact = useQuery({ queryKey: [...KEY, "fact", factPath], queryFn: query(factPath), enabled });
  const action = useQuery({ queryKey: [...KEY, "action", actionPath], queryFn: query(actionPath), enabled });
  const term = useQuery({ queryKey: [...KEY, "term"], queryFn: query("/api/corpus/term"), enabled });
  const template = useQuery({ queryKey: [...KEY, "template"], queryFn: query("/api/corpus/template"), enabled });

  const invalidate = () => qc.invalidateQueries({ queryKey: KEY });

  const check = useMutation({
    mutationFn: async (claim: string) => {
      const res = await post<CheckResult>("/api/corpus/check", { claim });
      if (res.error || !res.data) throw new Error(res.error || "Check failed");
      return res.data;
    },
  });
  const verify = useMutation({
    mutationFn: async (input: { corpusFactId: number; isVerified: boolean }) => {
      const res = await patch(`/api/corpus/fact/${input.corpusFactId}/verify`, { isVerified: input.isVerified });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast({ title: "Not saved", description: e.message, variant: "destructive" }),
  });
  const updateAction = useMutation({
    mutationFn: async (input: { corpusActionId: number; status?: "open" | "done" | "dropped"; resolutionNote?: string | null; ownerName?: string | null; dueAt?: string | null }) => {
      const { corpusActionId, ...body } = input;
      const res = await patch(`/api/corpus/action/${corpusActionId}`, body);
      if (res.error) throw new Error(res.error);
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast({ title: "Not saved", description: e.message, variant: "destructive" }),
  });
  const ingestPlaud = useMutation({
    mutationFn: async (input: { shareUrl: string; projectId?: number | null; leadName?: string | null }) => {
      const res = await post<{ factCount: number; actionCount: number; method: string }>("/api/corpus/ingest/plaud", input);
      if (res.error || !res.data) throw new Error(res.error || "Ingest failed");
      return res.data;
    },
    onSuccess: (r) => {
      invalidate();
      toast({ title: "Recording ingested", description: `${r.factCount} facts, ${r.actionCount} actions (${r.method}).` });
    },
    onError: (e: Error) => toast({ title: "Not ingested", description: e.message, variant: "destructive" }),
  });
  const ingestText = useMutation({
    mutationFn: async (input: { title: string; text: string; projectId?: number | null; leadName?: string | null; occurredAt?: string | null }) => {
      const res = await post<{ factCount: number; actionCount: number; method: string }>("/api/corpus/ingest/text", input);
      if (res.error || !res.data) throw new Error(res.error || "Ingest failed");
      return res.data;
    },
    onSuccess: (r) => {
      invalidate();
      toast({ title: "Text ingested", description: `${r.factCount} facts, ${r.actionCount} actions (${r.method}).` });
    },
    onError: (e: Error) => toast({ title: "Not ingested", description: e.message, variant: "destructive" }),
  });
  const render = useMutation({
    mutationFn: async (input: { corpusTemplateId: number; value: Record<string, string> }) => {
      const res = await post<{ text: string; missing: string[] }>(`/api/corpus/template/${input.corpusTemplateId}/render`, { value: input.value });
      if (res.error || !res.data) throw new Error(res.error || "Render failed");
      return res.data;
    },
  });

  return {
    stat: (stat.data as CorpusStat | undefined) ?? null,
    source: (source.data as CorpusSource[] | undefined) ?? [],
    fact: (fact.data as CorpusFact[] | undefined) ?? [],
    action: (action.data as CorpusAction[] | undefined) ?? [],
    term: (term.data as CorpusTerm[] | undefined) ?? [],
    template: (template.data as CorpusTemplate[] | undefined) ?? [],
    isLoading: stat.isLoading || fact.isLoading,
    check: check.mutateAsync,
    checkResult: check.data ?? null,
    isChecking: check.isPending,
    verify: verify.mutate,
    updateAction: updateAction.mutate,
    ingestPlaud: ingestPlaud.mutateAsync,
    isIngesting: ingestPlaud.isPending || ingestText.isPending,
    ingestText: ingestText.mutateAsync,
    render: render.mutateAsync,
    rendered: render.data ?? null,
  };
}
