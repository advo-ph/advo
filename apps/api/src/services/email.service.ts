import nodemailer from "nodemailer";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

export async function sendAdminInviteEmail(to: string, tempPassword?: string) {
  const loginInfo = tempPassword
    ? `<p style="color: #333;">Your temporary password is: <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 4px;">${tempPassword}</code></p>
       <p style="color: #666; font-size: 14px;">Please change your password after your first login.</p>`
    : `<p style="color: #333;">You can sign in using the magic link option with this email address.</p>`;

  await send(
    to,
    "Your ADVO admin account",
    wrap(`
      <h2 style="color: #1a1a1a; font-size: 18px;">You have admin access</h2>
      <p style="color: #333; line-height: 1.6;">An admin account was created for this email. Sign in to the ADVO admin console to manage projects, clients, and settings.</p>
      ${loginInfo}
      <a href="${env().FRONTEND_URL}/login" style="display: inline-block; background: #ea580c; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 16px;">
        Go to Admin
      </a>
    `),
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

export async function sendLeadNotificationEmail(
  to: string,
  lead: {
    name: string;
    email: string;
    company?: string | null;
    projectType?: string | null;
    budget?: string | null;
    description?: string | null;
  },
) {
  const row = (label: string, value?: string | null) =>
    value
      ? `<tr><td style="padding:4px 12px 4px 0;color:#999;white-space:nowrap;">${label}</td><td style="color:#1a1a1a;">${value}</td></tr>`
      : "";
  await send(
    to,
    `New lead: ${lead.name}${lead.company ? ` — ${lead.company}` : ""}`,
    wrap(`
      <h2 style="color:#1a1a1a;font-size:18px;margin:0 0 12px;">New project inquiry</h2>
      <table style="border-collapse:collapse;font-size:14px;">
        ${row("Name", lead.name)}
        ${row("Email", lead.email)}
        ${row("Company", lead.company)}
        ${row("Project", lead.projectType)}
        ${row("Budget", lead.budget)}
      </table>
      ${lead.description ? `<p style="color:#333;line-height:1.6;margin-top:14px;">${lead.description}</p>` : ""}
      <a href="${env().FRONTEND_URL}/admin" style="display:inline-block;background:#ea580c;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px;">
        Open Admin → Leads
      </a>
    `),
  );
}

// ─── Outreach transport (mass send) ──────────────────
//
// DELIBERATELY SEPARATE from the transactional transport above.
//
// Everything above carries magic links, client notifications, and admin invites.
// Cold outreach to a scraped list is the highest-risk mail this system sends, and a
// reputation hit on it must not be able to stop a client from logging in. So outreach
// gets its own credentials, its own sending domain, and its own failure behavior:
//
//   transactional  — best effort. send() catches and logs; a failed notification must
//                    never break the request that triggered it.
//   outreach       — THROWS. A campaign that cannot send must fail loudly, so the
//                    recipient row records the failure and can be retried. Silently
//                    "succeeding" would mark 5000 people as contacted who never were.
//
// Config is read off process.env, matching how this repo carries every other optional
// integration key (see contract-review.service.ts). env.ts holds the validated core only.

export type OutreachConfig = {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
};

/** Resolve the outreach transport config, or null when it is not configured. */
export function outreachConfig(): OutreachConfig | null {
  const host = process.env.OUTREACH_SMTP_HOST;
  const from = process.env.OUTREACH_FROM;
  if (!host || !from) return null;

  return {
    host,
    port: Number(process.env.OUTREACH_SMTP_PORT ?? 587),
    user: process.env.OUTREACH_SMTP_USER,
    pass: process.env.OUTREACH_SMTP_PASS,
    from,
  };
}

/** Env vars are present. Says nothing about whether the receiving world will accept the mail. */
export function isOutreachConfigured(): boolean {
  return outreachConfig() !== null;
}

// ─── DNS clearance ───────────────────────────────────
//
// Env vars present + DNS absent is exactly the state that burns a domain: the transport
// connects, 5000 messages go out unauthenticated, and the domain is blocked on its first
// campaign. So configuration is not permission. Permission is SPF + DKIM + DMARC actually
// resolving, which only a live lookup can establish.
//
// `npm run outreach:preflight` does those lookups and records the verdict to
// docs/outreach-preflight.json. This reads that artifact. Nothing here touches DNS — a
// per-send resolver call would put a network dependency in the send loop and would let a
// transient SOA timeout stop a campaign mid-flight. The artifact is the committed answer.
//
// It expires. DNS is mutable, a record can be dropped or a key rotated after clearance, so
// a verdict older than MAX_VERIFICATION_AGE_DAY is treated as unknown rather than as yes.

const MAX_VERIFICATION_AGE_DAY = 30;

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const PREFLIGHT_ARTIFACT_PATH = join(REPO_ROOT, "docs/outreach-preflight.json");

export type OutreachDnsVerification = {
  isVerified: boolean;
  /** Why not, in the operator's words. Empty when verified. */
  reason: string;
  domain: string | null;
  checkedAt: string | null;
};

const REMEDY = "Run `npm run outreach:preflight` and publish whatever it reports missing.";

/** Read the recorded DNS verdict and decide whether it clears the domain configured right now. */
export function outreachDnsVerification(): OutreachDnsVerification {
  const config = outreachConfig();
  const configuredDomain = config ? (config.from.match(/@([^>\s]+)/)?.[1]?.toLowerCase() ?? null) : null;
  const unverified = (reason: string): OutreachDnsVerification => ({
    isVerified: false,
    reason,
    domain: configuredDomain,
    checkedAt: null,
  });

  if (!existsSync(PREFLIGHT_ARTIFACT_PATH)) {
    return unverified(`No outreach DNS preflight has ever been recorded. ${REMEDY}`);
  }

  let artifact: {
    passed?: boolean;
    domain?: string | null;
    checkedAt?: string | null;
    count?: { failed?: number };
  };
  try {
    artifact = JSON.parse(readFileSync(PREFLIGHT_ARTIFACT_PATH, "utf8"));
  } catch {
    return unverified(`The recorded outreach DNS preflight is unreadable. ${REMEDY}`);
  }

  const checkedAt = artifact.checkedAt ?? null;

  if (!artifact.passed) {
    const failedCount = artifact.count?.failed ?? 0;
    return {
      isVerified: false,
      reason:
        `The last outreach DNS preflight failed${failedCount ? ` (${failedCount} check failing)` : ""}. ` +
        REMEDY,
      domain: configuredDomain,
      checkedAt,
    };
  }

  // A pass for a domain we are no longer sending from clears nothing.
  if (!configuredDomain || artifact.domain?.toLowerCase() !== configuredDomain) {
    return {
      isVerified: false,
      reason:
        `The recorded preflight cleared ${artifact.domain ?? "(no domain)"}, but OUTREACH_FROM now ` +
        `sends from ${configuredDomain ?? "(no domain)"}. ${REMEDY}`,
      domain: configuredDomain,
      checkedAt,
    };
  }

  const ageDay = checkedAt
    ? (Date.now() - new Date(checkedAt).getTime()) / 86_400_000
    : Number.POSITIVE_INFINITY;
  if (!(ageDay >= 0) || ageDay > MAX_VERIFICATION_AGE_DAY) {
    return {
      isVerified: false,
      reason:
        `The outreach DNS clearance for ${configuredDomain} is stale (checked ${checkedAt ?? "never"}, ` +
        `max ${MAX_VERIFICATION_AGE_DAY} days). Records can be dropped or keys rotated after clearance. ${REMEDY}`,
      domain: configuredDomain,
      checkedAt,
    };
  }

  return { isVerified: true, reason: "", domain: configuredDomain, checkedAt };
}

/** True only when SPF, DKIM and DMARC were verified for the domain currently configured. */
export function isOutreachDnsVerified(): boolean {
  return outreachDnsVerification().isVerified;
}

let _outreachTransport: nodemailer.Transporter | null | undefined;

function outreachTransport(): nodemailer.Transporter | null {
  if (_outreachTransport !== undefined) return _outreachTransport;

  const config = outreachConfig();
  if (!config) {
    _outreachTransport = null;
    return null;
  }

  _outreachTransport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  });
  return _outreachTransport;
}

