import { useState } from "react";
import { motion } from "framer-motion";
import {
  Inbox,
  Clock,
  ChevronDown,
  ChevronUp,
  Trash2,
  UserPlus,
  Sparkles,
  Trophy,
  Search,
  ArrowRightLeft,
  CheckSquare,
  Square,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { formatDistanceToNow } from "date-fns";
import { useLeads, type LeadStatus } from "@/hooks/useLeads";
import { post, patch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const statusConfig: Record<LeadStatus, { label: string; badgeClass: string }> = {
  new: { label: "New", badgeClass: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
  contacted: { label: "Contacted", badgeClass: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30" },
  qualified: { label: "Qualified", badgeClass: "bg-purple-500/10 text-purple-500 border-purple-500/30" },
  proposal_sent: { label: "Proposal Sent", badgeClass: "bg-orange-500/10 text-orange-500 border-orange-500/30" },
  closed_won: { label: "Closed Won", badgeClass: "bg-green-500/10 text-green-500 border-green-500/30" },
  closed_lost: { label: "Closed Lost", badgeClass: "bg-red-500/10 text-red-500 border-red-500/30" },
};

const AdminLeads = () => {
  const { leads, teamMembers, isLoading, updateStatus, updateNotes, assignTo, deleteLead } = useLeads();
  const { toast } = useToast();

  const [expandedLead, setExpandedLead] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedLeads, setSelectedLeads] = useState<Set<number>>(new Set());
  const [isConverting, setIsConverting] = useState<number | null>(null);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Filter leads
  const filtered = leads.filter((l) => {
    const matchesSearch = !searchQuery ||
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.company || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || l.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Stats
  const newLeads = leads.filter((l) => l.status === "new").length;
  const qualifiedLeads = leads.filter((l) => l.status === "qualified").length;
  const now = new Date();
  const closedWonThisMonth = leads.filter(
    (l) => l.status === "closed_won" &&
      new Date(l.submitted_at).getMonth() === now.getMonth() &&
      new Date(l.submitted_at).getFullYear() === now.getFullYear()
  ).length;

  const toggleSelect = (id: number) => {
    const next = new Set(selectedLeads);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedLeads(next);
  };

  const selectAll = () => {
    if (selectedLeads.size === filtered.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(filtered.map((l) => l.lead_id)));
    }
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
        // Force refetch by updating each in the cache
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
        toast({ title: "Lead converted", description: "Client account and project created. Welcome email sent." });
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
      setNotesDraft((prev) => { const next = { ...prev }; delete next[leadId]; return next; });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-secondary animate-pulse rounded" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-secondary animate-pulse rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Leads</h1>
        <p className="text-muted-foreground">Project inquiries and sales pipeline</p>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 bg-card border border-border rounded-xl shadow-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">New Leads</p>
              <p className="text-xl font-bold">{newLeads}</p>
            </div>
          </div>
        </div>
        <div className="p-5 bg-card border border-border rounded-xl shadow-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <UserPlus className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Qualified</p>
              <p className="text-xl font-bold">{qualifiedLeads}</p>
            </div>
          </div>
        </div>
        <div className="p-5 bg-card border border-border rounded-xl shadow-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <Trophy className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Won This Month</p>
              <p className="text-xl font-bold text-green-500">{closedWonThisMonth}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search + Filter + Bulk Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search leads..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(statusConfig).map(([key, val]) => (
              <SelectItem key={key} value={key}>{val.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedLeads.size > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{selectedLeads.size} selected</Badge>
            <Select onValueChange={(val) => handleBulkAction("status", val)}>
              <SelectTrigger className="w-[140px] h-9" disabled={isBulkUpdating}>
                <SelectValue placeholder="Set status..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusConfig).map(([key, val]) => (
                  <SelectItem key={key} value={key}>{val.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select onValueChange={(val) => handleBulkAction("assign", val === "unassigned" ? null : parseInt(val, 10))}>
              <SelectTrigger className="w-[140px] h-9" disabled={isBulkUpdating}>
                <SelectValue placeholder="Assign to..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {teamMembers.map((m) => (
                  <SelectItem key={m.team_member_id} value={String(m.team_member_id)}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Leads List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <Inbox className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">{searchQuery || filterStatus !== "all" ? "No leads match your filters" : "No leads yet"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Select All */}
          <button onClick={selectAll} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground px-1">
            {selectedLeads.size === filtered.length ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            {selectedLeads.size === filtered.length ? "Deselect all" : "Select all"}
          </button>

          {filtered.map((lead, index) => {
            const isExpanded = expandedLead === lead.lead_id;
            const cfg = statusConfig[lead.status];
            const assignedMember = teamMembers.find((m) => m.team_member_id === lead.assigned_to);
            const isSelected = selectedLeads.has(lead.lead_id);

            return (
              <motion.div key={lead.lead_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className={`bg-card border rounded-xl shadow-card overflow-hidden ${isSelected ? "border-accent" : "border-border"}`}>
                <div className="flex items-center">
                  <button onClick={() => toggleSelect(lead.lead_id)} className="p-4 hover:bg-secondary/30">
                    {isSelected ? <CheckSquare className="h-4 w-4 text-accent" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  <button onClick={() => setExpandedLead(isExpanded ? null : lead.lead_id)}
                    className="flex-1 p-4 pl-0 flex items-center justify-between hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-sm truncate">{lead.name}</h3>
                          {lead.company && <span className="text-xs text-muted-foreground">• {lead.company}</span>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{lead.email}</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(lead.submitted_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {lead.project_type && <Badge variant="secondary" className="text-xs hidden md:inline-flex">{lead.project_type}</Badge>}
                      {lead.budget && <Badge variant="outline" className="text-xs hidden md:inline-flex">{lead.budget}</Badge>}
                      <Badge variant="outline" className={`text-[10px] ${cfg.badgeClass}`}>{cfg.label}</Badge>
                      {assignedMember && <span className="text-xs text-muted-foreground hidden lg:inline">→ {assignedMember.name.split(" ")[0]}</span>}
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
                    {lead.description && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-2">Description</span>
                        <p className="text-sm">{lead.description}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Status</span>
                        <Select value={lead.status} onValueChange={(val) => updateStatus(lead.lead_id, val as LeadStatus)}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(statusConfig).map(([key, val]) => (
                              <SelectItem key={key} value={key}>{val.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Assigned To</span>
                        <Select value={lead.assigned_to ? String(lead.assigned_to) : "unassigned"}
                          onValueChange={(val) => assignTo(lead.lead_id, val === "unassigned" ? null : parseInt(val, 10))}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {teamMembers.map((m) => (
                              <SelectItem key={m.team_member_id} value={String(m.team_member_id)}>{m.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-end">
                        <Button variant="outline" size="sm" className="text-accent hover:bg-accent/10 gap-1.5"
                          disabled={isConverting === lead.lead_id || lead.status === "closed_won"}
                          onClick={() => handleConvert(lead.lead_id)}>
                          {isConverting === lead.lead_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
                          Convert to Client
                        </Button>
                      </div>
                      <div className="flex items-end">
                        <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10"
                          onClick={() => deleteLead(lead.lead_id)}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                        </Button>
                      </div>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Notes</span>
                      <Textarea placeholder="Add internal notes about this lead..."
                        value={notesDraft[lead.lead_id] ?? lead.notes ?? ""}
                        onChange={(e) => setNotesDraft((prev) => ({ ...prev, [lead.lead_id]: e.target.value }))}
                        onBlur={() => handleNotesBlur(lead.lead_id)}
                        className="min-h-[80px] text-sm" />
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminLeads;
