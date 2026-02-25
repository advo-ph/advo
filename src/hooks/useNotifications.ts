import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  type: NotificationType;
  title: string;
  body: string;
  is_read: boolean;
  sent_at: string;
}

interface ClientRef {
  client_id: number;
  company_name: string;
  contact_email: string;
}

/* ─── Admin Hook ──────────────────────────────────────────── */

interface AdminNotificationsData {
  notifications: NotificationRow[];
  clients: ClientRef[];
}

async function fetchAdminNotifications(): Promise<AdminNotificationsData> {
  const [notifRes, clientRes] = await Promise.all([
    supabase
      .from("notification")
      .select("*")
      .order("sent_at", { ascending: false }),
    supabase
      .from("client")
      .select("client_id, company_name, contact_email")
      .order("company_name"),
  ]);

  if (notifRes.error) throw new Error(notifRes.error.message);

  return {
    notifications: (notifRes.data || []) as unknown as NotificationRow[],
    clients: (clientRes.data || []) as ClientRef[],
  };
}

export function useAdminNotifications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const QUERY_KEY = ["adminNotifications"];

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchAdminNotifications,
  });

  const notifications = data?.notifications ?? [];
  const clients = data?.clients ?? [];

  /* Send custom notification (insert row directly — edge function handles email) */
  const sendMutation = useMutation({
    mutationFn: async (payload: {
      client_id: number;
      project_id?: number | null;
      title: string;
      body: string;
      type: NotificationType;
    }) => {
      // Call edge function which inserts + emails
      const { data: funcData, error } = await supabase.functions.invoke(
        "send-notification",
        { body: payload }
      );
      if (error) throw new Error(error.message);
      return funcData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Sent", description: "Notification delivered" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  /* Send to all clients */
  const sendToAllMutation = useMutation({
    mutationFn: async (payload: { title: string; body: string }) => {
      const allClients = data?.clients ?? [];
      const promises = allClients.map((c) =>
        supabase.functions.invoke("send-notification", {
          body: {
            client_id: c.client_id,
            title: payload.title,
            body: payload.body,
            type: "custom" as NotificationType,
          },
        })
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({
        title: "Sent",
        description: "Notification sent to all clients",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    notifications,
    clients,
    isLoading,
    sendNotification: sendMutation.mutate,
    sendToAll: sendToAllMutation.mutate,
    isSending: sendMutation.isPending || sendToAllMutation.isPending,
  };
}

/* ─── Client Hook ─────────────────────────────────────────── */

async function fetchClientNotifications(): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notification")
    .select("*")
    .order("sent_at", { ascending: false })
    .limit(10);

  if (error) throw new Error(error.message);
  return (data || []) as unknown as NotificationRow[];
}

export function useClientNotifications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const QUERY_KEY = ["clientNotifications"];

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchClientNotifications,
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      const { error } = await supabase
        .from("notification")
        .update({ is_read: true } as Record<string, unknown>)
        .eq("notification_id", notificationId);
      if (error) throw new Error(error.message);
    },
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous =
        queryClient.getQueryData<NotificationRow[]>(QUERY_KEY);

      queryClient.setQueryData<NotificationRow[]>(QUERY_KEY, (old) =>
        (old || []).map((n) =>
          n.notification_id === notificationId
            ? { ...n, is_read: true }
            : n
        )
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous)
        queryClient.setQueryData(QUERY_KEY, context.previous);
      toast({
        title: "Error",
        description: "Failed to mark as read",
        variant: "destructive",
      });
    },
  });

  return {
    notifications,
    unreadCount,
    isLoading,
    markRead: markReadMutation.mutate,
  };
}
