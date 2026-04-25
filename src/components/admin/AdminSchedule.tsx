import { useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Clock, CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAdminTeam } from "@/hooks/useAdminTeam";
import {
  useAdminDeliverables,
  type DeliverableStatus,
} from "@/hooks/useAdminDeliverables";

const statusConfig: Record<DeliverableStatus, { label: string; color: string; icon: React.ElementType }> = {
  not_started: { label: "Not Started", color: "bg-secondary text-muted-foreground", icon: Circle },
  in_progress: { label: "In Progress", color: "bg-blue-500/10 text-blue-500", icon: Clock },
  review: { label: "In Review", color: "bg-purple-500/10 text-purple-500", icon: AlertCircle },
  completed: { label: "Completed", color: "bg-green-500/10 text-green-500", icon: CheckCircle2 },
  blocked: { label: "Blocked", color: "bg-red-500/10 text-red-500", icon: AlertCircle },
};

const AdminSchedule = () => {
  const { members: teamMembers, isLoading: teamLoading } = useAdminTeam();
  const { deliverables, isLoading: deliverablesLoading } = useAdminDeliverables();
  const isLoading = teamLoading || deliverablesLoading;
  const [selectedMember, setSelectedMember] = useState<number | null>(null);

  const filteredDeliverables = selectedMember
    ? deliverables.filter(d => d.assigned_to === selectedMember)
    : deliverables;

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold mb-2">Schedule & Deliverables</h1>
        <p className="text-muted-foreground">Track team assignments and deadlines</p>
      </div>

      {/* Team Member Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedMember(null)}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
            selectedMember === null
              ? "bg-accent text-white"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          All Members
        </button>
        {teamMembers.map((member) => (
          <button
            key={member.team_member_id}
            onClick={() => setSelectedMember(member.team_member_id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              selectedMember === member.team_member_id
                ? "bg-accent text-white"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <Avatar className="h-5 w-5">
              <AvatarImage src={member.avatar_url} />
              <AvatarFallback className="text-xs">{getInitials(member.name)}</AvatarFallback>
            </Avatar>
            {member.name.split(" ")[0]}
          </button>
        ))}
      </div>

      {/* Deliverables Grid */}
      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-secondary animate-pulse rounded-xl" />
          ))}
        </div>
      ) : filteredDeliverables.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No deliverables found</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredDeliverables.map((deliverable, index) => {
            const status = statusConfig[deliverable.status];
            const StatusIcon = status.icon;
            const isPastDue = deliverable.due_date && new Date(deliverable.due_date) < new Date() && deliverable.status !== "completed";
            
            return (
              <motion.div
                key={deliverable.deliverable_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className={`p-5 bg-card border rounded-xl shadow-card transition-colors ${
                  isPastDue ? "border-red-500/50" : "border-border hover:border-accent/30"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold">{deliverable.title}</h3>
                      <Badge className={`${status.color} gap-1`}>
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </Badge>
                      {isPastDue && (
                        <Badge variant="destructive" className="text-xs">
                          Overdue
                        </Badge>
                      )}
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-3">
                      {deliverable.project?.title || "No project"}
                    </p>
                    
                    <div className="flex items-center gap-4 text-sm">
                      {deliverable.assignee && (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={deliverable.assignee.avatar_url} />
                            <AvatarFallback className="text-xs">
                              {getInitials(deliverable.assignee.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-muted-foreground">
                            {deliverable.assignee.name}
                          </span>
                        </div>
                      )}
                      
                      {deliverable.due_date && (
                        <div className={`flex items-center gap-1 ${isPastDue ? "text-red-500" : "text-muted-foreground"}`}>
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(deliverable.due_date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {[1, 2, 3].map((p) => (
                      <div
                        key={p}
                        className={`w-1.5 h-4 rounded-full ${
                          p <= deliverable.priority ? "bg-accent" : "bg-secondary"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminSchedule;
