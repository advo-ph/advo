import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
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
import { PageHeader } from "@/components/admin/_ui";
import { useCalendar, manualEventId, type CalEvent, type NewEvent } from "@/hooks/useCalendar";

/* Category → colour + label. Manual categories first, then derived sources. */
const CATEGORY: Record<string, { label: string; dot: string }> = {
  meeting: { label: "Meeting", dot: "bg-blue-500" },
  deadline: { label: "Deadline", dot: "bg-red-500" },
  moa: { label: "MOA", dot: "bg-purple-500" },
  bir: { label: "BIR", dot: "bg-amber-500" },
  content: { label: "Content", dot: "bg-green-500" },
  social: { label: "Social", dot: "bg-pink-500" },
  cold_email: { label: "Cold email", dot: "bg-cyan-500" },
  event: { label: "Event", dot: "bg-accent" },
  deliverable: { label: "Deliverable", dot: "bg-orange-400" },
  invoice_due: { label: "Invoice due", dot: "bg-red-400" },
  invoice_paid: { label: "Invoice paid", dot: "bg-emerald-500" },
  kickoff: { label: "Kickoff", dot: "bg-sky-400" },
  social_scheduled: { label: "Post scheduled", dot: "bg-pink-400" },
  social_published: { label: "Post published", dot: "bg-fuchsia-600" },
  contract_signed: { label: "Contract signed", dot: "bg-teal-500" },
  contract_expires: { label: "Contract expires", dot: "bg-rose-500" },
  bir_deadline: { label: "BIR (auto)", dot: "bg-amber-600" },
};
const cat = (k: string) => CATEGORY[k] ?? { label: k, dot: "bg-muted-foreground" };

// Read-only detail hint: source → the page that owns the underlying record.
const SOURCE_NOUN: Record<string, string> = {
  deliverable: "deliverables",
  invoice: "invoices",
  project: "projects",
  social: "social posts",
  contract: "contracts",
};

// Manual categories selectable in the dialog (must match the API enum).
const MANUAL_CATS = ["meeting", "deadline", "moa", "bir", "content", "social", "cold_email", "event"];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = dayKey(new Date());

interface FormState {
  id: number | null; // null = create
  title: string;
  category: string;
  date: string; // YYYY-MM-DD
  allDay: boolean;
  startTime: string; // HH:MM
  endTime: string;
  location: string;
  description: string;
}

const emptyForm = (date: string): FormState => ({
  id: null,
  title: "",
  category: "meeting",
  date,
  allDay: false,
  startTime: "09:00",
  endTime: "10:00",
  location: "",
  description: "",
});

