import { useState } from "react";
import {
  Inbox,
  Trash2,
  Search,
  ArrowRightLeft,
  CheckSquare,
  Square,
  Loader2,
  ChevronDown,
  ChevronUp,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { formatDistanceToNow } from "date-fns";
import { useLeads, type LeadStatus } from "@/hooks/useLeads";
import { post, patch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  isOutreachTarget,
  leadTextForSignal,
  outreachPriority,
  signalFromLeadText,
} from "@/lib/targeting";

const statusConfig: Record<LeadStatus, { label: string; dot: string; text: string }> = {
  new: { label: "New", dot: "bg-blue-500", text: "text-blue-400" },
  contacted: { label: "Contacted", dot: "bg-yellow-500", text: "text-yellow-400" },
  qualified: { label: "Qualified", dot: "bg-purple-500", text: "text-purple-400" },
  proposal_sent: { label: "Proposal sent", dot: "bg-orange-500", text: "text-orange-400" },
  closed_won: { label: "Closed won", dot: "bg-green-500", text: "text-green-400" },
  closed_lost: { label: "Closed lost", dot: "bg-red-500", text: "text-red-400" },
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const AdminLeads = () => {
  const { leads, teamMembers, isLoading, updateStatus, updateNotes, assignTo, deleteLead } = useLeads();
  const { toast } = useToast();

  const [expandedLead, setExpandedLead] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  /** Prefer zero/outdated systems only (keyword heuristic on lead text). */
  const [outdatedOnly, setOutdatedOnly] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<Set<number>>(new Set());
  const [isConverting, setIsConverting] = useState<number | null>(null);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const filtered = leads.filter((l) => {
    const matchesSearch =
      !searchQuery ||
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.company || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || l.status === filterStatus;
    if (!matchesSearch || !matchesStatus) return false;
    if (outdatedOnly) {
      const signal = signalFromLeadText(leadTextForSignal(l));
      return isOutreachTarget(signal);
    }
    return true;
  });

  const newLeads = leads.filter((l) => l.status === "new").length;
  const qualifiedLeads = leads.filter((l) => l.status === "qualified").length;
  const now = new Date();
  const closedWonThisMonth = leads.filter(
    (l) =>
      l.status === "closed_won" &&
      new Date(l.submitted_at).getMonth() === now.getMonth() &&
      new Date(l.submitted_at).getFullYear() === now.getFullYear(),
  ).length;

  const toggleSelect = (id: number) => {
    const next = new Set(selectedLeads);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedLeads(next);
  };

  const selectAll = () => {
    if (selectedLeads.size === filtered.length) setSelectedLeads(new Set());
    else setSelectedLeads(new Set(filtered.map((l) => l.lead_id)));
  };

  const handleBulkAction = async (action: string, value?: string | number | null) => {
    if (selectedLeads.size === 0) return;
    setIsBulkUpdating(true);
    const leadIds = Array.from(selectedLeads);
    const body: Record<string, unknown> = { leadIds };
    if (action === "status" && value) body.status = value;
    if (action === "assign") body.assignedTo = value ?? null;

    try {
      const res = await patch("/api/leads/bulk", body);
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
      } else {
        toast({ title: `Updated ${leadIds.length} leads` });
        setSelectedLeads(new Set());
        leadIds.forEach((id) => {
          if (action === "status" && value) updateStatus(id, value as string);
          if (action === "assign") assignTo(id, value as number | null);
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unable to update leads",
        variant: "destructive",
      });
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleConvert = async (leadId: number) => {
    setIsConverting(leadId);
    try {
      const res = await post(`/api/leads/${leadId}/convert`, {});
      if (res.error) {
        toast({ title: "Conversion failed", description: res.error, variant: "destructive" });
      } else {
        toast({
          title: "Lead converted",
          description: "Client account and project created. Welcome email sent.",
        });
      }
    } catch (err) {
      toast({
        title: "Conversion failed",
        description: err instanceof Error ? err.message : "Unable to convert lead",
        variant: "destructive",
      });
    } finally {
      setIsConverting(null);
    }
  };

  const handleNotesBlur = (leadId: number) => {
    const draft = notesDraft[leadId];
    if (draft !== undefined) {
      updateNotes(leadId, draft);
      setNotesDraft((prev) => {
        const next = { ...prev };
        delete next[leadId];
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-40 bg-secondary animate-pulse rounded" />
        <div className="h-72 bg-secondary animate-pulse rounded-lg" />
      </div>
    );
  }

  const allSelected = filtered.length > 0 && selectedLeads.size === filtered.length;

  return (
    <div className="space-y-4">
      {/* Title + inline counts (no stat cards) */}
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">Leads</h1>
          <span className="text-xs text-muted-foreground truncate">
            {leads.length} total · {newLeads} new · {qualifiedLeads} qualified · {closedWonThisMonth} won this month
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search leads…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(statusConfig).map(([key, val]) => (
              <SelectItem key={key} value={key}>
                {val.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Toggle
          pressed={outdatedOnly}
          onPressedChange={setOutdatedOnly}
          size="sm"
          variant="outline"
          className="h-9 gap-1.5 px-3 text-xs data-[state=on]:bg-accent/15 data-[state=on]:text-accent data-[state=on]:border-accent/40"
          aria-label="Outdated only"
          title="Target: outdated systems only (no Shopify/Inventi/Squarespace, prefer zero/legacy)"
        >
          <Target className="h-3.5 w-3.5" />
          Outdated only
        </Toggle>

        {selectedLeads.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{selectedLeads.size} selected</span>
            <Select onValueChange={(val) => handleBulkAction("status", val)}>
              <SelectTrigger className="w-[130px] h-9" disabled={isBulkUpdating}>
                <SelectValue placeholder="Set status…" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusConfig).map(([key, val]) => (
                  <SelectItem key={key} value={key}>
                    {val.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              onValueChange={(val) =>
                handleBulkAction("assign", val === "unassigned" ? null : parseInt(val, 10))
              }
            >
              <SelectTrigger className="w-[130px] h-9" disabled={isBulkUpdating}>
                <SelectValue placeholder="Assign to…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {teamMembers.map((m) => (
                  <SelectItem key={m.team_member_id} value={String(m.team_member_id)}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="border border-border rounded-lg bg-card px-4 py-12 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {searchQuery || filterStatus !== "all" || outdatedOnly
              ? "No leads match your filters"
              : "No leads yet"}
          </p>
          {!searchQuery && filterStatus === "all" && !outdatedOnly && (
            <p className="text-xs text-muted-foreground mt-1.5">
              Inquiries from{" "}
              <a
                href="https://advo.ph/start"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
              >
                advo.ph/start
              </a>{" "}
              land here.
            </p>
          )}
        </div>
      ) : (
        <div className="border border-border rounded-lg bg-card overflow-hidden">
          {/* Header row */}
          <div className="flex items-center gap-3 px-3 h-9 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground/70">
            <button onClick={selectAll} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Select all">
              {allSelected ? <CheckSquare className="h-4 w-4 text-accent" /> : <Square className="h-4 w-4" />}
            </button>
            <span className="flex-1 min-w-0">Name</span>
            <span className="hidden lg:block w-28 shrink-0">Type</span>
            <span className="w-28 shrink-0">Status</span>
            <span className="hidden lg:block w-20 shrink-0">Owner</span>
            <span className="w-14 shrink-0 text-right">Date</span>
            <span className="w-4 shrink-0" />
          </div>

          {/* Rows */}
          <div className="divide-y divide-border">
            {filtered.map((lead) => {
              const isExpanded = expandedLead === lead.lead_id;
              const cfg = statusConfig[lead.status];
              const assignedMember = teamMembers.find((m) => m.team_member_id === lead.assigned_to);
              const isSelected = selectedLeads.has(lead.lead_id);
              const targetingSignal = signalFromLeadText(leadTextForSignal(lead));
              const priority = outreachPriority(targetingSignal);
              const hasTargetingSignal =
                targetingSignal.hasModernStack === true ||
                targetingSignal.hasWebsite === false ||
                typeof targetingSignal.digitalScore === "number" ||
                typeof targetingSignal.systemAgeYears === "number";
              const showOutdatedBadge =
                hasTargetingSignal && isOutreachTarget(targetingSignal);
              const showModernBadge = targetingSignal.hasModernStack === true;

              return (
                <div key={lead.lead_id} className={isSelected ? "bg-accent/[0.06]" : ""}>
                  <div className="flex items-center gap-3 px-3 h-11 text-sm hover:bg-secondary/40 transition-colors">
                    <button
                      onClick={() => toggleSelect(lead.lead_id)}
                      className="shrink-0"
                      aria-label="Select lead"
                    >
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-accent" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>

                    <button
                      onClick={() => setExpandedLead(isExpanded ? null : lead.lead_id)}
                      className="flex-1 min-w-0 flex items-center gap-2 text-left"
                    >
                      <span className="font-medium truncate">{lead.name}</span>
                      {lead.company && (
                        <span className="text-muted-foreground truncate hidden sm:inline">· {lead.company}</span>
                      )}
                      {showOutdatedBadge && (
                        <span
                          className="hidden sm:inline-flex items-center gap-1 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-accent/15 text-accent border border-accent/30"
                          title={`Outreach priority ${priority} — zero/outdated systems`}
                        >
                          <Target className="h-2.5 w-2.5" />
                          Target
                        </span>
                      )}
                      {showModernBadge && (
                        <span
                          className="hidden sm:inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-border"
                          title="Modern stack detected — skip greenfield outreach"
                        >
                          Modern
                        </span>
                      )}
                    </button>

                    <span className="hidden lg:block w-28 shrink-0 text-xs text-muted-foreground truncate">
                      {lead.project_type || "—"}
                    </span>

                    <span className="w-28 shrink-0 inline-flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                      <span className="text-xs text-muted-foreground truncate">{cfg.label}</span>
                    </span>

                    <span className="hidden lg:block w-20 shrink-0 text-xs text-muted-foreground truncate">
                      {assignedMember ? assignedMember.name.split(" ")[0] : "—"}
                    </span>

                    <span className="w-14 shrink-0 text-right text-[11px] text-muted-foreground">
                      {shortDate(lead.submitted_at)}
                    </span>

                    <button
                      onClick={() => setExpandedLead(isExpanded ? null : lead.lead_id)}
                      className="w-4 shrink-0 text-muted-foreground"
                      aria-label="Expand"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-4 pt-1 bg-secondary/20 border-t border-border space-y-4">
                      <div className="flex flex-wrap gap-x-6 gap-y-1 pt-3 text-xs text-muted-foreground">
                        <span>{lead.email}</span>
                        {lead.budget && <span>Budget: {lead.budget}</span>}
                        <span>Received {formatDistanceToNow(new Date(lead.submitted_at), { addSuffix: true })}</span>
                      </div>

                      {lead.description && <p className="text-sm">{lead.description}</p>}

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                          <span className="eyebrow block mb-1">Status</span>
                          <Select
                            value={lead.status}
                            onValueChange={(val) => updateStatus(lead.lead_id, val as LeadStatus)}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(statusConfig).map(([key, val]) => (
                                <SelectItem key={key} value={key}>
                                  {val.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <span className="eyebrow block mb-1">Assigned to</span>
                          <Select
                            value={lead.assigned_to ? String(lead.assigned_to) : "unassigned"}
                            onValueChange={(val) =>
                              assignTo(lead.lead_id, val === "unassigned" ? null : parseInt(val, 10))
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Unassigned" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {teamMembers.map((m) => (
                                <SelectItem key={m.team_member_id} value={String(m.team_member_id)}>
                                  {m.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 text-accent hover:bg-accent/10 gap-1.5"
                            disabled={isConverting === lead.lead_id || lead.status === "closed_won"}
                            onClick={() => handleConvert(lead.lead_id)}
                          >
                            {isConverting === lead.lead_id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            )}
                            Convert to client
                          </Button>
                        </div>
                        <div className="flex items-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 text-destructive hover:bg-destructive/10"
                            onClick={() => deleteLead(lead.lead_id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                          </Button>
                        </div>
                      </div>

                      <div>
                        <span className="eyebrow block mb-1">Notes</span>
                        <Textarea
                          placeholder="Add internal notes about this lead…"
                          value={notesDraft[lead.lead_id] ?? lead.notes ?? ""}
                          onChange={(e) =>
                            setNotesDraft((prev) => ({ ...prev, [lead.lead_id]: e.target.value }))
                          }
                          onBlur={() => handleNotesBlur(lead.lead_id)}
                          className="min-h-[72px] text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLeads;
