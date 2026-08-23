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

  CLOUDFLARE_TOKEN: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),

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
