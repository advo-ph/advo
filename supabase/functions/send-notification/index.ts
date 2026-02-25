import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NotificationPayload {
  client_id: number;
  project_id?: number | null;
  title: string;
  body: string;
  type: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const payload: NotificationPayload = await req.json();
    const { client_id, project_id, title, body, type } = payload;

    // 1. Insert notification row
    const { error: insertError } = await supabase
      .from("notification")
      .insert({
        client_id,
        project_id: project_id ?? null,
        type,
        title,
        body,
      });

    if (insertError) {
      throw new Error(`DB insert failed: ${insertError.message}`);
    }

    // 2. Check auto-notification config from site_content
    const { data: siteRow } = await supabase
      .from("site_content")
      .select("content")
      .eq("section_id", "client_dashboard")
      .single();

    const config = (siteRow?.content as Record<string, unknown>) ?? {};

    // Map notification type to config key
    const configMap: Record<string, string> = {
      progress_update: "notify_on_progress_update",
      invoice_issued: "notify_on_invoice",
      deliverable_completed: "notify_on_deliverable_complete",
    };

    const configKey = configMap[type];
    // Default to true if key not found (custom notifications always send)
    const shouldEmail =
      type === "custom" || !configKey || config[configKey] !== false;

    if (!shouldEmail) {
      return new Response(
        JSON.stringify({ success: true, email_sent: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Fetch client info for email
    const { data: client } = await supabase
      .from("client")
      .select("company_name, contact_email")
      .eq("client_id", client_id)
      .single();

    if (!client?.contact_email) {
      return new Response(
        JSON.stringify({ success: true, email_sent: false, reason: "no_email" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Send email via Resend
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not set");
      return new Response(
        JSON.stringify({ success: true, email_sent: false, reason: "no_api_key" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #0a0a0a; color: #e5e5e5; }
          .container { max-width: 560px; margin: 0 auto; padding: 40px 24px; }
          .logo { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff; margin-bottom: 32px; }
          .logo span { color: #6366f1; }
          .card { background: #141414; border: 1px solid #262626; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
          .title { font-size: 18px; font-weight: 600; color: #ffffff; margin: 0 0 8px 0; }
          .body-text { font-size: 14px; line-height: 1.6; color: #a3a3a3; margin: 0; }
          .greeting { font-size: 14px; color: #a3a3a3; margin-bottom: 16px; }
          .footer { text-align: center; padding-top: 24px; border-top: 1px solid #262626; }
          .footer a { color: #6366f1; text-decoration: none; font-size: 13px; }
          .footer p { color: #525252; font-size: 12px; margin-top: 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">ADVO<span>.</span></div>
          <div class="card">
            <p class="greeting">Hi ${client.company_name},</p>
            <h2 class="title">${title}</h2>
            <p class="body-text">${body}</p>
          </div>
          <div class="footer">
            <a href="https://advo.ph">advo.ph</a>
            <p>You're receiving this because you're a client of ADVO.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "ADVO <hello@advo.ph>",
        to: [client.contact_email],
        subject: title,
        html: emailHtml,
      }),
    });

    const emailResult = await emailRes.json();

    return new Response(
      JSON.stringify({ success: true, email_sent: true, email_result: emailResult }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
