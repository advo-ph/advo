/**
 * Trigger a notification via the send-notification Edge Function.
 * Fire-and-forget — does not throw on failure.
 */
import { supabase } from "@/integrations/supabase/client";

export async function triggerNotification(payload: {
  client_id: number;
  project_id?: number | null;
  title: string;
  body: string;
  type: "progress_update" | "invoice_issued" | "deliverable_completed" | "project_status_change" | "custom";
}) {
  try {
    await supabase.functions.invoke("send-notification", { body: payload });
  } catch (err) {
    // Fire-and-forget — log but don't disrupt the caller
    console.error("[triggerNotification]", err);
  }
}
