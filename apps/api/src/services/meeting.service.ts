/**
 * Shared meeting-list shaping logic.
 *
 * Extracted out of meeting.routes.ts (where it was private) so the Phase 1 read-only MCP
 * tool `list_meetings`/`get_meeting` (apps/api/src/services/mcp-tools.service.ts) can reuse
 * the exact same sort + attendee-join behavior as `GET /api/meeting` without importing a
 * route file into a service. Phase 2's write tools need the same shape, so this lives in its
 * own service file rather than being duplicated a second time.
 */
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import { meeting, meetingAttendee, meetingMember, teamMember, user } from "../db/schema.js";

// Attendee row shape used in the list response. A member marked in the meeting dialog
// (meeting_member) may have no login, so userId is null for them; a legacy self-serve
// join (meeting_attendee) by someone off the roster has no teamMemberId.
export interface AttendeeRow {
  userId: number | null;
  teamMemberId: number | null;
  name: string;
  avatarUrl: string | null;
  joinedAt: string;
}

/** The placeholder the upload flow writes before Whisper has run. */
export const PENDING_TRANSCRIPT = "(transcript pending)";

/** True when a meeting has no real transcript yet (empty, or the upload placeholder). */
export function isPendingTranscript(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  return t === "" || t === PENDING_TRANSCRIPT;
}

/** Sort meetings: upcoming (startsAt in future) soonest-first, then past newest-first. */
export function sortMeetings<T extends { startsAt: Date | null; recordedAt: Date }>(rows: T[]): T[] {
  const now = Date.now();
  const keyOf = (r: T) => (r.startsAt ? r.startsAt.getTime() : r.recordedAt.getTime());
  const isUpcoming = (r: T) => r.startsAt != null && r.startsAt.getTime() > now;
  return [...rows].sort((a, b) => {
    const aUp = isUpcoming(a);
    const bUp = isUpcoming(b);
    if (aUp && !bUp) return -1;
    if (!aUp && bUp) return 1;
    if (aUp && bUp) return keyOf(a) - keyOf(b); // upcoming: soonest first
    return keyOf(b) - keyOf(a); // past: newest first
  });
}

/**
 * Fetch attendees for a list of meeting IDs; group by meetingId.
 *
 * Two sources, merged: members marked in the meeting dialog (meeting_member, 058) and
 * older self-serve joins (meeting_attendee, 041). A person in both appears once.
 */
export async function fetchAttendeeMap(ids: number[]): Promise<Map<number, AttendeeRow[]>> {
  const map = new Map<number, AttendeeRow[]>();
  if (ids.length === 0) return map;
  const d = db();
  const [members, atts] = await Promise.all([
    d
      .select({
        meetingId: meetingMember.meetingId,
        teamMemberId: meetingMember.teamMemberId,
        userId: teamMember.userId,
        joinedAt: meetingMember.createdAt,
        name: teamMember.name,
        avatarUrl: teamMember.avatarUrl,
      })
      .from(meetingMember)
      .innerJoin(teamMember, eq(teamMember.teamMemberId, meetingMember.teamMemberId))
      .where(inArray(meetingMember.meetingId, ids))
      .orderBy(teamMember.name),
    d
      .select({
        meetingId: meetingAttendee.meetingId,
        userId: meetingAttendee.userId,
        joinedAt: meetingAttendee.joinedAt,
        teamMemberId: teamMember.teamMemberId,
        name: teamMember.name,
        avatarUrl: teamMember.avatarUrl,
        email: user.email,
      })
      .from(meetingAttendee)
      .innerJoin(user, eq(meetingAttendee.userId, user.userId))
      .leftJoin(teamMember, eq(teamMember.userId, user.userId))
      .where(inArray(meetingAttendee.meetingId, ids)),
  ]);

  const seen = new Set<string>();
  const push = (meetingId: number, row: AttendeeRow) => {
    const key = `${meetingId}:${row.teamMemberId != null ? `t${row.teamMemberId}` : `u${row.userId}`}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!map.has(meetingId)) map.set(meetingId, []);
    map.get(meetingId)!.push(row);
  };
  for (const m of members) {
    push(m.meetingId, {
      userId: m.userId ?? null,
      teamMemberId: m.teamMemberId,
      name: m.name,
      avatarUrl: m.avatarUrl ?? null,
      joinedAt: m.joinedAt.toISOString(),
    });
  }
  for (const a of atts) {
    push(a.meetingId, {
      userId: a.userId,
      teamMemberId: a.teamMemberId ?? null,
      name: a.name ?? a.email ?? `User #${a.userId}`,
      avatarUrl: a.avatarUrl ?? null,
      joinedAt: a.joinedAt.toISOString(),
    });
  }
  return map;
}

/**
 * Replace who joined a meeting with exactly `teamMemberIds` (the dialog's members picker).
 *
 * The selection is the truth for team members: anyone not in it is removed, including an
 * older self-serve join (meeting_attendee) by a rostered team member. Joins by people who
 * are not on the roster are left alone; the picker cannot show them.
 */
export async function setMeetingMembers(
  meetingId: number,
  teamMemberIds: number[],
  markedBy: number | null,
): Promise<AttendeeRow[]> {
  const ids = [...new Set(teamMemberIds)];
  await db().transaction(async (tx) => {
    const [row] = await tx
      .select({ meetingId: meeting.meetingId })
      .from(meeting)
      .where(eq(meeting.meetingId, meetingId))
      .limit(1);
    if (!row) throw new HTTPException(404, { message: "Meeting not found" });

    if (ids.length > 0) {
      const known = await tx
        .select({ teamMemberId: teamMember.teamMemberId })
        .from(teamMember)
        .where(inArray(teamMember.teamMemberId, ids));
      if (known.length !== ids.length) {
        throw new HTTPException(400, { message: "Unknown team member" });
      }
    }

    await tx
      .delete(meetingMember)
      .where(
        ids.length > 0
          ? and(eq(meetingMember.meetingId, meetingId), notInArray(meetingMember.teamMemberId, ids))
          : eq(meetingMember.meetingId, meetingId),
      );
    if (ids.length > 0) {
      await tx
        .insert(meetingMember)
        .values(ids.map((teamMemberId) => ({ meetingId, teamMemberId, markedBy })))
        .onConflictDoNothing();
    }

    // Legacy self-serve joins by rostered members who are no longer selected.
    const roster = tx.select({ userId: teamMember.userId }).from(teamMember);
    const unselected = ids.length > 0 ? roster.where(notInArray(teamMember.teamMemberId, ids)) : roster;
    await tx
      .delete(meetingAttendee)
      .where(and(eq(meetingAttendee.meetingId, meetingId), inArray(meetingAttendee.userId, unselected)));
  });
  return (await fetchAttendeeMap([meetingId])).get(meetingId) ?? [];
}
