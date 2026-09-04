/**
 * Whisper transcription handler.
 *
 * Registered as the handler for job_type = 'transcribe_recording'.
 *
 * Step 1 label: the audio file name.
 *   - Reads the file from disk under env().UPLOAD_DIR.
 *   - Calls openai.audio.transcriptions.create({ model: 'whisper-1' }).
 *   - Stores the result in meeting_recording.transcript.
 *   - Updates meeting.summary with the transcript so the existing task-generation
 *     flow (meeting-task.service.ts) can read it.
 *
 * Failure modes:
 *   - OPENAI_API_KEY missing → fails with "Transcription is not configured on this server".
 *   - File larger than 25 MB → fails with a plain message before calling OpenAI.
 *   - Any OpenAI error → propagates the error message to the job.
 *
 * Multiple concurrent recordings each get their own job. The widget groups them
 * visually under "Transcribing Audio" because they share the same title.
 */

import { eq } from "drizzle-orm";
import OpenAI from "openai";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../db/connection.js";
import { meetingRecording, meeting } from "../db/schema.js";
import { env } from "../utils/env.js";
import { createLogger } from "../utils/logger.js";
import {
  registerHandler,
  updateStep,
  type BackgroundJob,
} from "./job-runner.service.js";

const log = createLogger("transcription");

// Whisper has a 25 MB per-request hard limit.
const WHISPER_MAX_BYTES = 25 * 1024 * 1024;

// ─── Handler ─────────────────────────────────────────

async function transcribeRecordingHandler(job: BackgroundJob): Promise<void> {
  const openaiKey = env().OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error("Transcription is not configured on this server.");
  }

  // The job result stores the recording id so we know which row to update.
  const recordingId = (job.result as { recordingId?: number } | null)?.recordingId;
  if (!recordingId) {
    throw new Error("Job is missing recordingId in result. Cannot transcribe.");
  }

  const d = db();

  // Load the recording row.
  const [rec] = await d
    .select()
    .from(meetingRecording)
    .where(eq(meetingRecording.recordingId, recordingId))
    .limit(1);

  if (!rec) {
    throw new Error(`Recording ${recordingId} not found.`);
  }

  // Mark step 0 running.
  await updateStep(job.jobId, 0, "running");

  // Resolve the file path from the stored URL.
  // fileUrl is stored as "http://localhost:PORT/uploads/recordings/..." — we only
  // need the part after /uploads/.
  const uploadDir = env().UPLOAD_DIR.replace(/\/$/, "");
  const urlPath = new URL(rec.fileUrl).pathname; // "/uploads/recordings/filename.mp3"
  const relative = urlPath.replace(/^\/uploads\//, ""); // "recordings/filename.mp3"
  const filePath = join(uploadDir, relative);

  // Size check before sending to OpenAI.
  let fileSize: number;
  try {
    const s = await stat(filePath);
    fileSize = s.size;
  } catch {
    await updateStep(job.jobId, 0, "failed");
    throw new Error(`Could not read the recording file. It may have been deleted.`);
  }

  if (fileSize > WHISPER_MAX_BYTES) {
    await updateStep(job.jobId, 0, "failed");
    throw new Error(
      `This recording is too large for transcription (${Math.round(fileSize / 1024 / 1024)} MB). ` +
      `The limit is 25 MB per file.`,
    );
  }

  // Call Whisper.
  const openai = new OpenAI({ apiKey: openaiKey });
  let transcriptText: string;
  try {
    const response = await openai.audio.transcriptions.create({
      file: createReadStream(filePath) as unknown as File,
      model: "whisper-1",
    });
    transcriptText = response.text;
  } catch (err) {
    await updateStep(job.jobId, 0, "failed");
    const msg = err instanceof Error ? err.message : "OpenAI Whisper call failed.";
    throw new Error(`Transcription failed: ${msg}`);
  }

  // Store the transcript on the recording row.
  await d
    .update(meetingRecording)
    .set({ transcript: transcriptText })
    .where(eq(meetingRecording.recordingId, recordingId));

  // Also update the linked meeting's summary so the task-generation flow can use it.
  if (rec.meetingId) {
    await d
      .update(meeting)
      .set({ summary: transcriptText, updatedAt: new Date() })
      .where(eq(meeting.meetingId, rec.meetingId));
  }

  await updateStep(job.jobId, 0, "done");

  log.info(
    { jobId: job.jobId, recordingId, meetingId: rec.meetingId },
    "Transcription complete",
  );
}

// ─── Register at import time ──────────────────────────

registerHandler("transcribe_recording", transcribeRecordingHandler);

export { transcribeRecordingHandler };