const AdminCalendar = () => {
  const [cursor, setCursor] = useState(() => new Date());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(todayKey));
  const [detail, setDetail] = useState<CalEvent | null>(null);

  // 6-week grid starting on the Sunday on/before the 1st.
  const cells = useMemo(() => {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = new Date(monthStart);
    gridStart.setDate(1 - monthStart.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [cursor]);

  const rangeFrom = cells[0];
  const rangeTo = useMemo(() => {
    const d = new Date(cells[41]);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [cells]);

  const { events, isLoading, createEvent, updateEvent, deleteEvent, isMutating } = useCalendar(
    rangeFrom,
    rangeTo,
  );

  const byDay = useMemo(() => {
    const m: Record<string, CalEvent[]> = {};
    for (const e of events) {
      if (hidden.has(e.category)) continue;
      const k = dayKey(new Date(e.start));
      (m[k] ||= []).push(e);
    }
    return m;
  }, [events, hidden]);

  const presentCategories = useMemo(() => {
    const seen = new Set<string>();
    for (const e of events) seen.add(e.category);
    // stable order by the CATEGORY map
    return Object.keys(CATEGORY).filter((k) => seen.has(k));
  }, [events]);

  const openCreate = (date: string) => {
    setForm(emptyForm(date));
    setDialogOpen(true);
  };

  const openEdit = (e: CalEvent) => {
    const d = new Date(e.start);
    const end = e.end ? new Date(e.end) : null;
    setForm({
      id: manualEventId(e.id),
      title: e.title,
      category: MANUAL_CATS.includes(e.category) ? e.category : "event",
      date: dayKey(d),
      allDay: e.allDay,
      startTime: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      endTime: end ? `${pad(end.getHours())}:${pad(end.getMinutes())}` : "",
      location: e.location ?? "",
      description: e.description ?? "",
    });
    setDialogOpen(true);
  };

  const toIso = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();

  const handleSave = async () => {
    if (!form.title.trim()) return;
    const payload: NewEvent = {
      title: form.title.trim(),
      category: form.category,
      isAllDay: form.allDay,
      startsAt: form.allDay ? toIso(form.date, "00:00") : toIso(form.date, form.startTime),
      endsAt: form.allDay ? null : form.endTime ? toIso(form.date, form.endTime) : null,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
    };
    if (form.id) await updateEvent({ id: form.id, patch: payload });
    else await createEvent(payload);
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (form.id) {
      await deleteEvent(form.id);
      setDialogOpen(false);
    }
  };

  const monthLabel = `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  const shiftMonth = (n: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Calendar"
        meta={isLoading ? "loading…" : `${events.length} this view`}
        action={
          <div className="flex items-center gap-1.5">
            <div className="flex items-center rounded-md border border-border">
              <button
                onClick={() => shiftMonth(-1)}
                className="h-8 w-8 grid place-items-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded-l-md"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setCursor(new Date())}
                className="h-8 px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 border-x border-border"
              >
                Today
              </button>
              <button
                onClick={() => shiftMonth(1)}
                className="h-8 w-8 grid place-items-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded-r-md"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <span className="text-sm font-medium tabular-nums w-36 text-center hidden sm:block">
              {monthLabel}
            </span>
            <Button
              size="sm"
              className="h-8 bg-accent text-accent-foreground hover:bg-accent/90 gap-1.5"
              onClick={() => openCreate(todayKey)}
            >
              <Plus className="h-4 w-4" /> Add event
            </Button>
          </div>
        }
      />

      {/* Mobile month label */}
      <div className="sm:hidden text-sm font-medium">{monthLabel}</div>

      {/* Filter legend */}
      {presentCategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {presentCategories.map((k) => {
            const off = hidden.has(k);
            return (
              <button
                key={k}
                onClick={() =>
                  setHidden((s) => {
                    const n = new Set(s);
                    if (n.has(k)) n.delete(k);
                    else n.add(k);
                    return n;
                  })
                }
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                  off
                    ? "border-border text-muted-foreground/50"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${off ? "bg-muted-foreground/40" : cat(k).dot}`} />
                {cat(k).label}
              </button>
            );
          })}
        </div>
      )}

      {/* Month grid */}
      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="h-8 grid place-items-center text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70"
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const k = dayKey(d);
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = k === todayKey;
            const dayEvents = byDay[k] ?? [];
            return (
              <div
                key={k}
                onClick={() => openCreate(k)}
                className={`group min-h-[104px] border-b border-r border-border p-1.5 cursor-pointer transition-colors hover:bg-secondary/30 [&:nth-child(7n)]:border-r-0 ${
                  inMonth ? "" : "bg-background/40"
                } ${i >= 35 ? "border-b-0" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`grid place-items-center h-5 min-w-5 px-1 rounded text-xs tabular-nums ${
                      isToday
                        ? "bg-accent text-accent-foreground font-semibold"
                        : inMonth
                          ? "text-foreground"
                          : "text-muted-foreground/40"
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  <Plus className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors" />
                </div>
                <div className="mt-1 space-y-0.5">
                  {dayEvents.slice(0, 3).map((e) => (
                    <button
                      key={e.id}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (e.editable) openEdit(e);
                        else setDetail(e);
                      }}
                      className="w-full flex items-center gap-1.5 px-1 py-0.5 rounded text-left hover:bg-secondary/70 transition-colors"
                      title={e.title}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cat(e.category).dot}`} />
                      <span className="text-[11px] truncate text-foreground/90">
                        {!e.allDay && (
                          <span className="text-muted-foreground tabular-nums mr-1">
                            {new Date(e.start).toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                        {e.title}
                      </span>
                    </button>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="px-1 text-[10px] text-muted-foreground">
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit event" : "New event"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="eyebrow block mb-1">Category</span>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MANUAL_CATS.map((k) => (
                      <SelectItem key={k} value={k}>
                        <span className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full ${cat(k).dot}`} />
                          {cat(k).label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <span className="eyebrow block mb-1">Date</span>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={(e) => setForm((f) => ({ ...f, allDay: e.target.checked }))}
                className="accent-[hsl(var(--accent))] h-4 w-4"
              />
              All day
            </label>

            {!form.allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="eyebrow block mb-1">Start</span>
                  <Input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div>
                  <span className="eyebrow block mb-1">End</span>
                  <Input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                    className="h-9"
                  />
                </div>
              </div>
            )}

            <Input
              placeholder="Location (optional)"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              className="h-9"
            />
            <Textarea
              placeholder="Notes (optional)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="min-h-[64px] text-sm"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0 sm:justify-between">
            {form.id ? (
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-destructive hover:bg-destructive/10"
                onClick={handleDelete}
                disabled={isMutating}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-9" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-9 bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={handleSave}
                disabled={isMutating || !form.title.trim()}
              >
                {form.id ? "Save" : "Add event"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Read-only detail (derived events) */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-sm">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <span className={`h-2 w-2 rounded-full ${cat(detail.category).dot}`} />
                  {detail.title}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">When</span>
                  <span>
                    {new Date(detail.start).toLocaleString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      ...(detail.allDay ? {} : { hour: "numeric", minute: "2-digit" }),
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span>{cat(detail.category).label}</span>
                </div>
                {detail.projectTitle && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Project</span>
                    <span className="truncate max-w-[60%] text-right">{detail.projectTitle}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {detail.source === "bir"
                  ? "Auto-generated BIR filing deadline — statutory date, not adjusted for weekends/holidays. Verify with your accountant."
                  : `Pulled automatically from ${SOURCE_NOUN[detail.source] ?? `${detail.source}s`} — manage it on its own page.`}
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCalendar;
