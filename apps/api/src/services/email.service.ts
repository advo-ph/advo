import nodemailer from "nodemailer";
import { env } from "../utils/env.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("email");

function getTransport() {
  const e = env();

  if (e.RESEND_API_KEY) {
    return nodemailer.createTransport({
      host: "smtp.resend.com",
      port: 465,
      secure: true,
      auth: { user: "resend", pass: e.RESEND_API_KEY },
    });
  }

  if (e.SMTP_HOST) {
    return nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT || 587,
      secure: (e.SMTP_PORT || 587) === 465,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
    });
  }

  log.warn("No email transport configured — emails will be logged only");
  return null;
}

let _transport: nodemailer.Transporter | null | undefined;

function transport() {
  if (_transport === undefined) _transport = getTransport();
  return _transport;
}

async function send(to: string, subject: string, html: string) {
  const t = transport();
  if (!t) {
    log.info({ to, subject }, "Email (no transport, logged only)");
    return;
  }

  try {
    await t.sendMail({
      from: "ADVO <noreply@advo.ph>",
      to,
      subject,
      html,
    });
    log.info({ to, subject }, "Email sent");
  } catch (err) {
    log.error({ to, subject, err }, "Failed to send email");
  }
}

// ─── Templates ────────────────────────────────────────

function wrap(body: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
      <div style="margin-bottom: 24px;">
        <strong style="font-size: 20px; color: #1a1a1a;">ADVO</strong>
      </div>
      ${body}
      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 12px; color: #999;">
        ADVO — Digital Agency &middot; advo.ph
      </div>
    </div>
  `;
}

export async function sendMagicLinkEmail(to: string, link: string) {
  await send(
    to,
    "Your ADVO Login Link",
    wrap(`
      <p style="color: #333; line-height: 1.6;">Click the button below to sign in to your ADVO dashboard:</p>
      <a href="${link}" style="display: inline-block; background: #ea580c; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">
        Sign In
      </a>
      <p style="color: #666; font-size: 14px;">This link expires in 15 minutes. If you didn't request this, you can ignore this email.</p>
    `)
  );
}

export async function sendNotificationEmail(
  to: string,
  title: string,
  body: string,
  projectTitle?: string
) {
  await send(
    to,
    `${title} — ADVO`,
    wrap(`
      ${projectTitle ? `<p style="color: #999; font-size: 13px; margin-bottom: 4px;">${projectTitle}</p>` : ""}
      <h2 style="color: #1a1a1a; font-size: 18px; margin: 0 0 12px;">${title}</h2>
      <p style="color: #333; line-height: 1.6;">${body}</p>
      <a href="${env().FRONTEND_URL}/hub" style="display: inline-block; background: #ea580c; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 16px;">
        View in Dashboard
      </a>
    `)
  );
}

export async function sendWelcomeEmail(to: string, tempPassword?: string) {
  const loginInfo = tempPassword
    ? `<p style="color: #333;">Your temporary password is: <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 4px;">${tempPassword}</code></p>
       <p style="color: #666; font-size: 14px;">Please change your password after your first login.</p>`
    : `<p style="color: #333;">You can sign in using the magic link option with this email address.</p>`;

  await send(
    to,
    "Welcome to ADVO",
    wrap(`
      <h2 style="color: #1a1a1a; font-size: 18px;">Welcome to ADVO!</h2>
      <p style="color: #333; line-height: 1.6;">Your client account has been created. You can now access your project dashboard to track progress, view invoices, and communicate with the team.</p>
      ${loginInfo}
      <a href="${env().FRONTEND_URL}/login" style="display: inline-block; background: #ea580c; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 16px;">
        Go to Dashboard
      </a>
    `)
  );
}