/** Test seam: drop the memoized transport so a stub can take effect. */
export function resetOutreachTransport(): void {
  _outreachTransport = undefined;
}

/**
 * Send one outreach email. THROWS on any failure — including when no outreach transport
 * is configured, and including when the outreach domain has no recorded DNS clearance.
 * It never borrows the transactional transport and never logs-and-returns.
 */
export async function sendOutreachEmail(to: string, subject: string, html: string): Promise<void> {
  const config = outreachConfig();
  const t = outreachTransport();

  if (!config || !t) {
    throw new Error(
      "Outreach transport is not configured. Set OUTREACH_SMTP_HOST and OUTREACH_FROM. " +
        "Campaign sending deliberately does not fall back to the transactional transport.",
    );
  }

  // Configured is not cleared. Refuse rather than send unauthenticated mail from a domain
  // the receiving world has no reason to trust.
  const verification = outreachDnsVerification();
  if (!verification.isVerified) {
    throw new Error(`Outreach domain is not DNS-verified. ${verification.reason}`);
  }

  await t.sendMail({ from: config.from, to, subject, html });
  log.info({ to, subject }, "Outreach email sent");
}

/** The outreach HTML shell. Unlike wrap(), it carries a mandatory unsubscribe link. */
export function wrapOutreach(body: string, unsubscribeUrl: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
      <div style="margin-bottom: 24px;">
        <strong style="font-size: 20px; color: #1a1a1a;">ADVO</strong>
      </div>
      ${body}
      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 12px; color: #999;">
        ADVO &middot; advo.ph &middot; Metro Manila, Philippines<br />
        <a href="${unsubscribeUrl}" style="color: #999; text-decoration: underline;">Unsubscribe</a>
        — one click, no login, and we will not contact this address again.
      </div>
    </div>
  `;
}
