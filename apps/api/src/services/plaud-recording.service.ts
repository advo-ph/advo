/**
 * One Plaud recording → one meeting, read through a named grant. Shared by the
 * poller (recordings it routes itself) and the chat (a recording the owner files
 * by hand after "New client" or "Existing project"), so both land the same way:
 * the meeting, then the corpus source.
 */
import { HTTPException } from "hono/http-exception";
import { recordError } from "../utils/error-capture.js";
import { createLogger } from "../utils/logger.js";
import { extract, ingestBundle } from "./corpus.service.js";
import { importPlaudMeeting } from "./plaud-import.service.js";
import { getOpenFileDetail, openTokenFilePaths } from "./plaud-open.service.js";
import { payloadFromDetail, type PlaudPayload } from "./plaud.service.js";

const log = createLogger("plaud-recording");

/**
 * A routed meeting also lands in the corpus, as POST /api/corpus/ingest/plaud does
 * for a share link: facts, terms and actions with the transcript as the body.
 * Off with PLAUD_CORPUS_INGEST=0. A failure here never undoes the meeting.
 */
export async function ingestToCorpus(
  payload: PlaudPayload,
  fileId: string,
  projectId: number | null,
  meetingId: number | null,
  createdBy: number | null,
  via = "plaud-open-poll",
): Promise<void> {
  if (process.env.PLAUD_CORPUS_INGEST === "0") return;
  try {
    const extraction = await extract(payload.transcript, payload.recordedAt);
    await ingestBundle(
      {
        source: {
          kind: "plaud",
          externalId: fileId,
          url: `https://web.plaud.ai/file/${fileId}`,
          title: payload.title,
          occurredAt: payload.recordedAt,
          summary: extraction.summary ?? payload.summary ?? null,
          body: payload.transcript,
          projectId,
          meta: { extractionMethod: extraction.method, meetingId, via },
        },
        fact: extraction.fact,
        term: extraction.term,
        action: extraction.action,
      },
      createdBy,
    );
  } catch (err) {
    recordError("plaud-corpus", err);
    log.warn({ err, fileId }, "corpus ingest of a Plaud meeting failed; meeting kept");
  }
}

/**
 * Import one recording into a project. The grant must be one this box polls:
 * the chat stores it in a message's context, and only a listed token file is read.
 */
export async function importRecording(input: {
  fileId: string;
  grant: string;
  projectId: number;
  createdBy: number | null;
}) {
  if (!openTokenFilePaths().includes(input.grant)) {
    throw new HTTPException(400, { message: "That Plaud account is not linked" });
  }
  const payload = payloadFromDetail(await getOpenFileDetail(input.fileId, input.grant), null);
  const result = await importPlaudMeeting({
    projectId: input.projectId,
    fileId: input.fileId,
    createdBy: input.createdBy,
    payload,
  });
  if (result.created) {
    await ingestToCorpus(payload, input.fileId, input.projectId, result.meeting?.meetingId ?? null, input.createdBy, "plaud-chat");
  }
  return result;
}
