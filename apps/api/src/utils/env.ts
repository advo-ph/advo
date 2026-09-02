import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),

  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  GITHUB_TOKEN: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_ORG: z.string().default("advo-ph"),

  /** Shared secret for POST /api/meeting/import/praud (praud passcode `advo`). */
  PRAUD_IMPORT_SECRET: z.string().optional(),
  /** Fallback project for praud imports when the body omits projectId. */
  ADVO_INBOX_PROJECT_ID: z.string().optional(),
  /** Seconds between Plaud ADVO-folder probes. 0 disables. Default 60. */
  PLAUD_POLL_SECOND: z.string().optional(),

  /** Which preview-hosting adapter serves "Show Client Now". Default manual. */
  PREVIEW_HOST_PROVIDER: z.enum(["manual", "herenow", "cloudflare"]).default("manual"),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_PAGES_PROJECT: z.string().optional(),
  /** here.now deploy credential. Unset → the herenow adapter falls back to manual. */
  HERENOW_API_KEY: z.string().optional(),
  HERENOW_API_URL: z.string().optional(),

  /**
   * Which rail turns an invoice into something a client can pay (migration 022).
   * Defaults to `manual` — the honest description of what the business does today:
   * record the collectable, collect over GCash or bank transfer, settle by hand.
   * A provider NAMED here without its credential falls back to manual and logs it,
   * so a missing key degrades rather than breaking collection outright.
   */
  PAYMENT_PROVIDER: z.enum(["manual", "paymongo", "xendit"]).default("manual"),
  PAYMONGO_SECRET_KEY: z.string().optional(),
  /** Signs the `Paymongo-Signature` header. Without it EVERY callback is refused. */
  PAYMONGO_WEBHOOK_SECRET: z.string().optional(),
  XENDIT_SECRET_KEY: z.string().optional(),
  /** Echoed in `x-callback-token`. Without it every Xendit callback is refused. */
  XENDIT_CALLBACK_TOKEN: z.string().optional(),

  /**
   * Message channels (migration 023). Which SMS gateway serves the `sms` channel.
   * Defaults to `log`, which RECORDS the message and refuses to claim it was sent —
   * a transport that reports success without a transport is exactly the failure that
   * hid the 2026-08-29 mail outage for months.
   */
  SMS_PROVIDER: z.enum(["log", "semaphore", "movider"]).default("log"),
  SEMAPHORE_API_KEY: z.string().optional(),
  /** Must be pre-registered with Semaphore. Unset → their shared default sender. */
  SEMAPHORE_SENDER_NAME: z.string().optional(),
  MOVIDER_API_KEY: z.string().optional(),
  MOVIDER_API_SECRET: z.string().optional(),
  /** Shared secret on inbound SMS — Semaphore does not sign its callbacks. */
  SMS_INBOUND_SECRET: z.string().optional(),

  VIBER_AUTH_TOKEN: z.string().optional(),
  VIBER_SENDER_NAME: z.string().optional(),

  /** Page access token — sends. */
  MESSENGER_PAGE_TOKEN: z.string().optional(),
  /** App secret — signs `X-Hub-Signature-256` on inbound. Unset → every callback unverified. */
  MESSENGER_APP_SECRET: z.string().optional(),
  /** Echoed back during Facebook's one-time subscription handshake. */
  MESSENGER_VERIFY_TOKEN: z.string().optional(),

  PORT: z.coerce.number().default(6407),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  UPLOAD_DIR: z.string().default("./uploads"),
  API_URL: z.string().default("http://localhost:6407"),
  FRONTEND_URL: z.string().default("http://localhost:6400"),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function loadEnv(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Missing or invalid environment variables:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  _env = result.data;
  return _env;
}

export function env(): Env {
  if (!_env) throw new Error("env() called before loadEnv()");
  return _env;
}
