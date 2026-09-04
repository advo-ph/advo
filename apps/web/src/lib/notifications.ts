/**
 * Trigger a client notification via the ADVO API.
 *
 * This is a secondary write. Its callers have already done the thing that
 * matters (raised an invoice, completed a deliverable), so a failure here must
 * not fail theirs, and this function still never throws.
 *
 * What changed is that it no longer says nothing.
 *
 * It used to wrap the call in try/catch and log from the catch. But `post`
 * resolves with { data, error } and never rejects, so that catch could not run:
 * a 500 from the server, a dropped connection, an expired session all returned
 * a perfectly ordinary resolved promise carrying an error string that nobody
 * read. The notification silently did not happen, and the caller was told
 * nothing, so the client never learned their invoice existed.
 *
 * The outcome is now returned. Callers decide whether to surface it.
 */
import { post } from "@/lib/api";

export interface TriggerResult {
  ok: boolean;
  /** Null when ok. Safe to show a user. */
  error: string | null;
}

export async function triggerNotification(payload: {
  client_id: number;
  project_id?: number | null;
  title: string;
  body: string;
  type: "progress_update" | "invoice_issued" | "deliverable_completed" | "project_status_change" | "custom";
}): Promise<TriggerResult> {
  const res = await post("/api/notifications", {
    clientId: payload.client_id,
    projectId: payload.project_id,
    title: payload.title,
    body: payload.body,
    type: payload.type,
    sendEmail: true,
  });

  if (res.error) {
    console.error("[triggerNotification]", payload.type, res.error);
    return { ok: false, error: res.error };
  }
  return { ok: true, error: null };
}
