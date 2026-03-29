/**
 * Trigger a notification via the ADVO API.
 * Fire-and-forget — does not throw on failure.
 */
import { post } from "@/lib/api";

export async function triggerNotification(payload: {
  client_id: number;
  project_id?: number | null;
  title: string;
  body: string;
  type: "progress_update" | "invoice_issued" | "deliverable_completed" | "project_status_change" | "custom";
}) {
  try {
    await post("/api/notifications", {
      clientId: payload.client_id,
      projectId: payload.project_id,
      title: payload.title,
      body: payload.body,
      type: payload.type,
      sendEmail: true,
    });
  } catch (err) {
    console.error("[triggerNotification]", err);
  }
}
