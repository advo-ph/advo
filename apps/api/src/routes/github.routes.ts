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
    const repoName = payload.repository?.name;
    const branch = payload.ref?.replace("refs/heads/", "");

    // Match repo to project
    const [proj] = await d
      .select()
      .from(project)
      .where(eq(project.repositoryName, repoName))
      .limit(1);

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
    const repoName = payload.repository?.name;
    const [proj] = await d
      .select()
      .from(project)
      .where(eq(project.repositoryName, repoName))
      .limit(1);

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
    const repoName = payload.repository?.name;
    const [proj] = await d
      .select()
      .from(project)
      .where(eq(project.repositoryName, repoName))
      .limit(1);

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

github.get("/repos/:name/branches", requireAuth, requireTeam, async (c) => {
  const repoName = c.req.param("name");
  const token = env().GITHUB_TOKEN;

  if (!token) return c.json({ data: [], error: "GitHub token not configured" });

  const res = await fetch(
    `https://api.github.com/repos/${env().GITHUB_ORG}/${repoName}/branches`,
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
