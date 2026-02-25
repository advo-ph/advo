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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

/* ─── Status Config ───────────────────────────────────────── */

const statusConfig: Record<
  LeadStatus,
  { label: string; badgeClass: string }
> = {
  new: { label: "New", badgeClass: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
  contacted: { label: "Contacted", badgeClass: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30" },
  qualified: { label: "Qualified", badgeClass: "bg-purple-500/10 text-purple-500 border-purple-500/30" },
  proposal_sent: { label: "Proposal Sent", badgeClass: "bg-orange-500/10 text-orange-500 border-orange-500/30" },
  closed_won: { label: "Closed Won", badgeClass: "bg-green-500/10 text-green-500 border-green-500/30" },
  closed_lost: { label: "Closed Lost", badgeClass: "bg-red-500/10 text-red-500 border-red-500/30" },
};

/* ─── Component ───────────────────────────────────────────── */

const AdminLeads = () => {
  const {
    leads,
    teamMembers,
    isLoading,
    updateStatus,
    updateNotes,
    assignTo,
    deleteLead,
  } = useLeads();

  const [expandedLead, setExpandedLead] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});

  // Summary stats
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const newLeads = leads.filter((l) => l.status === "new").length;
  const qualifiedLeads = leads.filter((l) => l.status === "qualified").length;
  const closedWonThisMonth = leads.filter(
    (l) =>
      l.status === "closed_won" &&
      new Date(l.submitted_at).getMonth() === thisMonth &&
      new Date(l.submitted_at).getFullYear() === thisYear
  ).length;

  const handleNotesBlur = (leadId: number) => {
    const draft = notesDraft[leadId];
    if (draft !== undefined) {
      updateNotes({ leadId, notes: draft });
      setNotesDraft((prev) => {
        const next = { ...prev };
        delete next[leadId];
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-secondary animate-pulse rounded" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-secondary animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-secondary animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Leads</h1>
        <p className="text-muted-foreground">
          Project inquiries and sales pipeline
        </p>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 bg-card border border-border rounded-xl shadow-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                New Leads
              </p>
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
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Qualified
              </p>
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
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Won This Month
              </p>
              <p className="text-xl font-bold text-green-500">
                {closedWonThisMonth}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Leads List */}
      {leads.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <Inbox className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No leads yet</p>
          <p className="text-sm text-muted-foreground mt-2">
            Leads will appear here when clients submit the Start a Project form
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map((lead, index) => {
            const isExpanded = expandedLead === lead.lead_id;
            const cfg = statusConfig[lead.status];
            const assignedMember = teamMembers.find(
              (m) => m.team_member_id === lead.assigned_to
            );

            return (
              <motion.div
                key={lead.lead_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="bg-card border border-border rounded-xl shadow-card overflow-hidden"
              >
                {/* Lead Header Row */}
                <button
                  onClick={() =>
                    setExpandedLead(isExpanded ? null : lead.lead_id)
                  }
                  className="w-full p-4 flex items-center justify-between hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-sm truncate">
                          {lead.name}
                        </h3>
                        {lead.company && (
                          <span className="text-xs text-muted-foreground">
                            • {lead.company}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{lead.email}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(lead.submitted_at), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {lead.project_type && (
                      <Badge variant="secondary" className="text-xs hidden md:inline-flex">
                        {lead.project_type}
                      </Badge>
                    )}
                    {lead.budget && (
                      <Badge variant="outline" className="text-xs hidden md:inline-flex">
                        {lead.budget}
                      </Badge>
                    )}
                    <Badge variant="outline" className={`text-[10px] ${cfg.badgeClass}`}>
                      {cfg.label}
                    </Badge>
                    {assignedMember && (
                      <span className="text-xs text-muted-foreground hidden lg:inline">
                        → {assignedMember.name.split(" ")[0]}
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
                    {/* Description */}
                    {lead.description && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-2">
                          Description
                        </span>
                        <p className="text-sm">{lead.description}</p>
                      </div>
                    )}

                    {/* Controls Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Status */}
                      <div>
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                          Status
                        </span>
                        <Select
                          value={lead.status}
                          onValueChange={(val: string) =>
                            updateStatus({
                              leadId: lead.lead_id,
                              status: val as LeadStatus,
                            })
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="contacted">Contacted</SelectItem>
                            <SelectItem value="qualified">Qualified</SelectItem>
                            <SelectItem value="proposal_sent">
                              Proposal Sent
                            </SelectItem>
                            <SelectItem value="closed_won">Closed Won</SelectItem>
                            <SelectItem value="closed_lost">
                              Closed Lost
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Assign To */}
                      <div>
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                          Assigned To
                        </span>
                        <Select
                          value={
                            lead.assigned_to
                              ? String(lead.assigned_to)
                              : "unassigned"
                          }
                          onValueChange={(val: string) =>
                            assignTo({
                              leadId: lead.lead_id,
                              assignedTo:
                                val === "unassigned" ? null : parseInt(val, 10),
                            })
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">
                              Unassigned
                            </SelectItem>
                            {teamMembers.map((m) => (
                              <SelectItem
                                key={m.team_member_id}
                                value={String(m.team_member_id)}
                              >
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Delete */}
                      <div className="flex items-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => deleteLead(lead.lead_id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                        Notes
                      </span>
                      <Textarea
                        placeholder="Add internal notes about this lead..."
                        value={
                          notesDraft[lead.lead_id] ??
                          lead.notes ??
                          ""
                        }
                        onChange={(e) =>
                          setNotesDraft((prev) => ({
                            ...prev,
                            [lead.lead_id]: e.target.value,
                          }))
                        }
                        onBlur={() => handleNotesBlur(lead.lead_id)}
                        className="min-h-[80px] text-sm"
                      />
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
