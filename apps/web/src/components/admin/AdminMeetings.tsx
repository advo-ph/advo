import { useMemo, useState, useRef, useCallback } from "react";
import {
  Trash2,
  Mic,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Sparkles,
  Loader2,
  Upload,
  FileAudio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, StatStrip, Stat, Table, THead, TBody, TRow, Empty } from "./_ui";
import {
  useMeeting,
  usePlaudFile,
  usePlaudSync,
  type Meeting,
  type MeetingInput,
  type ProposeTaskResult,
} from "@/hooks/useMeeting";

import { plaudShareUrl } from "@/lib/plaud";
import { MeetingTaskPreview } from "./MeetingTaskPreview";
import { useRecordingActions, useRecordingList } from "@/hooks/useRecordings";
import { startPolling } from "@/hooks/useJobPoller";
import { post } from "@/lib/api";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";

interface ProjectOption {
  project_id: number;
  title: string;
}

interface FormState {
  id: number | null;
  projectId: string;     // empty string = no project
  title: string;
  recordedAt: string;    // datetime-local — for past/transcript
  startsAt: string;      // datetime-local — for scheduled
  endsAt: string;        // datetime-local — optional end
  location: string;
  transcript: string;
}

const emptyForm = (): FormState => ({
  id: null,
  projectId: "",
  title: "",
  recordedAt: "",
  startsAt: "",
  endsAt: "",
  location: "",
  transcript: "",
});

