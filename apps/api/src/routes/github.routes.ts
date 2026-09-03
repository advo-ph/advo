import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, desc, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { githubEvent, project } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTeam } from "../middleware/rbac.js";
import { env } from "../utils/env.js";
import { createLogger } from "../utils/logger.js";
import type { Variables } from "../types/context.js";

const log = createLogger("github");

/**
 * A project's repositoryName is usually a bare name inside GITHUB_ORG. It may also be
 * owner-qualified ("CelestialBrain/vbeeyecenter") for source that lives outside the
 * org; the feed, the backfill and the branch list all resolve through here.
 */
export function repoRef(name: string): { owner: string; repo: string; full: string } {
  const slash = name.indexOf("/");
  if (slash > 0) {
    const owner = name.slice(0, slash);
    const repo = name.slice(slash + 1);
    return { owner, repo, full: `${owner}/${repo}` };
  }
  return { owner: env().GITHUB_ORG, repo: name, full: `${env().GITHUB_ORG}/${name}` };
}

/** Match a webhook's repository to a project by full name first, bare name second. */
async function projectForRepo(fullName: string | undefined, bareName: string | undefined) {
  const d = db();
  if (fullName) {
    const [byFull] = await d.select().from(project).where(eq(project.repositoryName, fullName)).limit(1);
    if (byFull) return byFull;
  }
  if (bareName) {
    const [byBare] = await d.select().from(project).where(eq(project.repositoryName, bareName)).limit(1);
    if (byBare) return byBare;
  }
  return null;
}
const github = new Hono<{ Variables: Variables }>();

// ─── Webhook Receiver ─────────────────────────────────

github.post("/webhook", async (c) => {
  const secret = env().GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    log.warn("GitHub webhook received but GITHUB_WEBHOOK_SECRET not configured");
    return c.json({ error: "Webhook not configured" }, 503);
  }

  const signature = c.req.header("X-Hub-Signature-256");
  if (!signature) return c.json({ error: "Missing signature" }, 401);

  const body = await c.req.text();
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  if (
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const event = c.req.header("X-GitHub-Event");
  const payload = JSON.parse(body);
  const d = db();

  if (event === "push") {
    const branch = payload.ref?.replace("refs/heads/", "");

    // Match repo to project; the cache key is the name the project uses, so an
    // owner-qualified project reads its own events back.
    const proj = await projectForRepo(payload.repository?.full_name, payload.repository?.name);
    const repoName = proj?.repositoryName ?? payload.repository?.name;
    const projectId = proj?.projectId || null;

    // Store each commit
    for (const commit of payload.commits || []) {
      await d.insert(githubEvent).values({
        projectId,
        eventType: "push",
        payload: commit,
        repoName,
        branch,
        commitSha: commit.id,
        author: commit.author?.username || commit.author?.name,
        message: commit.message,
      });
    }

    log.info(
      { repoName, branch, commits: payload.commits?.length },
      "Processed push event"
    );
  }

  if (event === "pull_request") {
    const proj = await projectForRepo(payload.repository?.full_name, payload.repository?.name);
    const repoName = proj?.repositoryName ?? payload.repository?.name;

    await d.insert(githubEvent).values({
      projectId: proj?.projectId || null,
      eventType: "pull_request",
      payload: {
        action: payload.action,
        number: payload.pull_request?.number,
        title: payload.pull_request?.title,
        state: payload.pull_request?.state,
        user: payload.pull_request?.user?.login,
      },
      repoName,
      branch: payload.pull_request?.head?.ref,
      author: payload.pull_request?.user?.login,
      message: payload.pull_request?.title,
    });

    log.info({ repoName, action: payload.action }, "Processed PR event");
  }

  if (event === "deployment_status") {
    const proj = await projectForRepo(payload.repository?.full_name, payload.repository?.name);
    const repoName = proj?.repositoryName ?? payload.repository?.name;

    await d.insert(githubEvent).values({
      projectId: proj?.projectId || null,
      eventType: "deployment_status",
      payload: {
        state: payload.deployment_status?.state,
        environment: payload.deployment_status?.environment,
        description: payload.deployment_status?.description,
        targetUrl: payload.deployment_status?.target_url,
      },
      repoName,
      author: payload.sender?.login,
      message: `Deployment ${payload.deployment_status?.state}`,
    });

    log.info({ repoName, state: payload.deployment_status?.state }, "Processed deployment event");
  }

  return c.json({ data: { received: true }, error: null });
});

// ─── Cached Org Repos ─────────────────────────────────

