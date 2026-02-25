import { motion } from "framer-motion";
import { X, Clock, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import * as db from "@/lib/db";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import type { Lead } from "@/types/admin";

interface AdminLeadsProps {
  leads: Lead[];
  isLoading: boolean;
  onRefresh: () => Promise<void>;
}

const AdminLeads = ({ leads, isLoading, onRefresh }: AdminLeadsProps) => {
  const { toast } = useToast();

  const clearLead = async (lead: Lead) => {
    if (!lead.lead_id) return;

    const { error } = await db.deleteLead(lead.lead_id);

    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
    } else {
      toast({ title: "Lead removed" });
      onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Leads</h1>
        <p className="text-muted-foreground">Project inquiries from the website</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-secondary animate-pulse rounded-xl" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <Inbox className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No leads yet</p>
          <p className="text-sm text-muted-foreground mt-2">
            Leads will appear here when clients submit the Start a Project form
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {leads.map((lead, index) => (
            <motion.div
              key={lead.lead_id || index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 bg-card border border-border rounded-xl shadow-card"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold">{lead.name}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {lead.project_type || "Not specified"}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {lead.budget || "Budget TBD"}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                    <span>{lead.email}</span>
                    {lead.company && <span>• {lead.company}</span>}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(lead.submitted_at), { addSuffix: true })}
                    </span>
                  </div>

                  <p className="text-sm line-clamp-2">{lead.description}</p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => clearLead(lead)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminLeads;
