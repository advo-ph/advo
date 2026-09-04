/**
 * Hook for meeting recording CRUD + transcription.
 *
 * Manages:
 *  - uploading an audio file to /api/files/upload (recordings bucket)
 *  - creating a recording row via POST /api/meeting/recordings
 *  - listing recordings for a meeting
 *  - starting a transcription job via POST /api/meeting/recordings/:id/transcribe
 *  - deleting a recording via DELETE /api/meeting/recordings/:id
 */

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export interface MeetingRecording {
  recordingId: number;
  meetingId: number | null;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  transcript: string | null;
  jobId: number | null;
  createdAt: string;
}

// ─── List ─────────────────────────────────────────────

export function useRecordingList(meetingId: number | null) {
  return useQuery<MeetingRecording[]>({
    queryKey: ["recordings", meetingId],
    enabled: meetingId != null,
    queryFn: async () => {
      const res = await get<MeetingRecording[]>(`/api/meeting/recordings?meetingId=${meetingId}`);
      return res.data ?? [];
    },
  });
}

// ─── Mutations ────────────────────────────────────────

export function useRecordingActions() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);

  // Upload audio file + create recording row. Returns the new recording row.
  const uploadRecording = useCallback(
    async (file: File, meetingId: number | null): Promise<MeetingRecording> => {
      setIsUploading(true);
      try {
        // 1. Upload file to storage.
        const form = new FormData();
        form.append("file", file);
        form.append("bucket", "recordings");

        const uploadRes = await fetch("/api/files/upload", {
          method: "POST",
          body: form,
          credentials: "include",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("advo_access_token") ?? ""}`,
          },
        });

        if (!uploadRes.ok) {
          const body = (await uploadRes.json().catch(() => ({ error: "Upload failed" }))) as {
            error?: string;
          };
          throw new Error(body.error ?? "Upload failed");
        }

        const uploadData = (await uploadRes.json()) as {
          data: { url: string; filename: string };
        };

        // 2. Create the recording row.
        const recRes = await post<MeetingRecording>("/api/meeting/recordings", {
          meetingId: meetingId ?? undefined,
          fileUrl: uploadData.data.url,
          fileName: file.name,
          mimeType: file.type,
        });

        if (!recRes.data) throw new Error("Failed to save recording");

        // Invalidate the list for this meeting.
        await qc.invalidateQueries({ queryKey: ["recordings", meetingId] });

        return recRes.data;
      } finally {
        setIsUploading(false);
      }
    },
    [qc],
  );

  // Start transcription job. Returns the jobId.
  const transcribeRecording = useMutation({
    mutationFn: async (recordingId: number) => {
      const res = await post<{ jobId: number }>(
        `/api/meeting/recordings/${recordingId}/transcribe`,
        {},
      );
      if (!res.data) throw new Error("Failed to start transcription");
      return res.data;
    },
    onError: (err: Error) => {
      toast({
        title: "Transcription failed to start",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Delete a recording.
  const deleteRecording = useMutation({
    mutationFn: async ({
      recordingId,
      meetingId,
    }: {
      recordingId: number;
      meetingId: number | null;
    }) => {
      await del(`/api/meeting/recordings/${recordingId}`);
      return meetingId;
    },
    onSuccess: (meetingId) => {
      void qc.invalidateQueries({ queryKey: ["recordings", meetingId] });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not delete recording",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return {
    isUploading,
    uploadRecording,
    transcribeRecording,
    deleteRecording,
  };
}
