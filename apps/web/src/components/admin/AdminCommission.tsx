import { useState, useEffect } from "react";
import { Plus, Trash2, Loader2, Lock, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useCommission,
  type CommissionPlan,
  type CommissionRole,
  type CommissionShare,
} from "@/hooks/useCommission";
import { useAdminTeam } from "@/hooks/useAdminTeam";
import { Empty } from "@/components/admin/_ui";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import { get } from "@/lib/api";

/**
 * /admin -> Finance -> Commission.
 *
 * The team-facing surface for the 55/35/10 split. Everything money-shaped on this screen
 * arrives already allocated from the server: this component divides by 100 to render
 * pesos and does no other arithmetic on anyone's pay. The finalize button is drawn
 * straight from `derived.blocker`, which the API re-derives in its own write path.
 */

const formatPeso = (cents: number) =>
  `₱${(cents / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const ROLE_LABEL: Record<CommissionRole, string> = {
  main_developer: "Main Developer",
  assistant_developer: "Assistant Developer",
  creatives_developer: "Creatives Developer",
  lead_partnerships: "Lead Partnerships",
  referral: "Lead Partnerships",
  marketing: "Marketing",
  accounting: "Accounting",
  management: "Management",
  company: "Company Revenue",
};

const ASSIGNABLE_ROLES: { value: CommissionRole; label: string }[] = [
  { value: "main_developer", label: "Main Developer" },
  { value: "assistant_developer", label: "Assistant Developer" },
  { value: "creatives_developer", label: "Creatives Developer" },
  { value: "lead_partnerships", label: "Lead Partnerships" },
  { value: "marketing", label: "Marketing" },
  { value: "accounting", label: "Accounting" },
  { value: "management", label: "Management" },
];

const TIER_OPTIONS = [
  {
    label: "Tier 1 (5%)",
    tierLabel:
      "Tier 1 Contribution (5% Allocation): Routine and Assisted Execution. Routine manual labor, basic data population, and simple AI image generation. Low complexity, and normally needs oversight or later clean-up by the Senior Developer.",
    allocationBps: 500,
  },
  {
    label: "Tier 2 (10%)",
    tierLabel:
      "Tier 2 Contribution (10% Allocation): Independent High-Volume Asset Creation. Independent execution and high-volume generation of quality AI image assets. Output must be consistently high quality and client-ready, needing zero manual correction, quality checking, or Senior Developer help before it is used.",
    allocationBps: 1000,
  },
  {
    label: "Tier 3 (15%)",
    tierLabel:
      "Tier 3 Contribution (15% Allocation): Advanced Media and Public-Ready Execution. Successful generation and delivery of complex AI video assets. Must be premium, public-facing quality, ready for immediate client presentation or live deployment with no further edits.",
    allocationBps: 1500,
  },
] as const;

const POOL_DOT: Record<CommissionShare["pool"], string> = {
  developer: "bg-accent",
  staff: "bg-blue-500",
  company: "bg-muted-foreground/50",
};

/** Quiet section heading inside a dropdown, matching the admin table header treatment. */
const GROUP_LABEL =
  "text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground";

const isTierRole = (role: CommissionRole) =>
  role === "assistant_developer" || role === "creatives_developer";

interface ProjectMember {
  assignmentId: number;
  teamMemberId: number;
  name: string;
  projectRole: string;
}

interface ProjectSummary {
  project_id: number;
  title: string;
  total_value_cents: number;
}

/* ─── Sub-container ───────────────────────────────────────── */

const SubContainer = ({ label }: { label: string }) => (
  <div className="h-full flex items-center justify-center bg-secondary/30 border border-border rounded px-2 py-1.5 text-center">
    <p className="text-[11px] text-muted-foreground leading-snug">{label}</p>
  </div>
);

/**
 * The three pools sit in a grid rather than a flex row so the columns stretch to a
 * common height. Inside a column the sub-container strip is the flex-1 child, which
 * pushes every tile — three words or twelve — to the same box.
 */
const PoolHeader = ({
  label,
  pct,
  amount,
  subContainers,
}: {
  label: string;
  pct: number;
  amount: number;
  subContainers: string[];
}) => (
  <div className="flex flex-col min-w-0">
    <div className="bg-card border border-border rounded-lg px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {label} {pct}%
      </p>
      <p className="text-sm font-medium tabular-nums">{formatPeso(amount)}</p>
    </div>
    <div
      className="grid flex-1 gap-1 mt-1"
      style={{ gridTemplateColumns: `repeat(${subContainers.length}, minmax(0, 1fr))` }}
    >
      {subContainers.map((s) => (
        <SubContainer key={s} label={s} />
      ))}
    </div>
  </div>
);

/* ─── One share row ───────────────────────────────────────── */

const ShareRow = ({
  share,
  isFrozen,
  onPercent,
  onAgree,
  onRemove,
  onTier,
}: {
  share: CommissionShare;
  isFrozen: boolean;
  onPercent: (bps: number) => void;
  onAgree: (isAgreed: boolean) => void;
  onRemove: () => void;
  onTier: (tierLabel: string) => void;
}) => {
  const [draftPct, setDraftPct] = useState(String(share.contributionBps / 100));
  const isCompany = share.role === "company";
  const isTier = isTierRole(share.role);

  useEffect(() => {
    setDraftPct(String(share.contributionBps / 100));
  }, [share.contributionBps]);

  return (
    <div className="flex items-center gap-3 px-3 h-11 text-sm">
      <span className="w-2 shrink-0">
        <span className={`block w-2 h-2 rounded-full ${POOL_DOT[share.pool]}`} />
      </span>

      <span className="flex-1 min-w-0 font-medium truncate">
        {isCompany ? "ADVO Revenue and Investment ROI" : (share.memberName ?? "—")}
      </span>

      <span className="w-36 shrink-0 text-xs text-muted-foreground truncate">
        {ROLE_LABEL[share.role]}
      </span>

      {/* Tier picker and percentage box share one w-28 track so the column reads as a
          single edge no matter which control a row happens to draw. The % sign sits
          inside the input rather than beside it, which is what used to shorten it. */}
      <span className="w-36 shrink-0 flex items-center justify-end">
        {isCompany ? (
          <span className="w-28 text-right text-xs text-muted-foreground tabular-nums">fixed</span>
        ) : isTier ? (
          <Select
            value={
              TIER_OPTIONS.find((t) => t.allocationBps === share.contributionBps)?.tierLabel ?? ""
            }
            onValueChange={(v) => onTier(v)}
            disabled={isFrozen}
          >
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue placeholder="Pick tier" />
            </SelectTrigger>
            <SelectContent>
              {TIER_OPTIONS.map((t) => (
                <SelectItem key={t.allocationBps} value={t.tierLabel}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="relative w-28">
            <Input
              value={draftPct}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9]/g, "");
                const n = Number(v);
                if (n <= 100) setDraftPct(v);
              }}
              onBlur={() => {
                const pct = Math.min(100, Math.max(0, Number(draftPct || 0)));
                const bps = pct * 100;
                if (bps !== share.contributionBps) onPercent(bps);
              }}
              disabled={isFrozen}
              className="h-7 w-full pr-6 text-xs text-right tabular-nums"
              aria-label={`Percentage for ${share.memberName ?? "share"}`}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              %
            </span>
          </span>
        )}
      </span>

      <span className="w-24 shrink-0 flex justify-end">
        {isCompany ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <Button
            size="sm"
            variant={share.isAgreed ? "secondary" : "outline"}
            className="h-7 text-xs"
            disabled={isFrozen}
            onClick={() => onAgree(!share.isAgreed)}
          >
            {share.isAgreed ? <Check className="h-3 w-3 mr-1" /> : null}
            {share.isAgreed ? "Agreed" : "Agree"}
          </Button>
        )}
      </span>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        disabled={isFrozen || isCompany}
        onClick={onRemove}
        aria-label="Remove from split"
      >
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  );
};

/* ─── Add Member popup ────────────────────────────────────── */

const AddMemberDialog = ({
  open,
  onOpenChange,
  projectMembers,
  teamRoster,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectMembers: ProjectMember[];
  teamRoster: { teamMemberId: number; name: string }[];
  onAdd: (input: { teamMemberId: number; role: CommissionRole }) => void;
}) => {
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedRole, setSelectedRole] = useState<CommissionRole>("main_developer");

  // A commission share is not limited to people already assigned to the project —
  // the API only checks the team member exists. Listing project assignees alone left
  // this dropdown empty on every project with no role assignments yet, which read as
  // a broken control. Assignees are grouped first, then the rest of the roster.
  //
  // The grouping is a SelectLabel rather than a per-item badge because Radix renders
  // the chosen item's children back into the trigger: a badge inside the item turned
  // the closed control into "Angelo Revelonot on project".
  const assignedIds = new Set(projectMembers.map((m) => m.teamMemberId));
  const onProject = projectMembers.map((m) => ({ id: m.teamMemberId, name: m.name }));
  const offProject = teamRoster
    .filter((m) => !assignedIds.has(m.teamMemberId))
    .map((m) => ({ id: m.teamMemberId, name: m.name }));
  const optionCount = onProject.length + offProject.length;

  const reset = () => {
    setSelectedMemberId("");
    setSelectedRole("main_developer");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Team member</p>
            <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select a member" />
              </SelectTrigger>
              <SelectContent>
                {onProject.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className={GROUP_LABEL}>On this project</SelectLabel>
                    {onProject.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {offProject.length > 0 && (
                  <SelectGroup>
                    {onProject.length > 0 && (
                      <SelectLabel className={GROUP_LABEL}>Rest of the team</SelectLabel>
                    )}
                    {offProject.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
            {optionCount === 0 && (
              <p className="text-xs text-muted-foreground">
                No team members exist yet. Add one under Team first.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Role</p>
            <Select
              value={selectedRole}
              onValueChange={(v) => setSelectedRole(v as CommissionRole)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            Cancel
          </Button>
          <Button
            disabled={!selectedMemberId}
            onClick={() => {
              if (!selectedMemberId) return;
              onAdd({ teamMemberId: Number(selectedMemberId), role: selectedRole });
              reset();
              onOpenChange(false);
            }}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ─── One plan card ───────────────────────────────────────── */

const PlanCard = ({
  plan,
  projectMembers,
  teamRoster,
  api,
  isFinalizing,
}: {
  plan: CommissionPlan;
  projectMembers: ProjectMember[];
  teamRoster: { teamMemberId: number; name: string }[];
  api: ReturnType<typeof useCommission>;
  isFinalizing: boolean;
}) => {
  const isFrozen = plan.status !== "draft";
  const d = plan.derived;

  const [addOpen, setAddOpen] = useState(false);
  const [deleteShareId, setDeleteShareId] = useState<number | null>(null);
  const deleteShare = plan.share.find((s) => s.commissionShareId === deleteShareId);

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 h-11 border-b border-border">
        <span className="flex-1 min-w-0 font-medium text-sm truncate">
          {plan.projectTitle ?? `Project ${plan.projectId}`}
        </span>
        {isFrozen && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
            <Lock className="h-3 w-3" />
            {plan.status === "void" ? "Void" : "Finalized"}
          </span>
        )}
      </div>

      {/* Pool containers */}
      <div className="p-3 space-y-2">
        <div className="grid gap-3 md:grid-cols-3">
          <PoolHeader
            label="Developers"
            pct={plan.developerBps / 100}
            amount={d.developerPoolCents}
            subContainers={["Main Developer 75–80%", "Assistant Developer 5–10%", "Creatives Developer 15%"]}
          />
          <PoolHeader
            label="Staff"
            pct={plan.staffBps / 100}
            amount={d.staffPoolCents}
            subContainers={["Lead Partnerships 20%", "Management 50%", "Marketing 20%", "Accounting 10%"]}
          />
          <PoolHeader
            label="Company"
            pct={plan.companyBps / 100}
            amount={d.companyCents}
            subContainers={[
              "Company Revenue and Investment ROI",
              "Development Expenses",
              "General Expenses",
            ]}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Development Expenses are taken from the Total Developer Pool. General Expenses are taken from the Company Revenue.
        </p>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-3 px-3 h-9 border-y border-border text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        <span className="w-2 shrink-0" />
        <span className="flex-1 min-w-0">Name</span>
        <span className="w-36 shrink-0">Role</span>
        <span className="w-36 shrink-0 text-right">Percentage</span>
        <span className="w-24 shrink-0 text-right">Agreed</span>
        <span className="w-7 shrink-0" />
      </div>

      {/* Share rows */}
      {plan.share.length === 0 ? (
        <Empty text="Nobody on this split yet" />
      ) : (
        <div className="divide-y divide-border">
          {plan.share.map((share) => (
            <ShareRow
              key={share.commissionShareId}
              share={share}
              isFrozen={isFrozen}
              onPercent={(bps) =>
                api.updateCommissionShare({
                  commissionShareId: share.commissionShareId,
                  contributionBps: bps,
                })
              }
              onAgree={(isAgreed) =>
                api.updateCommissionShare({
                  commissionShareId: share.commissionShareId,
                  isAgreed,
                })
              }
              onRemove={() => setDeleteShareId(share.commissionShareId)}
              onTier={(tierLabel) =>
                api.setTier({
                  commissionShareId: share.commissionShareId,
                  tierLabel,
                })
              }
            />
          ))}
        </div>
      )}

      {/* Add Member */}
      {!isFrozen && (
        <div className="px-3 py-2 border-t border-border">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Member
          </Button>
        </div>
      )}

      {/* Finalize */}
      {!isFrozen && (
        <div className="flex items-start gap-3 px-3 py-2 border-t border-border">
          <div className="flex-1 min-w-0 text-xs text-muted-foreground">
            {d.blocker.length === 0 ? (
              "Every share is agreed and every centavo has a name. Finalizing freezes these amounts."
            ) : (
              <ul className="space-y-0.5">
                {d.blocker.map((reason) => (
                  <li key={reason} className="flex items-start gap-1.5">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-yellow-500" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button
            size="sm"
            className="h-8 shrink-0"
            disabled={!d.isFinalizeReady || isFinalizing}
            onClick={() => api.finalizeCommissionPlan(plan.commissionPlanId)}
          >
            {isFinalizing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Lock className="h-3.5 w-3.5" />
            )}
            <span className="ml-1.5">Finalize</span>
          </Button>
        </div>
      )}

      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectMembers={projectMembers}
        teamRoster={teamRoster}
        onAdd={(input) =>
          api.addCommissionShare({ commissionPlanId: plan.commissionPlanId, ...input })
        }
      />

      <ConfirmDeleteDialog
        open={deleteShareId !== null}
        onOpenChange={(v) => { if (!v) setDeleteShareId(null); }}
        onConfirm={() => {
          if (deleteShareId !== null) {
            api.removeCommissionShare(deleteShareId);
            setDeleteShareId(null);
          }
        }}
        name={deleteShare?.memberName ?? "this member"}
        noun="share"
      />
    </div>
  );
};

/* ─── Section ─────────────────────────────────────────────── */

const AdminCommission = ({ projects }: { projects: ProjectSummary[] }) => {
  const api = useCommission();
  const { activeMembers } = useAdminTeam();
  const [newProjectId, setNewProjectId] = useState("");
  const [projectMembersMap, setProjectMembersMap] = useState<Record<number, ProjectMember[]>>({});

  const teamRoster = activeMembers.map((m) => ({
    teamMemberId: m.team_member_id,
    name: m.name,
  }));

  const planned = new Set(
    api.commissionPlan.filter((p) => p.status !== "void").map((p) => p.projectId),
  );
  const unplanned = projects.filter((p) => !planned.has(p.project_id));

  const finalizedCents = api.commissionPlan
    .filter((p) => p.status === "finalized")
    .reduce((sum, p) => sum + p.derived.allocatedCents, 0);

  // Load project members for each plan's project.
  useEffect(() => {
    const projectIds = [...new Set(api.commissionPlan.map((p) => p.projectId))];
    for (const pid of projectIds) {
      if (projectMembersMap[pid] !== undefined) continue;
      get<ProjectMember[]>(`/api/projects/${pid}/members`)
        .then((res) => {
          if (res.data) {
            setProjectMembersMap((prev) => ({ ...prev, [pid]: res.data! }));
          }
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.commissionPlan]);

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Commission</h2>
          <p className="text-xs text-muted-foreground">
            55% developer · 35% staff · 10% company revenue · {formatPeso(finalizedCents)} finalized
          </p>
        </div>

        {unplanned.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <Select value={newProjectId} onValueChange={setNewProjectId}>
              <SelectTrigger className="h-8 w-52 text-xs">
                <SelectValue placeholder="Draft a split for…" />
              </SelectTrigger>
              <SelectContent>
                {unplanned.map((p) => (
                  <SelectItem key={p.project_id} value={String(p.project_id)}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={!newProjectId || api.isCreating}
              onClick={() => {
                api.createCommissionPlan({ projectId: Number(newProjectId) });
                setNewProjectId("");
              }}
            >
              {api.isCreating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              <span className="ml-1">Draft</span>
            </Button>
          </div>
        )}
      </div>

      {api.commissionPlan.length === 0 ? (
        <div className="border border-border rounded-lg bg-card">
          <Empty text="No commission plan yet. Add one above to get started." />
        </div>
      ) : (
        <div className="space-y-3">
          {api.commissionPlan.map((plan) => (
            <PlanCard
              key={plan.commissionPlanId}
              plan={plan}
              projectMembers={projectMembersMap[plan.projectId] ?? []}
              teamRoster={teamRoster}
              api={api}
              isFinalizing={api.isFinalizing}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Finalizing freezes who is owed what. It does not pay anyone — disbursement is a separate,
        manual act, deliberately not wired to this model.
      </p>
    </div>
  );
};

export default AdminCommission;
