/**
 * Sign-off draft generator.
 *
 * Registered as the handler for job_type = 'signoff_draft'.
 *
 * Step 1 — "Analyzing Contract Information"
 *   Reads the Signed contract file for the project (falls back to Final).
 *   Extracts text from the uploaded PDF/Word file.
 *
 * Step 2 — "Analyzing Website Features"
 *   Reads the linked GitHub repository's README and package.json.
 *   Summarises what the website actually does in plain language.
 *
 * Then calls Claude to write a sign-off document: plain English, no jargon,
 * features listed simply but not vaguely.
 *
 * Result is stored as a new project_signoff row (status = 'draft').
 * The job result contains { signoffId }.
 */

import { desc, eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db/connection.js";
import { contractFile, project, projectSignoff } from "../db/schema.js";
import { extractContractText } from "./contract-review.service.js";
import { env } from "../utils/env.js";
import { createLogger } from "../utils/logger.js";
import {
  registerHandler,
  updateStep,
  setJobResult,
  type BackgroundJob,
} from "./job-runner.service.js";

const log = createLogger("signoff-draft");

// ─── GitHub helper ───────────────────────────────────

async function fetchRepoSummary(repoName: string): Promise<string> {
  const token = env().GITHUB_TOKEN;
  const org = env().GITHUB_ORG;

  if (!token) {
    return "No GitHub token configured. Repository was not read.";
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
  };

  const parts: string[] = [];

  // Fetch README
  try {
    const readmeRes = await fetch(
      `https://api.github.com/repos/${org}/${repoName}/readme`,
      { headers },
    );
    if (readmeRes.ok) {
      const readmeData = (await readmeRes.json()) as { content?: string };
      if (readmeData.content) {
        const text = Buffer.from(readmeData.content, "base64").toString("utf8");
        parts.push(`README:\n${text.slice(0, 8000)}`);
      }
    }
  } catch {
    // Non-fatal — continue
  }

  // Fetch package.json from default branch
  try {
    const pkgRes = await fetch(
      `https://api.github.com/repos/${org}/${repoName}/contents/package.json`,
      { headers },
    );
    if (pkgRes.ok) {
      const pkgData = (await pkgRes.json()) as { content?: string };
      if (pkgData.content) {
        const text = Buffer.from(pkgData.content, "base64").toString("utf8");
        const parsed = JSON.parse(text) as Record<string, unknown>;
        const summary = {
          name: parsed.name,
          description: parsed.description,
          dependencies: Object.keys((parsed.dependencies as Record<string, string>) ?? {}),
        };
        parts.push(`package.json summary:\n${JSON.stringify(summary, null, 2)}`);
      }
    }
  } catch {
    // Non-fatal — continue
  }

  if (parts.length === 0) {
    return "Could not read the repository. It may be private or the token may lack access.";
  }

  return parts.join("\n\n");
}

// ─── AI call ─────────────────────────────────────────

const DRAFT_SYSTEM = `You are writing a project sign-off document for a web development agency.

Your job is to summarise what was built, based on the contract and the repository code.

Rules:
- Write in plain English. No technical jargon.
- Describe what the website does for the people who use it, not how it was built.
- List the features. Keep each feature description to one or two sentences.
- Do not start sentences with "As per the contract".
- Do not use words like "robust", "scalable", "leverage", or "utilize".
- Do not write a wall of text. Use short paragraphs and a bullet list for features.
- Keep it simple enough for a client to read without asking questions, but not so vague it says nothing.
- The document should feel like a clear, professional summary, not a legal notice.`;

async function generateSignoffContent(
  contractText: string,
  repoSummary: string,
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "AI draft generation is not configured on this server. Add ANTHROPIC_API_KEY to the environment.",
    );
  }

  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 2000,
    system: DRAFT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Write a sign-off document for this project.

Contract text:
${contractText.slice(0, 40_000)}

Repository information:
${repoSummary.slice(0, 10_000)}

Write the sign-off document now. Start with a short paragraph describing what was built, then list the features.`,
      },
    ],
  });

  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("The AI returned an unexpected response. Please try again.");
  }
  return block.text.trim();
}

// ─── Handler ─────────────────────────────────────────

async function signoffDraftHandler(job: BackgroundJob): Promise<void> {
  if (!job.projectId) {
    throw new Error("This job has no project linked. Cannot generate a draft.");
  }

  const projectId = job.projectId;
  const d = db();

  // ── Step 1: Analyzing Contract Information ──────────
  await updateStep(job.jobId, 0, "running");

  // Find Signed contract first, then fall back to Final
  let contractRow = await d
    .select()
    .from(contractFile)
    .where(eq(contractFile.projectId, projectId))
    .orderBy(desc(contractFile.createdAt))
    .then((rows) => rows.find((r) => r.status === "signed") ?? null);

  if (!contractRow) {
    contractRow = await d
      .select()
      .from(contractFile)
      .where(eq(contractFile.projectId, projectId))
      .orderBy(desc(contractFile.createdAt))
      .then((rows) => rows.find((r) => r.status === "final") ?? null);
  }

  if (!contractRow) {
    await updateStep(job.jobId, 0, "failed");
    throw new Error(
      "No signed or final contract found for this project. Upload and mark a contract as Signed or Final before generating a draft.",
    );
  }

  // Build the file path from the stored URL
  const uploadDir = env().UPLOAD_DIR ?? "./uploads";
  // fileUrl is stored as "/uploads/filename" — strip the leading /uploads/ prefix
  const relativePath = contractRow.fileUrl.replace(/^\/uploads\//, "");
  const filePath = `${uploadDir.replace(/\/$/, "")}/${relativePath}`;

  let contractText: string;
  try {
    contractText = await extractContractText(filePath, contractRow.mimeType);
  } catch (err) {
    await updateStep(job.jobId, 0, "failed");
    const msg = err instanceof Error ? err.message : "Failed to read the contract file.";
    throw new Error(`Could not read the contract file: ${msg}`);
  }

  await updateStep(job.jobId, 0, "done");

  // ── Step 2: Analyzing Website Features ─────────────
  await updateStep(job.jobId, 1, "running");

  const [proj] = await d
    .select({ repositoryName: project.repositoryName })
    .from(project)
    .where(eq(project.projectId, projectId))
    .limit(1);

  let repoSummary = "No repository linked to this project.";
  if (proj?.repositoryName) {
    repoSummary = await fetchRepoSummary(proj.repositoryName);
  }

  await updateStep(job.jobId, 1, "done");

  // ── Generate sign-off content ───────────────────────
  const content = await generateSignoffContent(contractText, repoSummary);

  // ── Store as a project_signoff draft ───────────────
  const [signoff] = await d
    .insert(projectSignoff)
    .values({
      projectId,
      title: "Generated Draft",
      scopeSummary: content,
      status: "draft",
      finalPaymentCents: 0,
      createdBy: job.createdBy ?? undefined,
    })
    .returning({ projectSignoffId: projectSignoff.projectSignoffId });

  await setJobResult(job.jobId, { signoffId: signoff.projectSignoffId });

  log.info(
    { jobId: job.jobId, projectId, signoffId: signoff.projectSignoffId },
    "Sign-off draft generated",
  );
}

// ─── Register at import time ──────────────────────────

registerHandler("signoff_draft", signoffDraftHandler);

export { signoffDraftHandler };
