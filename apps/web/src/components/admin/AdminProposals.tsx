import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Inbox, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLeads } from "@/hooks/useLeads";
import { get, patch, post } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  filterProposal,
  isProposalStatus,
  proposalStageLabel,
  type ProposalStatus,
} from "@/lib/proposal-tracker";

const stageDot: Record<ProposalStatus, string> = {
  sent: "bg-orange-500",
  opened: "bg-blue-500",
  replied: "bg-purple-500",
  signed: "bg-green-500",
};

type ProposalRow = {
  proposalId: number;
  leadId: number;
  title: string;
  status: string;
  valueCents: number;
  method: string;
  createdAt: string;
  leadName: string;
  leadEmail: string;
  leadCompany: string | null;
  bodyHtml?: string;
};

function mapProposal(raw: Record<string, unknown>): ProposalRow {
  return {
    proposalId: Number(raw.proposalId ?? raw.proposal_id),
    leadId: Number(raw.leadId ?? raw.lead_id),
    title: String(raw.title ?? ""),
    status: String(raw.status ?? "sent"),
    valueCents: Number(raw.valueCents ?? raw.value_cents ?? 0),
    method: String(raw.method ?? "template"),
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
    leadName: String(raw.leadName ?? raw.lead_name ?? ""),
    leadEmail: String(raw.leadEmail ?? raw.lead_email ?? ""),
    leadCompany: (raw.leadCompany ?? raw.lead_company ?? null) as string | null,
    bodyHtml: (raw.bodyHtml ?? raw.body_html) as string | undefined,
  };
}

