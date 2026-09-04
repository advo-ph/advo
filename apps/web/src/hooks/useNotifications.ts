import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { errorText } from "@/lib/error-text";
import { useAuth } from "@/hooks/useAuth";

/* ─── Types ──────────────────────────────────────────────── */

export type NotificationType =
  | "progress_update"
  | "invoice_issued"
  | "deliverable_completed"
  | "project_status_change"
  | "custom";

export interface NotificationRow {
  notification_id: number;
  client_id: number;
  project_id: number | null;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  sent_at: string;
  client?: { company_name: string; contact_email: string };
}

interface ClientOption {
  client_id: number;
  company_name: string;
  contact_email: string;
}

/** Shape of POST /api/notifications/broadcast. Counts are per-client, not per-request. */
interface BroadcastResult {
  message: string;
  attemptedCount: number;
  deliveredCount: number;
  failedCount: number;
  emailFailedCount: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapNotification(n: any): NotificationRow {
  return {
    notification_id: n.notificationId ?? n.notification_id,
    client_id: n.clientId ?? n.client_id,
    project_id: n.projectId ?? n.project_id,
    type: n.type,
    title: n.title,
    body: n.body,
    is_read: n.isRead ?? n.is_read ?? false,
    sent_at: n.sentAt ?? n.sent_at,
    client: n.client
      ? {
          company_name: n.client.companyName ?? n.client.company_name,
          contact_email: n.client.contactEmail ?? n.client.contact_email,
        }
      : undefined,
  };
}

/* ─── Admin Notifications ────────────────────────────────── */

interface AdminNotificationsData {
  notifications: NotificationRow[];
  clients: ClientOption[];
}

async function fetchAdminNotifications(): Promise<AdminNotificationsData> {
  const [notifRes, clientsRes] = await Promise.all([
    get<unknown[]>("/api/notifications"),
    get<unknown[]>("/api/clients"),
  ]);

  return {
    notifications: (notifRes.data || []).map(mapNotification),
    clients: (clientsRes.data || []).map((c: Record<string, unknown>) => ({
      client_id: (c.clientId ?? c.client_id) as number,
      company_name: (c.companyName ?? c.company_name) as string,
      contact_email: (c.contactEmail ?? c.contact_email) as string,
    })),
  };
}

export function useAdminNotifications() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ["adminNotifications"];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: fetchAdminNotifications,
    staleTime: 2 * 60 * 1000,
  });

  const sendMutation = useMutation({
    mutationFn: async (payload: {
      clientId: number;
      projectId?: number | null;
      title: string;
      body: string;
      type?: string;
    }) => {
      const res = await post("/api/notifications", {
        clientId: payload.clientId,
        projectId: payload.projectId,
        title: payload.title,
        body: payload.body,
        type: payload.type || "custom",
        sendEmail: true,
      });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Notification sent" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send notification", variant: "destructive" });
    },
  });

  const sendToAllMutation = useMutation({
    mutationFn: async (payload: { title: string; body: string }) => {
      const res = await post<BroadcastResult>("/api/notifications/broadcast", {
        title: payload.title,
        body: payload.body,
        sendEmail: true,
      });
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    // A broadcast is N independent writes and some of them can fail while the
    // request as a whole succeeds. Reporting that as a flat "sent to all
    // clients" is the lie this is here to stop.
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey });
      const failed = result?.failedCount ?? 0;
      const emailFailed = result?.emailFailedCount ?? 0;

      if (failed > 0) {
        toast({
          title: "Broadcast only partly sent",
          description: `${result?.deliveredCount ?? 0} of ${result?.attemptedCount ?? 0} clients got it. ${failed} could not be saved. Check the server log, then resend to those clients.`,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Broadcast sent to all clients",
        description:
          emailFailed > 0
            ? `${result?.deliveredCount ?? 0} notifications saved. ${emailFailed} emails did not go out, but those clients will still see it in their hub.`
            : undefined,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Broadcast not sent",
        description: errorText(err, "Nothing was sent. Try again."),
        variant: "destructive",
      });
    },
  });

  return {
    notifications: data?.notifications || [],
    clients: data?.clients || [],
    isLoading,
    sendNotification: sendMutation.mutate,
    sendToAll: sendToAllMutation.mutate,
    isSending: sendMutation.isPending || sendToAllMutation.isPending,
  };
}

/* ─── Client Notifications ───────────────────────────────── */

export function useClientNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["clientNotifications", user?.id];

  const { data: notifications = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await get<unknown[]>("/api/notifications");
      return (res.data || []).map(mapNotification);
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      const res = await patch(`/api/notifications/${notificationId}/read`, {});
      if (res.error) throw new Error(res.error);
    },
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<NotificationRow[]>(queryKey);
      queryClient.setQueryData<NotificationRow[]>(queryKey, (old) =>
        (old || []).map((n) =>
          n.notification_id === notificationId ? { ...n, is_read: true } : n
        )
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
    // Marking read is fire-and-forget from the UI's point of view, which is
    // exactly why it needs this: nobody is watching the result, so without a
    // re-read a failed mark-read leaves a badge count that disagrees with the
    // database until the next full page load.
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    notifications,
    unreadCount: notifications.filter((n) => !n.is_read).length,
    isLoading,
    markRead: (id: number) => markReadMutation.mutate(id),
  };
}
