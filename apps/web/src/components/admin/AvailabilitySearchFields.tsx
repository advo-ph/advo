import { useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { format } from "date-fns";
import {
  CalendarDays,
  ChevronDown,
  Clock3,
  Check,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { minutesToClock12h, timeToMinutes } from "@/lib/manila-time";
import type { MeetingWindowInput } from "@/lib/free-time";
import { cn } from "@/lib/utils";

const dateOf = (key: string) => new Date(`${key}T12:00:00`);
const dateKey = (date: Date) => format(date, "yyyy-MM-dd");
const dateLabel = (key: string) => format(dateOf(key), "MMM d, yyyy");
const triggerClass =
  "flex h-14 min-w-0 items-center gap-2.5 rounded-xl border border-border bg-secondary/30 px-3 text-left transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Light calendar surface gives the black selection and joined range a clear silhouette. */
function SearchCalendar({
  className,
  ...props
}: React.ComponentProps<typeof Calendar>) {
  return (
    <Calendar
      {...props}
      className={cn(
        "availability-search-calendar w-full p-3 text-zinc-900",
        className
      )}
      classNames={{
        months: "w-full",
        month: "space-y-3",
        table: "w-full border-collapse text-zinc-900",
        head_row: "flex",
        head_cell: "flex-1 text-center text-[11px] font-medium text-zinc-500",
        row: "mt-1 flex w-full",
        cell: "relative h-10 min-w-0 flex-1 p-0 text-center text-sm focus-within:z-20 [&:has(.range-start)]:bg-[linear-gradient(to_right,transparent_50%,rgb(24_24_27_/_0.65)_50%)] [&:has(.range-end)]:bg-[linear-gradient(to_left,transparent_50%,rgb(24_24_27_/_0.65)_50%)] [&:has(.range-start.range-end)]:bg-none",
        day: "mx-auto flex h-10 w-10 max-w-full items-center justify-center rounded-full text-sm font-medium transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-1",
        day_selected: "bg-zinc-950 text-white hover:bg-zinc-800",
        day_range_start: "range-start",
        day_range_end: "range-end",
        day_range_middle:
          "range-middle !w-full !rounded-none !bg-zinc-900/65 !text-white hover:!bg-zinc-900/75",
        day_today: "!font-bold",
        day_outside: "text-zinc-500",
        day_disabled: "text-zinc-300 hover:bg-transparent",
        caption: "relative flex h-10 items-center justify-center",
        caption_label: "text-sm font-semibold",
        nav: "flex items-center",
        nav_button:
          "absolute top-0 flex h-10 w-10 items-center justify-center rounded-full text-zinc-700 transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500",
        nav_button_previous: "left-0",
        nav_button_next: "right-0",
      }}
    />
  );
}

function PickerPanel({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div id={id} className="rounded-2xl border border-border bg-secondary/20 p-1">
        {children}
      </div>
    </motion.div>
  );
}

export function FreeTimeDateRange({
  start,
  end,
  minDate,
  onChange,
}: {
  start: string;
  end: string;
  minDate: string;
  onChange: (range: { start: string; end: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Date | null>(null);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    setPending(null);
    trigger.current?.focus();
  };
  const from = pending ?? dateOf(start);
  return (
    <div
      className="space-y-2"
      data-availability-picker-open={open || undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label="Search date range"
        aria-expanded={open}
        aria-controls={id}
        className={cn(triggerClass, "w-full")}
        onClick={() => {
          setOpen(!open);
          setPending(null);
        }}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr] items-center gap-3">
          <span>
            <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Start date
            </span>
            <span className="block truncate text-sm font-medium">
              {dateLabel(start)}
            </span>
          </span>
          <span aria-hidden className="text-muted-foreground">
            →
          </span>
          <span>
            <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              End date
            </span>
            <span className="block truncate text-sm font-medium">
              {dateLabel(end)}
            </span>
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <PickerPanel id={id}>
            <div className="overflow-hidden rounded-xl bg-zinc-50">
              <SearchCalendar
                mode="range"
                defaultMonth={from}
                selected={{ from, to: pending ? undefined : dateOf(end) }}
                disabled={{ before: dateOf(minDate) }}
                onDayClick={(date, modifiers) => {
                  if (modifiers.disabled) return;
                  if (!pending) {
                    setPending(date);
                    return;
                  }
                  const a = dateKey(pending);
                  const b = dateKey(date);
                  onChange({ start: a < b ? a : b, end: a < b ? b : a });
                  close();
                }}
              />
              <div
                aria-live="polite"
                className="border-t border-zinc-200 px-4 py-2.5 text-xs text-zinc-600"
              >
                {pending
                  ? `${format(pending, "MMM d")} selected · Choose an end date`
                  : "Choose a start date, then an end date"}
              </div>
            </div>
          </PickerPanel>
        )}
      </AnimatePresence>
    </div>
  );
}

function TimeControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (time: string) => void;
}) {
  const minutes = timeToMinutes(value);
  const hour24 = Math.floor(minutes / 60);
  const hour = hour24 % 12 || 12;
  const minute = minutes % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const update = (nextHour: number, nextMinute: number, nextPeriod: string) => {
    const nextHour24 = nextHour % 12 + (nextPeriod === "PM" ? 12 : 0);
    onChange(`${String(nextHour24).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`);
  };
  const selectClass =
    "h-12 min-w-0 gap-2 rounded-lg border-border bg-secondary px-3 text-base font-medium tabular-nums [&>svg]:shrink-0";
  return (
    <fieldset className="min-w-0 rounded-xl border border-border bg-card p-3">
      <legend className="px-1 text-xs font-medium text-muted-foreground">{label}</legend>
      <div className="grid grid-cols-3 gap-2">
        <div className="min-w-0 space-y-1">
          <span className="block text-xs text-muted-foreground">Hour</span>
          <Select value={String(hour)} onValueChange={(next) => update(Number(next), minute, period)}>
            <SelectTrigger aria-label={`${label} hour`} className={selectClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-60 min-w-[var(--radix-select-trigger-width)] rounded-lg">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                <SelectItem key={h} value={String(h)} className="min-h-11 text-base tabular-nums">
                  {String(h).padStart(2, "0")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-1">
          <span className="block text-xs text-muted-foreground">Minute</span>
          <Select value={String(minute)} onValueChange={(next) => update(hour, Number(next), period)}>
            <SelectTrigger aria-label={`${label} minute`} className={selectClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-60 min-w-[var(--radix-select-trigger-width)] rounded-lg">
              {Array.from({ length: 60 }, (_, m) => (
                <SelectItem key={m} value={String(m)} className="min-h-11 text-base tabular-nums">
                  {String(m).padStart(2, "0")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-1">
          <span className="block text-xs text-muted-foreground">AM/PM</span>
          <button
            type="button"
            aria-label={`${label} AM/PM`}
            aria-pressed={period === "PM"}
            title={`Switch to ${period === "AM" ? "PM" : "AM"}`}
            onClick={() => update(hour, minute, period === "AM" ? "PM" : "AM")}
            className="flex h-12 w-full items-center justify-center rounded-lg border border-border bg-secondary px-3 text-base font-medium transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {period}
          </button>
        </div>
      </div>
    </fieldset>
  );
}

export function FreeMembersMeeting({
  value,
  onChange,
}: {
  value: MeetingWindowInput;
  onChange: (value: MeetingWindowInput) => void;
}) {
  const [panel, setPanel] = useState<"date" | "time" | null>(null);
  const id = useId();
  const dateTrigger = useRef<HTMLButtonElement>(null);
  const timeTrigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    setPanel(null);
    (panel === "date" ? dateTrigger : timeTrigger).current?.focus();
  };
  const toggle = (next: "date" | "time") =>
    setPanel(panel === next ? null : next);
  return (
    <div
      className="space-y-2"
      data-availability-picker-open={panel ? true : undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape" && panel) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="grid grid-cols-2 items-stretch gap-2">
        <button
          ref={dateTrigger}
          type="button"
          aria-label="Meeting date"
          aria-expanded={panel === "date"}
          aria-controls={id}
          className={cn(triggerClass, "h-auto min-h-16 gap-2 py-3")}
          onClick={() => toggle("date")}
        >
          <CalendarDays className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Date
            </span>
            <span className="block text-sm font-medium leading-5">
              {dateLabel(value.startDate)}
            </span>
          </span>
          <ChevronDown className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200", panel === "date" && "rotate-180")} />
        </button>
        <button
          ref={timeTrigger}
          type="button"
          aria-label="Meeting time"
          aria-expanded={panel === "time"}
          aria-controls={id}
          className={cn(triggerClass, "h-auto min-h-16 gap-2 py-3")}
          onClick={() => toggle("time")}
        >
          <Clock3 className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Start – End
            </span>
            <span className="block text-sm font-medium leading-5 tabular-nums">
              {minutesToClock12h(timeToMinutes(value.startTime))} –{" "}
              {minutesToClock12h(timeToMinutes(value.endTime))}
            </span>
          </span>
          <ChevronDown className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200", panel === "time" && "rotate-180")} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {panel && (
          <PickerPanel id={id}>
            <div className="min-h-[360px]">
              {panel === "date" ? (
                <div className="overflow-hidden rounded-xl bg-zinc-50">
                  <SearchCalendar
                    mode="single"
                    fixedWeeks
                    selected={dateOf(value.startDate)}
                    defaultMonth={dateOf(value.startDate)}
                    onSelect={(date) => {
                      if (!date) return;
                      const key = dateKey(date);
                      onChange({ ...value, startDate: key, endDate: key });
                      close();
                    }}
                  />
                </div>
              ) : (
                <div className="space-y-2 p-2">
                  <div className="grid grid-cols-1 gap-3">
                    <TimeControl
                      label="Start time"
                      value={value.startTime}
                      onChange={(startTime) => onChange({ ...value, startTime })}
                    />
                    <TimeControl
                      label="End time"
                      value={value.endTime}
                      onChange={(endTime) => onChange({ ...value, endTime })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-85"
                  >
                    <Check className="h-4 w-4" />
                    Done
                  </button>
                </div>
              )}
            </div>
          </PickerPanel>
        )}
      </AnimatePresence>
    </div>
  );
}
