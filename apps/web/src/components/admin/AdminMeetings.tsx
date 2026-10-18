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
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAdminTeam } from "@/hooks/useAdminTeam";
import { cn } from "@/lib/utils";
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

import { plaudMeetingUrl } from "@/lib/plaud";
import { MeetingTaskPreview } from "./MeetingTaskPreview";
import { useRecordingActions, useRecordingList } from "@/hooks/useRecordings";
import { startPolling } from "@/hooks/useJobPoller";
import { post } from "@/lib/api";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";

interface ProjectOption {
  project_id: number;
  title: string;
  client?: { company_name?: string } | null;
}

interface FormState {
  id: number | null;
  projectId: string;     // empty string = no project
  title: string;
  recordedAt: string;    // datetime-local — for past/transcript
  startsAt: string;      // datetime-local — for scheduled
  location: string;
  audioUrl: string;
  transcript: string;
  memberIds: number[];   // team members who joined (meeting_member)
}

const emptyForm = (): FormState => ({
  id: null,
  projectId: "",
  title: "",
  recordedAt: "",
  startsAt: "",
  location: "",
  audioUrl: "",
  transcript: "",
  memberIds: [],
});

const sameIds = (a: number[], b: number[]) => {
  const set = new Set(a);
  return a.length === b.length && b.every((id) => set.has(id));
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

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
  const {
    meeting,
    isLoading,
    createMeeting,
    updateMeeting,
    deleteMeeting,
    generateTask,
    proposeTask,
    importPlaudMeeting,
    setMeetingMembers,
    isSaving,
    isImporting,
    isGeneratingTask,
  } = useMeeting();
  const { members: team } = useAdminTeam();
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
  // Members already saved on the meeting being edited, to skip a no-op save.
  const [savedMemberIds, setSavedMemberIds] = useState<number[]>([]);
  const [membersOpen, setMembersOpen] = useState(false);
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
  const clientName = (id: number | null) =>
    (id ? projects.find((p) => p.project_id === id)?.client?.company_name : null) ?? "—";

  const withPlaud = useMemo(
    () => meeting.filter((m) => plaudMeetingUrl(m)).length,
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
    setSavedMemberIds([]);
    setMembersOpen(false);
    setDialogOpen(true);
  };

  const openEdit = (m: Meeting) => {
    const memberIds = m.attendees
      .map((a) => a.teamMemberId)
      .filter((id): id is number => id != null);
    setForm({
      id: m.meetingId,
      projectId: m.projectId ? String(m.projectId) : "",
      title: m.title,
      recordedAt: toLocalInput(m.recordedAt),
      startsAt: m.startsAt ? toLocalInput(m.startsAt) : "",
      location: m.location ?? "",
      audioUrl: m.audioUrl ?? "",
      transcript: m.transcript,
      memberIds,
    });
    setSavedMemberIds(memberIds);
    setMembersOpen(false);
    setDialogOpen(true);
  };

  // Active team members, plus anyone already marked who has since left the roster.
  const memberOptions = useMemo(
    () => team.filter((t) => t.is_active || form.memberIds.includes(t.team_member_id)),
    [team, form.memberIds],
  );
  const selectedMembers = memberOptions.filter((t) => form.memberIds.includes(t.team_member_id));
  const toggleMember = (id: number) =>
    setForm((f) => ({
      ...f,
      memberIds: f.memberIds.includes(id) ? f.memberIds.filter((x) => x !== id) : [...f.memberIds, id],
    }));

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
      location: form.location.trim() || null,
      audioUrl: form.audioUrl.trim() || null,
      transcript: form.transcript.trim(),
    };
    try {
      let meetingId = form.id;
      if (meetingId) await updateMeeting(meetingId, input);
      else meetingId = (await createMeeting(input))?.meetingId ?? null;
      if (meetingId && !sameIds(form.memberIds, savedMemberIds)) {
        await setMeetingMembers(meetingId, form.memberIds);
      }
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
        // Phones: the three actions wrap under the title instead of squeezing it to "M".
        className="flex-col items-start sm:flex-row sm:items-center"
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
          <div className="flex flex-wrap gap-2">
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

      <StatStrip cols={3}>
        <Stat label="Meetings" value={String(meeting.length)} />
        <Stat
          label="Upcoming"
          value={String(meeting.filter((m) => m.startsAt && new Date(m.startsAt) > new Date()).length)}
        />
        <Stat label="With transcription" value={String(withPlaud)} />
      </StatStrip>

      <Table>
        <THead>
          <span className="flex-1">Title</span>
          <span className="w-40 hidden md:block">Project</span>
          <span className="w-36 hidden lg:block">Client</span>
          <span className="w-40 hidden sm:block">When</span>
          <span className="w-28 hidden md:block">Links</span>
          <span className="w-24 hidden sm:block">Status</span>
          <span className="w-6 sm:w-16 text-right"></span>
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
              const share = plaudMeetingUrl(m);
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
                    // Phones get a two-line row (title, then date · project) so the title
                    // keeps its width; from sm up it is the usual one-line table row.
                    className="h-auto min-h-11 py-2 sm:h-11 sm:py-0"
                    onClick={() => {
                      const next = isOpen ? null : m.meetingId;
                      setExpandedId(next);
                      if (next) setExpandedRecordingMeetingId(next);
                    }}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block truncate font-medium">
                        {m.title}
                        {/* Publishing is no longer offered here; still say so when a client can see it. */}
                        {m.isVisibleClient && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                            Published
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground tabular-nums sm:hidden">
                        {isUpcomingMeeting ? (
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">Upcoming · </span>
                        ) : null}
                        {fmtWhen(isUpcomingMeeting ? m.startsAt! : m.recordedAt)}
                        {" · "}
                        {m.projectId ? projectTitle(m.projectId) : "No project"}
                      </span>
                    </span>
                    <span className="w-40 truncate text-muted-foreground hidden md:block">
                      {m.projectId ? projectTitle(m.projectId) : "No project"}
                    </span>
                    <span className="w-36 truncate text-muted-foreground text-xs hidden lg:block">
                      {clientName(m.projectId)}
                    </span>
                    <span className="w-40 hidden sm:block text-muted-foreground tabular-nums text-xs">
                      {isUpcomingMeeting
                        ? fmtWhen(m.startsAt!)
                        : fmtWhen(m.recordedAt)}
                    </span>
                    <span
                      className="w-28 hidden md:flex items-center gap-3 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {m.audioUrl ? (
                        <a href={m.audioUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
                          Audio
                        </a>
                      ) : null}
                      {share ? (
                        <a href={share} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
                          Transcriptions
                        </a>
                      ) : null}
                    </span>
                    <span className="w-24 hidden sm:block">
                      {isUpcomingMeeting ? (
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          Upcoming
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Recorded</span>
                      )}
                    </span>
                    <span className="w-6 sm:w-16 flex shrink-0 justify-end text-muted-foreground">
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

                      {/* Who joined — set in the meeting dialog's members picker */}
                      {m.attendees.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">Joined</span>
                          <div className="flex items-center gap-1">
                            {m.attendees.slice(0, 5).map((a) => (
                              <Avatar
                                key={a.teamMemberId != null ? `t${a.teamMemberId}` : `u${a.userId}`}
                                className="h-6 w-6"
                                title={a.name}
                              >
                                <AvatarImage src={a.avatarUrl ?? undefined} alt={a.name} />
                                <AvatarFallback className="text-[10px]">
                                  {initials(a.name)}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                            {m.attendees.length > 5 && (
                              <span className="text-xs text-muted-foreground">
                                +{m.attendees.length - 5}
                              </span>
                            )}
                          </div>
                          <span className="min-w-0 truncate text-xs text-muted-foreground">
                            {m.attendees.map((a) => a.name).join(", ")}
                          </span>
                        </div>
                      )}

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
          {/* min-w-0: DialogContent is a grid; without it the open members list's
              min-content width widens the column past a 390px screen. */}
          <div className="min-w-0 space-y-3">
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
              <span id="meeting-members-label" className="text-xs text-muted-foreground block mb-1">
                Who joined (optional)
              </span>
              <button
                type="button"
                aria-labelledby="meeting-members-label"
                aria-expanded={membersOpen}
                aria-controls="meeting-members-list"
                onClick={() => setMembersOpen((o) => !o)}
                className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                {selectedMembers.length === 0 ? (
                  <span className="text-muted-foreground">Select members</span>
                ) : (
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex shrink-0 gap-0.5">
                      {selectedMembers.slice(0, 3).map((t) => (
                        <Avatar key={t.team_member_id} className="h-5 w-5">
                          <AvatarImage src={t.avatar_url ?? undefined} alt="" />
                          <AvatarFallback className="text-[9px]">{initials(t.name)}</AvatarFallback>
                        </Avatar>
                      ))}
                    </span>
                    <span className="truncate">
                      {selectedMembers.length <= 2
                        ? selectedMembers.map((t) => t.name).join(", ")
                        : `${selectedMembers[0].name} +${selectedMembers.length - 1} more`}
                    </span>
                  </span>
                )}
                <ChevronDown
                  className={cn("h-4 w-4 shrink-0 opacity-50 transition-transform", membersOpen && "rotate-180")}
                />
              </button>
              {membersOpen && (
                <div
                  id="meeting-members-list"
                  role="listbox"
                  aria-multiselectable="true"
                  aria-labelledby="meeting-members-label"
                  className="mt-1 max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border"
                >
                  {memberOptions.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">No team members yet.</p>
                  ) : (
                    memberOptions.map((t) => {
                      const isOn = form.memberIds.includes(t.team_member_id);
                      return (
                        <button
                          key={t.team_member_id}
                          type="button"
                          role="option"
                          aria-selected={isOn}
                          onClick={() => toggleMember(t.team_member_id)}
                          className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left hover:bg-secondary/40 focus:bg-secondary/40 focus:outline-none"
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary",
                              isOn ? "bg-primary text-primary-foreground" : "bg-background",
                            )}
                          >
                            {isOn && <Check className="h-3 w-3" />}
                          </span>
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={t.avatar_url ?? undefined} alt="" />
                            <AvatarFallback className="text-[10px]">{initials(t.name)}</AvatarFallback>
                          </Avatar>
                          {/* The name keeps its width; the role only gets what is left. */}
                          <span className="min-w-0 truncate text-sm">{t.name}</span>
                          <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">
                            {t.role}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
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
              <span className="text-xs text-muted-foreground block mb-1">Audio link (optional)</span>
              <Input
                type="url"
                placeholder="Google Drive link to the recording"
                value={form.audioUrl}
                onChange={(e) => setForm((f) => ({ ...f, audioUrl: e.target.value }))}
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
