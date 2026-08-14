import { useState } from "react";
import {
  Bell,
  Send,
  ChevronDown,
  ChevronUp,
  Users,
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
import {
  useAdminNotifications,
  type NotificationType,
} from "@/hooks/useNotifications";
import { useSiteContent } from "@/hooks/useSiteContent";
import { PageHeader, Panel, Empty, Dot } from "@/components/admin/_ui";

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
        clientId: parseInt(targetClient, 10),
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

  const totalUnread = notifications.filter((n) => !n.is_read).length;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-40 bg-secondary animate-pulse rounded" />
        <div className="h-24 bg-secondary animate-pulse rounded-lg" />
        <div className="h-24 bg-secondary animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        meta={`${notifications.length} sent · ${totalUnread} unread`}
        action={
          <Button
            size="sm"
            onClick={() => setComposeOpen(!composeOpen)}
            className="h-9 bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Send className="h-4 w-4 mr-2" />
            Compose
          </Button>
        }
      />

      {/* Auto-Notification Toggles */}
      <Panel
        title="Auto-notification rules"
        meta="Inactive — not yet applied to event sends"
      >
        <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border">
          Toggles persist, but event triggers (progress / invoice / deliverable) do not read them yet.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
          {[
            { key: "notify_on_progress_update", label: "On progress update" },
            { key: "notify_on_invoice", label: "On invoice issued" },
            { key: "notify_on_deliverable_complete", label: "On deliverable completed" },
          ].map(({ key, label }) => {
            const isOn = toggles[key as keyof typeof toggles];
            return (
              <button
                key={key}
                onClick={() => handleToggle(key, isOn)}
                className="flex items-center justify-between gap-3 px-4 h-11 text-left hover:bg-secondary/40 transition-colors"
              >
                <span className="text-sm">{label}</span>
                <div
                  className={`w-8 h-5 rounded-full transition-colors relative shrink-0 ${
                    isOn ? "bg-accent" : "bg-muted"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      isOn ? "translate-x-3.5" : "translate-x-0.5"
                    }`}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* Compose Form */}
      {composeOpen && (
        <Panel title="Compose notification">
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="eyebrow block mb-1">Recipient</label>
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
                <label className="eyebrow block mb-1">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Notification title..."
                  className="h-9"
                />
              </div>
            </div>

            <div>
              <label className="eyebrow block mb-1">Body</label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your message..."
                className="min-h-[80px] text-sm"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => setComposeOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSend}
                disabled={!title.trim() || !body.trim() || isSending}
                className="h-9 bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Send className="h-4 w-4 mr-1" />
                )}
                Send
              </Button>
            </div>
          </div>
        </Panel>
      )}

      {/* Sent Notifications (grouped by client) */}
      {notifications.length === 0 ? (
        <Panel>
          <Empty text="No notifications sent yet" icon={Bell} />
        </Panel>
      ) : (
        <div className="space-y-3">
          {Array.from(grouped.entries()).map(([clientId, notifs]) => {
            const client = clients.find((c) => c.client_id === clientId);
            const isExpanded = expandedClient === clientId;
            const unread = notifs.filter((n) => !n.is_read).length;

            return (
              <Panel key={clientId}>
                <button
                  onClick={() =>
                    setExpandedClient(isExpanded ? null : clientId)
                  }
                  className="w-full px-4 h-11 flex items-center justify-between gap-3 hover:bg-secondary/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {unread > 0 && <Dot className="bg-accent" />}
                    <h3 className="font-medium text-sm truncate">
                      {client?.company_name ?? `Client #${clientId}`}
                    </h3>
                    <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                      {notifs.length} sent{unread > 0 ? ` · ${unread} unread` : ""}
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>

                {isExpanded && (
                  <div className="divide-y divide-border border-t border-border">
                    {notifs.map((n) => {
                      const cfg = typeBadge[n.type];
                      return (
                        <div
                          key={n.notification_id}
                          className="px-4 py-2.5 flex items-start gap-2.5"
                        >
                          <span className="mt-1.5 shrink-0">
                            {n.is_read ? (
                              <Dot className="bg-muted-foreground/40" />
                            ) : (
                              <Dot className="bg-accent" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-medium truncate">
                                  {n.title}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] shrink-0 ${cfg.cls}`}
                                >
                                  {cfg.label}
                                </Badge>
                              </div>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {formatDistanceToNow(new Date(n.sent_at), {
                                  addSuffix: true,
                                })}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                              {n.body}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminNotifications;
