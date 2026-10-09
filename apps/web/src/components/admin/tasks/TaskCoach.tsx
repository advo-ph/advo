import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { Deliverable, DeliverableStatus } from "@/hooks/useAdminDeliverables";
import { RoamingMascot, type MascotHandle, type MascotMood } from "./Mascot";
import "./task-coach.css";

const DAY = 86_400_000;

/** Work in progress first, then the earliest deadline, then board order. */
function pickNext(tasks: Deliverable[]): Deliverable | null {
  const open = tasks.filter((t) => t.status === "todo" || t.status === "ongoing");
  if (!open.length) return null;
  const due = (t: Deliverable) => (t.due_date ? new Date(t.due_date).getTime() : Infinity);
  return [...open].sort(
    (a, b) =>
      Number(b.status === "ongoing") - Number(a.status === "ongoing") ||
      due(a) - due(b) ||
      a.sort_order - b.sort_order,
  )[0];
}

function daysLeft(iso: string): number {
  // A bare YYYY-MM-DD is a calendar day, not UTC midnight.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const end = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
  end.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / DAY);
}

function headlineFor(task: Deliverable): { text: string; mood: MascotMood } {
  const verb = task.status === "ongoing" ? "Finish" : "Start";
  if (!task.due_date) return { text: `${verb} this next`, mood: "idle" };
  const d = daysLeft(task.due_date);
  if (d < -1) return { text: `${-d} days late. Finish today`, mood: "worried" };
  if (d === -1) return { text: "1 day late. Finish today", mood: "worried" };
  if (d === 0) return { text: "Finish today", mood: "surprised" };
  if (d === 1) return { text: "Finish by tomorrow", mood: "idle" };
  return { text: `Finish in ${d} days`, mood: "happy" };
}

interface TaskCoachProps {
  tasks: Deliverable[];
  isLoading: boolean;
  onAdvance: (task: Deliverable, next: DeliverableStatus) => Promise<void>;
}

const TaskCoach = ({ tasks, isLoading, onAdvance }: TaskCoachProps) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const mascot = useRef<MascotHandle | null>(null);
  const reduced = !!useReducedMotion();
  const [busy, setBusy] = useState(false);

  const task = useMemo(() => pickNext(tasks), [tasks]);
  const remaining = tasks.filter((t) => t.status === "todo" || t.status === "ongoing").length;
  const inReview = tasks.filter((t) => t.status === "review").length;

  const head = task
    ? headlineFor(task)
    : { text: inReview ? "All done. Waiting on review" : "Nothing to do", mood: "sleepy" as MascotMood };

  const greeting = task
    ? head.mood === "worried"
      ? "This one is late."
      : remaining > 1
        ? `${remaining} tasks left.`
        : "Last one."
    : "All clear.";

  const handleAction = async () => {
    if (!task || busy) return;
    const next: DeliverableStatus = task.status === "todo" ? "ongoing" : "review";
    setBusy(true);
    try {
      await onAdvance(task, next);
      mascot.current?.celebrate();
      mascot.current?.say(next === "ongoing" ? "Started." : remaining > 1 ? "Sent for review." : "All done.", "excited");
    } catch (e) {
      const cancelled = e instanceof Error && e.message === "cancelled";
      mascot.current?.say(cancelled ? "Upload the file first." : "That did not save.", "worried");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={stageRef} className="tc-stage">
      {isLoading ? (
        <div className="tc-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="tc-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={task?.deliverable_id ?? "empty"}
              className="tc-column"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              <h2 data-perch="headline" className="tc-headline">
                {head.text}
              </h2>

              {task && (
                <div data-perch="card" className="tc-card">
                  {task.project?.title && <p className="tc-project">{task.project.title}</p>}
                  <p className="tc-title">{task.title}</p>
                  {task.description && <p className="tc-desc">{task.description}</p>}
                </div>
              )}

              {task && (
                <button
                  data-perch="action"
                  type="button"
                  className="tc-action"
                  onClick={handleAction}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : task.status === "todo" ? "Start task" : "Task finished"}
                </button>
              )}

              {remaining > 1 && <p className="tc-count">{remaining - 1} more after this</p>}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {!isLoading && (
        <RoamingMascot
          stageRef={stageRef}
          baseMood={head.mood}
          greeting={greeting}
          apiRef={mascot}
          reducedMotion={reduced}
        />
      )}
    </div>
  );
};

export default TaskCoach;