const peso = (cents: number) =>
  `₱${(cents / 100).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;

const shortDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";

const AdminProposals = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { leads } = useLeads();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [generateLeadId, setGenerateLeadId] = useState<string>("");
  const [preview, setPreview] = useState<ProposalRow | null>(null);

  const { data: proposal = [], isLoading } = useQuery({
    queryKey: ["proposal"],
    queryFn: async () => {
      const res = await get<Record<string, unknown>[]>("/api/proposal");
      if (res.error) throw new Error(res.error);
      return (res.data || []).map(mapProposal);
    },
    staleTime: 2 * 60 * 1000,
  });

  const generateMutation = useMutation({
    mutationFn: async (leadId: number) => {
      const res = await post<Record<string, unknown>>("/api/proposal", { leadId });
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["proposal"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      const method = String((data as Record<string, unknown>)?.method ?? "template");
      toast({
        title: "Proposal generated",
        description:
          method === "ai"
            ? "Claude wrote the body copy from this lead's scraped signals. CONTRACTS.md clauses appended verbatim — review before sending."
            : "Template filled from CONTRACTS.md + lead fields (no ANTHROPIC_API_KEY set).",
      });
      setGenerateLeadId("");
    },
    onError: (err: Error) => {
      toast({ title: "Generate failed", description: err.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ proposalId, status }: { proposalId: number; status: ProposalStatus }) => {
      const res = await patch(`/api/proposal/${proposalId}`, { status });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposal"] });
      toast({ title: "Status updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const pipeline = useMemo(() => filterProposal(proposal), [proposal]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const byStatus = filterProposal(
      pipeline,
      filterStatus === "all" ? "all" : (filterStatus as ProposalStatus),
    );
    if (!q) return byStatus;
    return byStatus.filter((item) => {
      const hay = `${item.title} ${item.leadName} ${item.leadEmail} ${item.leadCompany ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [pipeline, searchQuery, filterStatus]);

  const sentCount = pipeline.filter((item) => item.status === "sent").length;
  const openedCount = pipeline.filter((item) => item.status === "opened").length;
  const repliedCount = pipeline.filter((item) => item.status === "replied").length;
  const signedCount = pipeline.filter((item) => item.status === "signed").length;

  const openPreview = async (item: ProposalRow) => {
    const res = await get<Record<string, unknown>>(`/api/proposal/${item.proposalId}`);
    if (res.error || !res.data) {
      toast({ title: "Could not load proposal", description: res.error ?? "Missing body", variant: "destructive" });
      return;
    }
    setPreview(mapProposal(res.data as Record<string, unknown>));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-40 bg-secondary animate-pulse rounded" />
        <div className="h-72 bg-secondary animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">Proposals</h1>
          <span className="text-xs text-muted-foreground truncate">
            {pipeline.length} total · {sentCount} sent · {openedCount} opened · {repliedCount} replied · {signedCount} signed
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={generateLeadId} onValueChange={setGenerateLeadId}>
          <SelectTrigger className="w-[240px] h-9">
            <SelectValue placeholder="Generate from lead…" />
          </SelectTrigger>
          <SelectContent>
            {leads.map((item) => (
              <SelectItem key={item.lead_id} value={String(item.lead_id)}>
                {item.company || item.name} · {item.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-9"
          disabled={!generateLeadId || generateMutation.isPending}
          onClick={() => generateMutation.mutate(Number(generateLeadId))}
        >
          Generate
        </Button>

        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search proposals…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="All stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {(Object.keys(stageDot) as ProposalStatus[]).map((key) => (
              <SelectItem key={key} value={key}>
                {proposalStageLabel(key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-border rounded-lg bg-card px-4 py-12 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {searchQuery || filterStatus !== "all"
              ? "No proposals match your filters"
              : "No proposals yet"}
          </p>
          {!searchQuery && filterStatus === "all" && (
            <p className="text-xs text-muted-foreground mt-1.5">
              Generate a template-fill from a lead. Statuses: sent / opened / replied / signed.
            </p>
          )}
        </div>
      ) : (
        <div className="border border-border rounded-lg bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-3 h-9 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
            <span className="flex-1 min-w-0">Company</span>
            <span className="w-44 shrink-0 hidden sm:block">Email</span>
            <span className="w-28 shrink-0">Status</span>
            <span className="w-16 shrink-0 hidden lg:block">Copy</span>
            <span className="w-20 shrink-0 hidden md:block text-right">Value</span>
            <span className="w-16 shrink-0 text-right">Created</span>
            <span className="w-8 shrink-0" />
          </div>
          <div className="divide-y divide-border">
            {filtered.map((item) => {
              const stage: ProposalStatus = isProposalStatus(item.status) ? item.status : "sent";
              return (
                <div
                  key={item.proposalId}
                  className="flex items-center gap-3 px-3 h-11 text-sm hover:bg-secondary/40 transition-colors"
                >
                  <span className="flex-1 min-w-0 font-medium truncate">
                    {item.leadCompany || item.leadName || item.title}
                  </span>
                  <span className="w-44 shrink-0 hidden sm:block text-xs text-muted-foreground truncate">
                    {item.leadEmail}
                  </span>
                  <span className="w-28 shrink-0 inline-flex items-center gap-1.5 min-w-0">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${stageDot[stage]}`} />
                    <Select
                      value={stage}
                      onValueChange={(val) =>
                        statusMutation.mutate({
                          proposalId: item.proposalId,
                          status: val as ProposalStatus,
                        })
                      }
                    >
                      <SelectTrigger className="h-7 border-0 bg-transparent shadow-none px-0 text-xs text-muted-foreground hover:text-foreground focus:ring-0">
                        <SelectValue>{proposalStageLabel(stage)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(stageDot) as ProposalStatus[]).map((key) => (
                          <SelectItem key={key} value={key}>
                            {proposalStageLabel(key)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </span>
                  <span className="w-16 shrink-0 hidden lg:block">
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                        item.method === "ai"
                          ? "bg-accent/15 text-accent-ink"
                          : "bg-secondary text-muted-foreground"
                      }`}
                      title={
                        item.method === "ai"
                          ? "Body copy written by Claude from this lead's scraped signals"
                          : "Template fill from CONTRACTS.md + lead fields"
                      }
                    >
                      {item.method === "ai" ? "AI" : "Tmpl"}
                    </span>
                  </span>
                  <span className="w-20 shrink-0 hidden md:block text-right text-xs text-muted-foreground">
                    {peso(item.valueCents)}
                  </span>
                  <span className="w-16 shrink-0 text-right text-[11px] text-muted-foreground">
                    {shortDate(item.createdAt)}
                  </span>
                  <button
                    className="w-8 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="View proposal"
                    onClick={() => void openPreview(item)}
                  >
                    <FileText className="h-4 w-4 mx-auto" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={preview != null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.title ?? "Proposal"}</DialogTitle>
          </DialogHeader>
          {preview?.bodyHtml ? (
            <iframe title="Proposal" className="flex-1 w-full rounded border border-border bg-white" srcDoc={preview.bodyHtml} />
          ) : (
            <p className="text-sm text-muted-foreground">No document body.</p>
          )}
          {preview?.bodyHtml && (
            <button
              type="button"
              className="text-xs text-accent-ink underline self-start"
              onClick={() => {
                const popup = window.open("", "_blank");
                if (popup) {
                  popup.document.write(preview.bodyHtml ?? "");
                  popup.document.close();
                }
              }}
            >
              Open printable / PDF
            </button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminProposals;
