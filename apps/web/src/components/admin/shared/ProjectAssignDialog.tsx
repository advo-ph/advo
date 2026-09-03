import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { get, post, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAdminTeam } from "@/hooks/useAdminTeam";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MemberRow {
  assignmentId: number;
  teamMemberId: number;
  name: string;
  projectRole: ProjectRole;
}

type ProjectRole =
  | "referral"
  | "project_manager"
  | "lead_developer"
  | "assistant_developer"
  | "creatives_developer";

interface RoleConfig {
  value: ProjectRole;
  label: string;
  /** true = only one person on the project can hold this role */
  single: boolean;
}

const ROLES: RoleConfig[] = [
  { value: "referral", label: "Referral", single: true },
  { value: "project_manager", label: "Project Manager", single: false },
  { value: "lead_developer", label: "Lead Developer", single: false },
  { value: "assistant_developer", label: "Assistant Developer", single: false },
  { value: "creatives_developer", label: "Creatives Developer", single: false },
];

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

// ─── Component ──────────────────────────────────────────────────────────────

interface ProjectAssignDialogProps {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful save so the parent can refresh the people list. */
  onSaved?: () => void;
}

/**
 * Person-first dialog for assigning job roles on a project.
 *
 * One row per team member. Each row carries a strip of role chips; tapping a
 * chip turns that role on or off for that person. Referral stays exclusive —
 * granting it to one person takes it away from whoever held it before.
 */
export const ProjectAssignDialog = ({
  projectId,
  open,
  onOpenChange,
  onSaved,
}: ProjectAssignDialogProps) => {
  const { toast } = useToast();
  const { activeMembers } = useAdminTeam();

  // Current saved assignments from the API
  const [saved, setSaved] = useState<MemberRow[]>([]);
  const [isFetching, setIsFetching] = useState(false);

  // Draft state: maps role → set of teamMemberIds selected in the UI
  const [draft, setDraft] = useState<Record<ProjectRole, Set<number>>>(() =>
    Object.fromEntries(ROLES.map((r) => [r.value, new Set<number>()])) as Record<ProjectRole, Set<number>>,
  );

  const [isSaving, setIsSaving] = useState(false);

  // Fetch existing assignments whenever the dialog opens
  useEffect(() => {
    if (!open) return;

    setIsFetching(true);
    get<MemberRow[]>(`/api/projects/${projectId}/members`)
      .then((res) => {
        if (res.data && !res.error) {
          setSaved(res.data);
          // Seed draft from saved assignments
          const next = Object.fromEntries(
            ROLES.map((r) => [r.value, new Set<number>()]),
          ) as Record<ProjectRole, Set<number>>;
          for (const row of res.data) {
            next[row.projectRole as ProjectRole]?.add(row.teamMemberId);
          }
          setDraft(next);
        } else {
          setSaved([]);
          setDraft(
            Object.fromEntries(ROLES.map((r) => [r.value, new Set<number>()])) as Record<
              ProjectRole,
              Set<number>
            >,
          );
        }
      })
      .catch(() => {
        setSaved([]);
      })
      .finally(() => setIsFetching(false));
  }, [open, projectId]);

  const toggle = (role: ProjectRole, memberId: number, single: boolean) => {
    setDraft((prev) => {
      const next = { ...prev };
      if (single) {
        // Exclusive: clear the role, or hand it to this person alone
        const already = next[role].has(memberId);
        next[role] = already ? new Set() : new Set([memberId]);
      } else {
        const set = new Set(next[role]);
        if (set.has(memberId)) {
          set.delete(memberId);
        } else {
          set.add(memberId);
        }
        next[role] = set;
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    setIsSaving(true);

    // Build add/remove lists by comparing draft against saved
    const toAdd: { teamMemberId: number; projectRole: ProjectRole }[] = [];
    const toRemove: number[] = []; // assignmentIds

    for (const role of ROLES) {
      const savedIds = new Set(
        saved.filter((r) => r.projectRole === role.value).map((r) => r.teamMemberId),
      );
      const draftIds = draft[role.value];

      // Additions: in draft but not in saved
      for (const id of draftIds) {
        if (!savedIds.has(id)) {
          toAdd.push({ teamMemberId: id, projectRole: role.value });
        }
      }

      // Removals: in saved but not in draft
      for (const row of saved.filter((r) => r.projectRole === role.value)) {
        if (!draftIds.has(row.teamMemberId)) {
          toRemove.push(row.assignmentId);
        }
      }
    }

    const errors: string[] = [];

    // Apply removals first so a referral swap works in one confirm
    for (const id of toRemove) {
      const res = await del(`/api/projects/${projectId}/members/${id}`);
      if (res.error) errors.push(res.error);
    }

    for (const { teamMemberId, projectRole } of toAdd) {
      const res = await post(`/api/projects/${projectId}/members`, {
        teamMemberId,
        projectRole,
      });
      if (res.error) errors.push(res.error);
    }

    setIsSaving(false);

    if (errors.length > 0) {
      toast({
        title: "Some changes could not be saved",
        description: errors.join(" "),
        variant: "destructive",
      });
    } else {
      toast({ title: "Roles updated" });
      onSaved?.();
      onOpenChange(false);
    }
  };

  const assignedCount = activeMembers.filter((m) =>
    ROLES.some((r) => draft[r.value].has(m.team_member_id)),
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-3xl w-full rounded-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span>Assign roles</span>
            <span className="text-xs font-normal text-muted-foreground">
              {assignedCount} of {activeMembers.length} assigned
            </span>
          </DialogTitle>
        </DialogHeader>

        {isFetching ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : activeMembers.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No active team members yet.
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {activeMembers.map((m) => {
              const memberRoles = ROLES.filter((r) => draft[r.value].has(m.team_member_id));
              return (
                <div
                  key={m.team_member_id}
                  className={`flex flex-col gap-3 p-3 transition-colors sm:flex-row sm:items-center sm:justify-between ${
                    memberRoles.length > 0 ? "bg-accent/5" : ""
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-muted-foreground">
                      {initials(m.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{m.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {memberRoles.length > 0
                          ? memberRoles.map((r) => r.label).join(", ")
                          : "No role on this project"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 sm:justify-end">
                    {ROLES.map((role) => {
                      const on = draft[role.value].has(m.team_member_id);
                      return (
                        <button
                          key={role.value}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle(role.value, m.team_member_id, role.single)}
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                            on
                              ? "border-accent bg-accent text-accent-foreground"
                              : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                          }`}
                        >
                          {role.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleConfirm}
            disabled={isSaving || isFetching}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : null}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectAssignDialog;