/** ISO → datetime-local value (local wall clock). */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** datetime-local → ISO string. */
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : "");

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const AdminMeetings = ({ projects }: { projects: ProjectOption[] }) => {
  const { user } = useAuth();
  const {
    meeting,
    isLoading,
    createMeeting,
    updateMeeting,
    deleteMeeting,
    generateTask,
    proposeTask,
    importPlaudMeeting,
    joinMeeting,
    leaveMeeting,
    isSaving,
    isImporting,
    isGeneratingTask,
    isJoining,
  } = useMeeting();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importProjectId, setImportProjectId] = useState("");
  const [importRef, setImportRef] = useState("");
  const [importQuery, setImportQuery] = useState("advo");
  const [browseOpen, setBrowseOpen] = useState(false);
  const { data: plaudFile = [], isLoading: isPlaudLoading, error: plaudError, refetch: refetchPlaud } =
    usePlaudFile(importQuery, importOpen && browseOpen);
  const { status: plaudSync, syncNow, isSyncing } = usePlaudSync();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [proposal, setProposal] = useState<ProposeTaskResult | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // Recording state
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [uploadProjectId, setUploadProjectId] = useState<string>("");
  const [uploadPickerOpen, setUploadPickerOpen] = useState(false);
  const [expandedRecordingMeetingId, setExpandedRecordingMeetingId] = useState<number | null>(null);
  const [deleteRecordingTarget, setDeleteRecordingTarget] = useState<{
    recordingId: number;
    meetingId: number | null;
    fileName: string;
  } | null>(null);
  const [transcriptViewContent, setTranscriptViewContent] = useState<string | null>(null);

  const { isUploading, uploadRecording, transcribeRecording, deleteRecording } =
    useRecordingActions();

  const { data: recordingsForExpanded = [] } = useRecordingList(expandedRecordingMeetingId);

  const handleAudioFileSelected = useCallback(
    async (file: File) => {
      if (!uploadProjectId) return;
      // Create a bare meeting row for this recording.
      const res = await post<{ meetingId: number }>("/api/meeting", {
        projectId: Number(uploadProjectId),
        title: file.name.replace(/\.[^.]+$/, ""),
        recordedAt: new Date().toISOString(),
        transcript: "(transcript pending)",
      });
      const meetingId = res.data?.meetingId ?? null;
      await uploadRecording(file, meetingId);
      setUploadPickerOpen(false);
      setUploadProjectId("");
    },
    [uploadProjectId, uploadRecording],
  );

  const projectTitle = (id: number) =>
    projects.find((p) => p.project_id === id)?.title ?? `Project #${id}`;

  const withPlaud = useMemo(
    () => meeting.filter((m) => m.plaudShareKey).length,
    [meeting],
  );

  // Split meetings into upcoming (startsAt in future) and past buckets.
  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const u: Meeting[] = [];
    const p: Meeting[] = [];
    for (const m of meeting) {
      if (m.startsAt && new Date(m.startsAt).getTime() > now) u.push(m);
      else p.push(m);
    }
    u.sort((a, b) => new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime());
    return { upcoming: u, past: p };
  }, [meeting]);

  const openCreate = () => {
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (m: Meeting) => {
    setForm({
      id: m.meetingId,
      projectId: m.projectId ? String(m.projectId) : "",
      title: m.title,
      recordedAt: toLocalInput(m.recordedAt),
      startsAt: m.startsAt ? toLocalInput(m.startsAt) : "",
      endsAt: m.endsAt ? toLocalInput(m.endsAt) : "",
      location: m.location ?? "",
      transcript: m.transcript,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    // Title is always required. At least one date field must be set.
    if (!form.title.trim() || (!form.startsAt && !form.recordedAt)) {
      return;
    }
    const input: MeetingInput = {
      projectId: form.projectId ? Number(form.projectId) : null,
      title: form.title.trim(),
      recordedAt: form.recordedAt ? fromLocalInput(form.recordedAt) : undefined,
      startsAt: form.startsAt ? fromLocalInput(form.startsAt) : null,
      endsAt: form.endsAt ? fromLocalInput(form.endsAt) : null,
      location: form.location.trim() || null,
      transcript: form.transcript.trim(),
    };
    try {
      if (form.id) await updateMeeting(form.id, input);
      else await createMeeting(input);
      setDialogOpen(false);
    } catch {
      // Hook surfaces the toast.
    }
  };

  const runImport = async (fileId?: string, shareUrl?: string) => {
    if (!importProjectId) return;
    const ref = importRef.trim();
    const result = await importPlaudMeeting({
      projectId: Number(importProjectId),
      fileId: fileId ?? (/^[a-f0-9]{24,64}$/i.test(ref) ? ref : undefined),
      shareUrl: shareUrl ?? (ref && !/^[a-f0-9]{24,64}$/i.test(ref) ? ref : undefined),
    });
    setImportOpen(false);
    setImportRef("");
    if (result.meeting?.meetingId) await openPropose(result.meeting.meetingId);
  };

  const handleDelete = async () => {
    if (!form.id) return;
    try {
      await deleteMeeting(form.id);
      setDialogOpen(false);
    } catch {
      // Hook surfaces the toast.
    }
  };

  const openPropose = async (meetingId: number) => {
    setGeneratingId(meetingId);
    try {
      const next = await proposeTask(meetingId);
      setProposal(next);
    } catch {
      // toast from hook
    } finally {
      setGeneratingId(null);
    }
  };

  const confirmPropose = async () => {
    if (!proposal) return;
    setIsConfirming(true);
    try {
      await generateTask(proposal.meetingId, proposal.task, proposal.method);
      setProposal(null);
    } catch {
      // toast from hook
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Meetings"
        meta={
          isLoading
            ? "loading…"
            : `${meeting.length} meeting${meeting.length === 1 ? "" : "s"}${
                plaudSync?.lastSyncAt
                  ? ` · folder ${plaudSync.isEnabled ? "watching" : "idle"}`
                  : plaudSync?.isEnabled
                    ? " · watching Transcriptions"
                    : ""
              }`
        }
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-1.5"
              disabled={isSyncing}
              onClick={() =>
                void syncNow().then((s) => {
                  const id = s.importedMeetingId?.[0];
                  if (id) return openPropose(id);
                })
              }
            >
              {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Sync transcriptions
            </Button>
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-9 gap-1.5">
                  Import from Transcriptions
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Import from Transcriptions</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">Project</span>
                    <Select
                      value={importProjectId || undefined}
                      onValueChange={setImportProjectId}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.project_id} value={String(p.project_id)}>
                            {p.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    placeholder="File id or share URL"
                    value={importRef}
                    onChange={(e) => setImportRef(e.target.value)}
                    className="h-9"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => {
                      setBrowseOpen(true);
                      void refetchPlaud();
                    }}
                  >
                    Browse ADVO folder
                  </Button>
                  {browseOpen && (
                    <div className="max-h-56 overflow-y-auto rounded-md border border-border divide-y divide-border">
                      {isPlaudLoading ? (
                        <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                        </p>
                      ) : plaudError ? (
                        <p className="p-3 text-sm text-destructive">
                          {(plaudError as Error).message}
                        </p>
                      ) : plaudFile.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">
                          No recordings named "{importQuery}".
                        </p>
                      ) : (
                        plaudFile.map((f) => (
                          <button
                            key={f.fileId}
                            type="button"
                            disabled={isImporting || !importProjectId}
                            onClick={() => void runImport(f.fileId)}
                            className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-secondary/40 disabled:opacity-50"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{f.name}</p>
                              <p className="text-[10px] tabular-nums text-muted-foreground">
                                {f.startAt
                                  ? new Date(f.startAt).toLocaleDateString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    })
                                  : f.fileId.slice(0, 8)}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  {browseOpen && (
                    <Input
                      placeholder="Folder / name filter"
                      value={importQuery}
                      onChange={(e) => setImportQuery(e.target.value)}
                      className="h-8 text-xs"
                    />
                  )}
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => setImportOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-9 bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={isImporting || !importProjectId || !importRef.trim()}
                    onClick={() => void runImport()}
                  >
                    {isImporting ? "Importing…" : "Import"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button
              size="sm"
              className="h-9 bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
              onClick={() => setUploadPickerOpen(true)}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Upload recording
            </Button>
          </div>
        }
      />

      {/* Hidden audio file input */}
      <input
        ref={audioInputRef}
        type="file"
        accept=".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a,audio/mp3,audio/m4a"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleAudioFileSelected(f);
          e.target.value = "";
        }}
      />

      {/* Upload recording dialog — pick project then file */}
      <Dialog open={uploadPickerOpen} onOpenChange={setUploadPickerOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Upload recording</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Project</span>
              <Select value={uploadProjectId || undefined} onValueChange={setUploadProjectId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.project_id} value={String(p.project_id)}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Accepts mp3 and m4a files up to 500 MB.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => setUploadPickerOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-9 bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!uploadProjectId}
              onClick={() => audioInputRef.current?.click()}
            >
              Choose file
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StatStrip cols={4}>
        <Stat label="Meetings" value={String(meeting.length)} />
        <Stat
          label="Upcoming"
          value={String(meeting.filter((m) => m.startsAt && new Date(m.startsAt) > new Date()).length)}
        />
        <Stat label="Published" value={String(meeting.filter((m) => m.isVisibleClient).length)} />
        <Stat label="With transcription" value={String(withPlaud)} />
      </StatStrip>

      <Table>
        <THead>
          <span className="flex-1">Title</span>
          <span className="w-40 hidden md:block">Project</span>
          <span className="w-40">When</span>
          <span className="w-24">Status</span>
          <span className="w-16 text-right"></span>
        </THead>
        <TBody>
          {meeting.length === 0 ? (
            <Empty
              text="No meetings yet. Upload a recording or import from Transcriptions to get started."
              icon={Mic}
            />
          ) : (
            [...upcoming, ...past].map((m, idx) => {
              const isOpen = expandedId === m.meetingId;
              const share = plaudShareUrl(m.plaudShareKey);
              const isUpcomingMeeting = m.startsAt && new Date(m.startsAt).getTime() > Date.now();
              // Show divider before the first past meeting when both groups are non-empty.
              const showDivider = upcoming.length > 0 && past.length > 0 && idx === upcoming.length;
              return (
                <div key={m.meetingId}>
                  {showDivider && (
                    <div className="px-4 py-1 text-[10px] uppercase tracking-widest text-muted-foreground border-t border-border">
                      Past meetings
                    </div>
                  )}
                  <TRow
                    onClick={() => {
                      const next = isOpen ? null : m.meetingId;
                      setExpandedId(next);
                      if (next) setExpandedRecordingMeetingId(next);
                    }}
                  >
                    <span className="flex-1 min-w-0 truncate font-medium">
                      {m.title}
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {m.isVisibleClient ? "Published" : "Internal"}
                      </span>
                    </span>
                    <span className="w-40 truncate text-muted-foreground hidden md:block">
                      {m.projectId ? projectTitle(m.projectId) : "No project"}
                    </span>
                    <span className="w-40 text-muted-foreground tabular-nums text-xs">
                      {isUpcomingMeeting
                        ? fmtWhen(m.startsAt!)
                        : fmtWhen(m.recordedAt)}
                    </span>
                    <span className="w-24">
                      {isUpcomingMeeting ? (
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          Upcoming
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Recorded</span>
                      )}
                    </span>
                    <span className="w-16 flex justify-end text-muted-foreground">
                      {isOpen ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </span>
                  </TRow>
                  {isOpen && (
                    <div className="border-t border-border bg-secondary/20 px-4 py-3 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => openEdit(m)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() =>
                            void updateMeeting(m.meetingId, {
                              isVisibleClient: !m.isVisibleClient,
                            })
                          }
                        >
                          {m.isVisibleClient ? "Unpublish" : "Publish to client"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={
                            isGeneratingTask ||
                            (!m.transcript?.trim() && !m.summary?.trim()) ||
                            generatingId === m.meetingId
                          }
                          onClick={() => void openPropose(m.meetingId)}
                        >
                          {generatingId === m.meetingId ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Generate tasks
                        </Button>
                        {share && (
                          <a
                            href={share}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                          >
                            Transcription <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>

                      {/* Join / Leave + attendee avatars */}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={isJoining}
                          onClick={() => {
                            const alreadyJoined = m.attendees.some((a) => a.userId === user?.userId);
                            void (alreadyJoined ? leaveMeeting(m.meetingId) : joinMeeting(m.meetingId));
                          }}
                        >
                          {m.attendees.some((a) => a.userId === user?.userId) ? "Leave" : "Join"}
                        </Button>
                        {m.attendees.length > 0 && (
                          <div className="flex items-center gap-1">
                            {m.attendees.slice(0, 5).map((a) => (
                              <Avatar key={a.userId} className="h-6 w-6" title={a.name}>
                                <AvatarImage src={a.avatarUrl ?? undefined} alt={a.name} />
                                <AvatarFallback className="text-[10px]">
                                  {a.name.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                            {m.attendees.length > 5 && (
                              <span className="text-xs text-muted-foreground">
                                +{m.attendees.length - 5}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {m.summary?.trim() && (
                        <div className="whitespace-pre-wrap text-sm text-foreground/90 max-h-40 overflow-y-auto rounded-md border border-border bg-card p-3">
                          {m.summary}
                        </div>
                      )}
                      {m.transcript.trim() ? (
                        <pre className="whitespace-pre-wrap text-sm text-foreground/90 font-sans max-h-64 overflow-y-auto rounded-md border border-border bg-card p-3">
                          {m.transcript}
                        </pre>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No transcript yet.</p>
                      )}

                      {/* Recordings for this meeting */}
                      <RecordingList
                        meetingId={m.meetingId}
                        recordings={expandedRecordingMeetingId === m.meetingId ? recordingsForExpanded : []}
                        onTranscribe={async (recId) => {
                          const result = await transcribeRecording.mutateAsync(recId);
                          startPolling();
                          return result;
                        }}
                        onDelete={(recId, fileName) =>
                          setDeleteRecordingTarget({ recordingId: recId, meetingId: m.meetingId, fileName })
                        }
                        onViewTranscript={(text) => setTranscriptViewContent(text)}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </TBody>
      </Table>

      <MeetingTaskPreview
        proposal={proposal}
        isConfirming={isConfirming}
        onClose={() => setProposal(null)}
        onConfirm={() => void confirmPropose()}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit meeting" : "Schedule or record a meeting"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Title (e.g. Felici kickoff)"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus
            />

            <div>
              <span className="text-xs text-muted-foreground block mb-1">Project (optional)</span>
              <Select
                value={form.projectId || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, projectId: v }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select project (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.project_id} value={String(p.project_id)}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <span className="text-xs text-muted-foreground block mb-1">Date</span>
              <Input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                className="h-9"
              />
            </div>

            <div>
              <span className="text-xs text-muted-foreground block mb-1">End time (optional)</span>
              <Input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                className="h-9"
              />
            </div>

            <div>
              <span className="text-xs text-muted-foreground block mb-1">Location (optional)</span>
              <Input
                placeholder="e.g. Zoom, Office"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                className="h-9"
              />
            </div>

            <div>
              <span className="text-xs text-muted-foreground block mb-1">Recorded at (optional)</span>
              <Input
                type="datetime-local"
                value={form.recordedAt}
                onChange={(e) => setForm((f) => ({ ...f, recordedAt: e.target.value }))}
                className="h-9"
              />
            </div>

            <div>
              <span className="text-xs text-muted-foreground block mb-1">Transcript / notes (optional)</span>
              <Textarea
                placeholder="Paste transcript or type minutes…"
                value={form.transcript}
                onChange={(e) => setForm((f) => ({ ...f, transcript: e.target.value }))}
                className="min-h-[160px] text-sm"
              />
            </div>

          </div>

          <DialogFooter className="gap-2 sm:gap-0 sm:justify-between">
            {form.id ? (
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-destructive hover:bg-destructive/10"
                onClick={handleDelete}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-9 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleSave}
                disabled={
                  isSaving ||
                  !form.title.trim() ||
                  (!form.startsAt && !form.recordedAt)
                }
              >
                {isSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete recording confirmation */}
      <ConfirmDeleteDialog
        open={deleteRecordingTarget != null}
        onOpenChange={(v) => { if (!v) setDeleteRecordingTarget(null); }}
        noun="recording"
        name={deleteRecordingTarget?.fileName ?? ""}
        onConfirm={() => {
          if (!deleteRecordingTarget) return;
          deleteRecording.mutate({
            recordingId: deleteRecordingTarget.recordingId,
            meetingId: deleteRecordingTarget.meetingId,
          });
          setDeleteRecordingTarget(null);
        }}
      />

      {/* Transcript view dialog */}
      <Dialog open={transcriptViewContent != null} onOpenChange={(v) => { if (!v) setTranscriptViewContent(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transcript</DialogTitle>
          </DialogHeader>
          <pre className="whitespace-pre-wrap text-sm text-foreground/90 font-sans leading-relaxed">
            {transcriptViewContent}
          </pre>
        </DialogContent>
      </Dialog>

    </div>
  );
};

// ─── Recording list sub-component ────────────────────

interface RecordingListProps {
  meetingId: number;
  recordings: import("@/hooks/useRecordings").MeetingRecording[];
  onTranscribe: (recordingId: number) => Promise<{ jobId: number }>;
  onDelete: (recordingId: number, fileName: string) => void;
  onViewTranscript: (text: string) => void;
}

function RecordingList({
  recordings,
  onTranscribe,
  onDelete,
  onViewTranscript,
}: RecordingListProps) {
  const [transcribingIds, setTranscribingIds] = useState<Set<number>>(new Set());

  if (recordings.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Recordings</p>
      {recordings.map((rec) => {
        const isRunning = transcribingIds.has(rec.recordingId);
        return (
          <div
            key={rec.recordingId}
            className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
          >
            <FileAudio className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{rec.fileName}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {new Date(rec.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {rec.transcript ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => onViewTranscript(rec.transcript!)}
                >
                  View transcript
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={isRunning || rec.jobId != null}
                  onClick={async () => {
                    setTranscribingIds((prev) => new Set(prev).add(rec.recordingId));
                    try {
                      await onTranscribe(rec.recordingId);
                    } finally {
                      setTranscribingIds((prev) => {
                        const next = new Set(prev);
                        next.delete(rec.recordingId);
                        return next;
                      });
                    }
                  }}
                >
                  {isRunning ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : null}
                  {isRunning ? "Starting…" : "Transcribe"}
                </Button>
              )}
              <button
                className="rounded-md p-1 text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Delete recording"
                onClick={() => onDelete(rec.recordingId, rec.fileName)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default AdminMeetings;