github.get("/repos", requireAuth, requireTeam, async (c) => {
  const token = env().GITHUB_TOKEN;
  const org = env().GITHUB_ORG;

  if (!token) {
    return c.json({ data: [], error: "GitHub token not configured" });
  }

  const res = await fetch(`https://api.github.com/orgs/${org}/repos?per_page=100&sort=updated`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!res.ok) {
    log.error({ status: res.status }, "GitHub API error");
    return c.json({ data: [], error: "GitHub API error" });
  }

  const repos = await res.json();
  return c.json({
    data: repos.map((r: Record<string, unknown>) => ({
      name: r.name,
      fullName: r.full_name,
      description: r.description,
      private: r.private,
      updatedAt: r.updated_at,
      language: r.language,
      defaultBranch: r.default_branch,
    })),
    error: null,
  });
});

// ─── Repo Commits (from cache) ────────────────────────

github.get("/repos/:name/commits", requireAuth, async (c) => {
  const repoName = c.req.param("name");
  const branch = c.req.query("branch") || undefined;
  const limit = Math.min(Number(c.req.query("limit") || 50), 200);

  const conditions = [
    eq(githubEvent.repoName, repoName),
    eq(githubEvent.eventType, "push"),
  ];
  if (branch) conditions.push(eq(githubEvent.branch, branch));

  const rows = await db()
    .select()
    .from(githubEvent)
    .where(and(...conditions))
    .orderBy(desc(githubEvent.createdAt))
    .limit(limit);

  return c.json({ data: rows, error: null });
});

// ─── Repo Branches ────────────────────────────────────

/**
 * Backfill the commit cache from the GitHub API. The webhook only records pushes
 * that happened after it was installed (2026-08-29), so a repository linked to a
 * project later, or one quiet since then, showed an empty engineering feed to the
 * client. This fetches the last 100 commits on the default branch and stores the
 * ones the cache does not have, dated by the commit itself so history reads in
 * order. Idempotent: a second call inserts nothing.
 */
github.post("/repos/:name/backfill", requireAuth, requireTeam, async (c) => {
  const repoName = c.req.param("name");
  const token = env().GITHUB_TOKEN;
  if (!token) return c.json({ data: null, error: "GitHub token not configured" }, 503);
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" };
  const ref = repoRef(repoName);

  const repoRes = await fetch(`https://api.github.com/repos/${ref.full}`, { headers });
  if (!repoRes.ok) return c.json({ data: null, error: `GitHub: repo ${repoName} → ${repoRes.status}` }, 502);
  const repo = (await repoRes.json()) as { default_branch?: string };
  const branch = repo.default_branch ?? "main";

  const commitRes = await fetch(
    `https://api.github.com/repos/${ref.full}/commits?sha=${encodeURIComponent(branch)}&per_page=100`,
    { headers },
  );
  if (!commitRes.ok) return c.json({ data: null, error: `GitHub: commits → ${commitRes.status}` }, 502);
  const list = (await commitRes.json()) as {
    sha: string;
    html_url: string;
    commit: { message: string; author?: { name?: string; date?: string } };
    author?: { login?: string } | null;
  }[];

  const d = db();
  const [proj] = await d.select({ projectId: project.projectId }).from(project).where(eq(project.repositoryName, repoName)).limit(1);
  const known = new Set(
    (await d.select({ commitSha: githubEvent.commitSha }).from(githubEvent).where(eq(githubEvent.repoName, repoName)))
      .map((r) => r.commitSha)
      .filter(Boolean),
  );

  let insertedCount = 0;
  for (const item of list) {
    if (known.has(item.sha)) continue;
    const author = item.author?.login || item.commit.author?.name || null;
    const timestamp = item.commit.author?.date ?? null;
    await d.insert(githubEvent).values({
      projectId: proj?.projectId ?? null,
      eventType: "push",
      payload: { id: item.sha, message: item.commit.message, url: item.html_url, author: { name: author, username: item.author?.login ?? null }, timestamp, isBackfilled: true },
      repoName,
      branch,
      commitSha: item.sha,
      author,
      message: item.commit.message,
      createdAt: timestamp ? new Date(timestamp) : new Date(),
    });
    insertedCount += 1;
  }
  log.info({ repoName, branch, insertedCount }, "Backfilled commit cache");
  return c.json({ data: { repoName, branch, fetchedCount: list.length, insertedCount }, error: null });
});

// A client reads their project's branches too; names are not a secret and the
// hub's branch switcher 403'd for every client before this.
github.get("/repos/:name/branches", requireAuth, async (c) => {
  const repoName = c.req.param("name");
  const token = env().GITHUB_TOKEN;

  if (!token) return c.json({ data: [], error: "GitHub token not configured" });

  const res = await fetch(
    `https://api.github.com/repos/${repoRef(repoName).full}/branches`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  if (!res.ok) return c.json({ data: [], error: "GitHub API error" });

  const branches = await res.json();
  return c.json({
    data: branches.map((b: Record<string, unknown>) => ({
      name: b.name,
      protected: b.protected,
    })),
    error: null,
  });
});

export default github;
