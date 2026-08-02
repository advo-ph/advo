import { useMemo, useState } from "react";
import { Inbox, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLeads, type LeadStatus } from "@/hooks/useLeads";
import {
  filterProposalLead,
  isProposalStatus,
  proposalStageLabel,
  type ProposalStatus,
} from "@/lib/proposal-tracker";

const stageDot: Record<ProposalStatus, string> = {
  proposal_sent: "bg-orange-500",
  closed_won: "bg-green-500",
  closed_lost: "bg-red-500",
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * Thin proposal tracker: filters existing leads by proposal-stage status.
 * No separate table / email pipeline — uses lead.status only.
 */
const AdminProposals = () => {
  const { leads, isLoading, updateStatus } = useLeads();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const proposalLead = useMemo(() => filterProposalLead(leads), [leads]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return proposalLead.filter((item) => {
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.email.toLowerCase().includes(q) ||
        (item.company || "").toLowerCase().includes(q);
      const matchesStatus = filterStatus === "all" || item.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [proposalLead, searchQuery, filterStatus]);

  const sentCount = proposalLead.filter((l) => l.status === "proposal_sent").length;
  const wonCount = proposalLead.filter((l) => l.status === "closed_won").length;
  const lostCount = proposalLead.filter((l) => l.status === "closed_lost").length;

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
            {proposalLead.length} total · {sentCount} sent · {wonCount} won · {lostCount} lost
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search proposals…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px] h-9">
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
              Leads marked Proposal sent, Won, or Lost appear here.
            </p>
          )}
        </div>
      ) : (
        <div className="border border-border rounded-lg bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-3 h-9 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground/70">
            <span className="flex-1 min-w-0">Company</span>
            <span className="w-44 shrink-0 hidden sm:block">Email</span>
            <span className="w-28 shrink-0">Status</span>
            <span className="w-16 shrink-0 text-right">Updated</span>
          </div>
          <div className="divide-y divide-border">
            {filtered.map((item) => {
              const stage: ProposalStatus = isProposalStatus(item.status)
                ? item.status
                : "proposal_sent";
              return (
                <div
                  key={item.lead_id}
                  className="flex items-center gap-3 px-3 h-11 text-sm hover:bg-secondary/40 transition-colors"
                >
                  <span className="flex-1 min-w-0 font-medium truncate">
                    {item.company || item.name || "—"}
                  </span>
                  <span className="w-44 shrink-0 hidden sm:block text-xs text-muted-foreground truncate">
                    {item.email}
                  </span>
                  <span className="w-28 shrink-0 inline-flex items-center gap-1.5 min-w-0">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${stageDot[stage]}`} />
                    <Select
                      value={item.status}
                      onValueChange={(val) => updateStatus(item.lead_id, val as LeadStatus)}
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
                  <span className="w-16 shrink-0 text-right text-[11px] text-muted-foreground">
                    {shortDate(item.submitted_at)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminProposals;
