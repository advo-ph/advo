import { useState } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  Send,
  ChevronDown,
  ChevronUp,
  Users,
  Loader2,
  Mail,
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
import {
  useAdminNotifications,
  type NotificationType,
} from "@/hooks/useNotifications";
import { useSiteContent } from "@/hooks/useSiteContent";

/* ─── Type badge config ───────────────────────────────────── */

const typeBadge: Record<NotificationType, { label: string; cls: string }> = {
  progress_update: { label: "Progress", cls: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
  invoice_issued: { label: "Invoice", cls: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30" },
  deliverable_completed: { label: "Deliverable", cls: "bg-green-500/10 text-green-500 border-green-500/30" },
  project_status_change: { label: "Status", cls: "bg-purple-500/10 text-purple-500 border-purple-500/30" },
  custom: { label: "Custom", cls: "bg-gray-500/10 text-gray-500 border-gray-500/30" },
};

/* ─── Component ───────────────────────────────────────────── */

const AdminNotifications = () => {
  const {
    notifications,
    clients,
    isLoading,
    sendNotification,
    sendToAll,
    isSending,
  } = useAdminNotifications();

  const { getSection, updateContent } = useSiteContent();

  // Compose form state
  const [composeOpen, setComposeOpen] = useState(false);
  const [targetClient, setTargetClient] = useState<string>("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  // Expanded client groups
  const [expandedClient, setExpandedClient] = useState<number | null>(null);

  // Auto-notification config (from site_content client_dashboard section)
  const dashboardSection = getSection("client_dashboard");
  const dashboardConfig = (dashboardSection?.content as Record<string, unknown>) ?? {};
  const toggles = {
    notify_on_progress_update: (dashboardConfig.notify_on_progress_update as boolean) ?? true,
    notify_on_invoice: (dashboardConfig.notify_on_invoice as boolean) ?? true,
    notify_on_deliverable_complete: (dashboardConfig.notify_on_deliverable_complete as boolean) ?? true,
  };

  const handleToggle = (key: string, current: boolean) => {
    const updated = { ...dashboardConfig, [key]: !current };
    updateContent("client_dashboard", updated);
  };

  const handleSend = () => {
    if (!title.trim() || !body.trim()) return;

    if (targetClient === "all") {
      sendToAll({ title, body });
    } else {
      sendNotification({
        client_id: parseInt(targetClient, 10),
        title,
        body,
        type: "custom",
      });
    }
    setTitle("");
    setBody("");
    setComposeOpen(false);
  };

  // Group notifications by client
  const grouped = new Map<number, typeof notifications>();
  for (const n of notifications) {
    const existing = grouped.get(n.client_id) || [];
    existing.push(n);
    grouped.set(n.client_id, existing);
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-secondary animate-pulse rounded" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-secondary animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-2">Notifications</h1>
          <p className="text-muted-foreground">
            Manage client notifications and auto-alerts
          </p>
        </div>
        <Button
          onClick={() => setComposeOpen(!composeOpen)}
          className="gradient-accent text-white border-0"
        >
          <Mail className="h-4 w-4 mr-2" />
          Compose
        </Button>
      </div>

      {/* Auto-Notification Toggles */}
      <div className="p-5 bg-card border border-border rounded-xl shadow-card">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Auto-Notification Rules
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { key: "notify_on_progress_update", label: "On Progress Update" },
            { key: "notify_on_invoice", label: "On Invoice Issued" },
            { key: "notify_on_deliverable_complete", label: "On Deliverable Completed" },
          ].map(({ key, label }) => {
            const isOn = toggles[key as keyof typeof toggles];
            return (
              <button
                key={key}
                onClick={() => handleToggle(key, isOn)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  isOn
                    ? "border-accent/50 bg-accent/5"
                    : "border-border bg-secondary/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{label}</span>
                  <div
                    className={`w-8 h-5 rounded-full transition-colors relative ${
                      isOn ? "bg-accent" : "bg-muted"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        isOn ? "translate-x-3.5" : "translate-x-0.5"
                      }`}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Compose Form */}
      {composeOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 bg-card border border-accent/30 rounded-xl shadow-card space-y-4"
        >
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Send className="h-4 w-4" />
            Compose Notification
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                Recipient
              </label>
              <Select value={targetClient} onValueChange={setTargetClient}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" /> All Clients
                    </span>
                  </SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.client_id} value={String(c.client_id)}>
                      {c.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                Title
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Notification title..."
                className="h-9"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
              Body
            </label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message..."
              className="min-h-[80px]"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setComposeOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!title.trim() || !body.trim() || isSending}
              className="gradient-accent text-white border-0"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              Send
            </Button>
          </div>
        </motion.div>
      )}

      {/* Sent Notifications (grouped by client) */}
      {notifications.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No notifications sent yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from(grouped.entries()).map(([clientId, notifs]) => {
            const client = clients.find((c) => c.client_id === clientId);
            const isExpanded = expandedClient === clientId;
            const unread = notifs.filter((n) => !n.is_read).length;

            return (
              <div
                key={clientId}
                className="bg-card border border-border rounded-xl shadow-card overflow-hidden"
              >
                <button
                  onClick={() =>
                    setExpandedClient(isExpanded ? null : clientId)
                  }
                  className="w-full p-4 flex items-center justify-between hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-sm">
                      {client?.company_name ?? `Client #${clientId}`}
                    </h3>
                    <Badge variant="outline" className="text-xs">
                      {notifs.length} sent
                    </Badge>
                    {unread > 0 && (
                      <Badge className="text-[10px] bg-accent text-white">
                        {unread} unread
                      </Badge>
                    )}
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
                    {notifs.map((n) => {
                      const cfg = typeBadge[n.type];
                      return (
                        <div
                          key={n.notification_id}
                          className={`p-3 rounded-lg ${
                            n.is_read ? "bg-secondary/20" : "bg-secondary/40"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {n.title}
                              </span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${cfg.cls}`}
                              >
                                {cfg.label}
                              </Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(n.sent_at), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {n.body}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminNotifications;
