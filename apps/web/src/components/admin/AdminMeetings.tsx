import { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Mic,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, StatStrip, Stat, Table, THead, TBody, TRow, Empty } from "./_ui";
import { useMeeting, type Meeting, type MeetingInput } from "@/hooks/useMeeting";

interface ProjectOption {
  project_id: number;
  title: string;
}

interface FormState {
  id: number | null;
  projectId: string;
  title: string;
  recordedAt: string; // datetime-local
  transcript: string;
  plaudShareKey: string;
}

const emptyForm = (): FormState => ({
  id: null,
  projectId: "",
  title: "",
  recordedAt: "",
  transcript: "",
  plaudShareKey: "",
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

const plaudUrl = (key: string | null) =>
  key ? `https://app.plaud.ai/share/${encodeURIComponent(key)}` : null;

const AdminMeetings = ({ projects }: { projects: ProjectOption[] }) => {
  const {
    meeting,
    isLoading,
    createMeeting,
    updateMeeting,
    deleteMeeting,
    generateTask,
    isSaving,
    isGeneratingTask,
  } = useMeeting();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  const projectTitle = (id: number) =>
    projects.find((p) => p.project_id === id)?.title ?? `Project #${id}`;

  const withPlaud = useMemo(
    () => meeting.filter((m) => m.plaudShareKey).length,
    [meeting],
  );

  const openCreate = () => {
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (m: Meeting) => {
    setForm({
      id: m.meetingId,
      projectId: String(m.projectId),
      title: m.title,
      recordedAt: toLocalInput(m.recordedAt),
      transcript: m.transcript,
      plaudShareKey: m.plaudShareKey ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.projectId || !form.recordedAt || !form.transcript.trim()) {
      return;
    }
    const input: MeetingInput = {
      projectId: Number(form.projectId),
      title: form.title.trim(),
      recordedAt: fromLocalInput(form.recordedAt),
      transcript: form.transcript.trim(),
      plaudShareKey: form.plaudShareKey.trim() || null,
    };
    try {
      if (form.id) await updateMeeting(form.id, input);
      else await createMeeting(input);
      setDialogOpen(false);
    } catch {
      // Hook surfaces the toast.
    }
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Meetings"
        meta={isLoading ? "loading…" : `${meeting.length} MoM record${meeting.length === 1 ? "" : "s"}`}
        action={
          <Button
            size="sm"
            className="h-9 bg-accent text-accent-foreground hover:bg-accent/90 gap-1.5"
            onClick={openCreate}
          >
            <Plus className="h-4 w-4" /> New MoM
          </Button>
        }
      />

      <StatStrip cols={3}>
        <Stat label="Meetings" value={String(meeting.length)} />
        <Stat label="With Plaud link" value={String(withPlaud)} />
        <Stat
          label="Projects covered"
          value={String(new Set(meeting.map((m) => m.projectId)).size)}
        />
      </StatStrip>

      <Table>
        <THead>
          <span className="flex-1">Title</span>
          <span className="w-40 hidden md:block">Project</span>
          <span className="w-40">Recorded</span>
          <span className="w-16 text-right">MoM</span>
        </THead>
        <TBody>
          {meeting.length === 0 ? (
            <Empty
              text="No meeting minutes yet — paste a Plaud transcript or type MoM notes for a project."
              icon={Mic}
            />
          ) : (
            meeting.map((m) => {
              const isOpen = expandedId === m.meetingId;
              const share = plaudUrl(m.plaudShareKey);
              return (
                <div key={m.meetingId}>
                  <TRow
                    onClick={() =>
                      setExpandedId(isOpen ? null : m.meetingId)
                    }
                  >
                    <span className="flex-1 min-w-0 truncate font-medium">{m.title}</span>
                    <span className="w-40 truncate text-muted-foreground hidden md:block">
                      {projectTitle(m.projectId)}
                    </span>
                    <span className="w-40 text-muted-foreground tabular-nums text-xs">
                      {fmtWhen(m.recordedAt)}
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
                          disabled={
                            isGeneratingTask ||
                            !m.transcript?.trim() ||
                            generatingId === m.meetingId
                          }
                          onClick={async () => {
                            setGeneratingId(m.meetingId);
                            try {
                              await generateTask(m.meetingId);
                            } catch {
                              // toast from hook
                            } finally {
                              setGeneratingId(null);
                            }
                          }}
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
                            Plaud <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      <pre className="whitespace-pre-wrap text-sm text-foreground/90 font-sans max-h-64 overflow-y-auto rounded-md border border-border bg-card p-3">
                        {m.transcript}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </TBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit meeting" : "New meeting MoM"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Title (e.g. Felici kickoff)"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus
            />

            <div>
              <span className="eyebrow block mb-1">Project</span>
              <Select
                value={form.projectId}
                onValueChange={(v) => setForm((f) => ({ ...f, projectId: v }))}
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

            <div>
              <span className="eyebrow block mb-1">Recorded at</span>
              <Input
                type="datetime-local"
                value={form.recordedAt}
                onChange={(e) => setForm((f) => ({ ...f, recordedAt: e.target.value }))}
                className="h-9"
              />
            </div>

            <div>
              <span className="eyebrow block mb-1">Transcript / MoM</span>
              <Textarea
                placeholder="Paste Plaud transcript or type minutes…"
                value={form.transcript}
                onChange={(e) => setForm((f) => ({ ...f, transcript: e.target.value }))}
                className="min-h-[160px] text-sm"
              />
            </div>

            <Input
              placeholder="Plaud share key (optional)"
              value={form.plaudShareKey}
              onChange={(e) => setForm((f) => ({ ...f, plaudShareKey: e.target.value }))}
              className="h-9"
            />
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
                className="h-9 bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={handleSave}
                disabled={
                  isSaving ||
                  !form.title.trim() ||
                  !form.projectId ||
                  !form.recordedAt ||
                  !form.transcript.trim()
                }
              >
                {isSaving ? "Saving…" : form.id ? "Save" : "Create"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminMeetings;
