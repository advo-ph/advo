/**
 * CommissionPanel — Phase 8 implementation.
 *
 * Renders the full commission split UI for a single project:
 * - Top-level split containers (Developers 55%, Staff 35%, Company 10%)
 * - Sub-containers for each group
 * - Share rows table with percentage input or tier dropdown
 * - Add Member popup (pulls from project_role_assignment)
 * - Delete confirmation via ConfirmDeleteDialog
 * - Visibility: amounts are redacted server-side for non-participants
 */

import { useState, useEffect } from "react";
import { Plus, Trash2, X, Loader2, Lock, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
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
import { Panel } from "@/components/admin/_ui";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import {
  useCommission,
  type CommissionPlan,
  type CommissionRole,
  type CommissionShare,
} from "@/hooks/useCommission";
import { get } from "@/lib/api";

// ─── Constants ────────────────────────────────────────────────────────────────

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

const POOL_DOT: Record<CommissionShare["pool"], string> = {
  developer: "bg-accent",
  staff: "bg-blue-500",
  company: "bg-muted-foreground/50",
};

const formatPeso = (cents: number) =>
  `₱${(cents / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const isTierRole = (role: CommissionRole) =>
  role === "assistant_developer" || role === "creatives_developer";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectMember {
  assignmentId: number;
  teamMemberId: number;
  name: string;
  projectRole: string;
}

interface CommissionPanelProps {
  projectId: number;
  isOwner: boolean;
}

// ─── Sub-container row ────────────────────────────────────────────────────────

const SubContainer = ({ label }: { label: string }) => (
  <div className="bg-secondary/30 border border-border rounded px-2 py-1.5 text-center">
    <p className="text-[11px] text-muted-foreground leading-snug">{label}</p>
  </div>
);

// ─── Pool header card (shared by mobile + desktop trees) ──────────────────────

const PoolHeaderCard = ({
  label,
  pct,
  amount,
}: {
  label: string;
  pct: number;
  amount: number;
}) => (
  <div className="bg-card border border-border rounded-lg px-3 py-2">
    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
      {label} {pct}%
    </p>
    <p className="text-sm font-medium tabular-nums">{formatPeso(amount)}</p>
  </div>
);

// ─── Sub-container grid (shared by mobile + desktop trees) ────────────────────

const SubGrid = ({
  subContainers,
  cols,
  className = "",
}: {
  subContainers: string[];
  cols?: number;
  className?: string;
}) => (
  <div
    className={`grid gap-1 ${className}`}
    style={{ gridTemplateColumns: `repeat(${cols ?? subContainers.length}, 1fr)` }}
  >
    {subContainers.map((s) => (
      <SubContainer key={s} label={s} />
    ))}
  </div>
);

// ─── Pool header (desktop: card + its own sub-containers stacked beneath) ─────

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
  <div className="flex-1 min-w-0 flex flex-col">
    <PoolHeaderCard label={label} pct={pct} amount={amount} />
    <SubGrid subContainers={subContainers} className="mt-1 flex-1" />
  </div>
);

// ─── Share row ────────────────────────────────────────────────────────────────

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
  // Display as percentage (0–100); store as bps (0–10000).
  const [draftPct, setDraftPct] = useState(String(share.contributionBps / 100));
  const isCompany = share.role === "company";
  const isTier = isTierRole(share.role);

  // Keep draft in sync when contribution changes externally.
  useEffect(() => {
    setDraftPct(String(share.contributionBps / 100));
  }, [share.contributionBps]);

  const roleDot = (
    <span className="w-2 h-2 rounded-full shrink-0 flex-none">
      <span className={`block w-2 h-2 rounded-full ${POOL_DOT[share.pool]}`} />
    </span>
  );

  const name = isCompany
    ? "ADVO Revenue and Investment ROI"
    : (share.memberName ?? "—");

  // Percentage / Tier control — identical markup/behavior on both trees.
  const percentControl = isCompany ? (
    <span className="text-xs text-muted-foreground tabular-nums">fixed</span>
  ) : isTier ? (
    <Select
      value={
        TIER_OPTIONS.find((t) => t.allocationBps === share.contributionBps)?.tierLabel ?? ""
      }
      onValueChange={(v) => onTier(v)}
      disabled={isFrozen}
    >
      <SelectTrigger className="h-7 text-xs w-32">
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
    <span className="flex items-center gap-1">
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
        className="h-7 w-16 text-xs text-right tabular-nums"
        aria-label={`Percentage for ${share.memberName ?? "share"}`}
      />
      <span className="text-xs text-muted-foreground">%</span>
    </span>
  );

  // Agreed control — identical markup/behavior on both trees.
  const agreedControl = isCompany ? (
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
  );

  const deleteControl = (
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
  );

  return (
    <>
      {/* Mobile: two-line card */}
      <div className="sm:hidden flex flex-col gap-2 px-3 py-2.5 text-sm">
        {/* Line 1 — role dot + name + role label */}
        <div className="flex items-center gap-2 min-w-0">
          {roleDot}
          <span className="min-w-0 flex-1 font-medium truncate">{name}</span>
          <span className="shrink-0 text-xs text-muted-foreground truncate">
            {ROLE_LABEL[share.role]}
          </span>
        </div>

        {/* Line 2 — percentage/tier + agreed + delete */}
        <div className="flex items-center gap-2 pl-4">
          <span className="flex items-center">{percentControl}</span>
          <span className="ml-auto flex items-center gap-2">
            {agreedControl}
            {deleteControl}
          </span>
        </div>
      </div>

      {/* Desktop: single-line table row (unchanged) */}
      <div className="hidden sm:flex items-center gap-3 px-3 h-11 text-sm">
        {roleDot}

        {/* Name */}
        <span className="flex-1 min-w-0 font-medium truncate">{name}</span>

        {/* Role */}
        <span className="w-36 shrink-0 text-xs text-muted-foreground truncate">
          {ROLE_LABEL[share.role]}
        </span>

        {/* Percentage / Tier */}
        <span className="w-36 shrink-0 flex items-center justify-end gap-1">
          {percentControl}
        </span>

        {/* Agreed */}
        <span className="w-24 shrink-0 flex justify-end">{agreedControl}</span>

        {deleteControl}
      </div>
    </>
  );
};

// ─── Add Member popup ─────────────────────────────────────────────────────────

const AddMemberDialog = ({
  open,
  onOpenChange,
  projectMembers,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectMembers: ProjectMember[];
  onAdd: (input: { teamMemberId: number; role: CommissionRole }) => void;
}) => {
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedRole, setSelectedRole] = useState<CommissionRole>("main_developer");

  // The members endpoint returns one row per project role, so a person with
  // multiple roles appears more than once. Collapse to one entry per person:
  // duplicate Select values render the label twice ("Prince WaganPrince Wagan")
  // and crash. The split table still lets one person hold several shares.
  const uniqueMembers = Array.from(
    new Map(projectMembers.map((m) => [m.teamMemberId, m])).values()
  );

  const reset = () => {
    setSelectedMemberId("");
    setSelectedRole("main_developer");
  };

  const handleConfirm = () => {
    if (!selectedMemberId) return;
    onAdd({ teamMemberId: Number(selectedMemberId), role: selectedRole });
    reset();
    onOpenChange(false);
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
                {uniqueMembers.map((m) => (
                  <SelectItem key={m.teamMemberId} value={String(m.teamMemberId)}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Button disabled={!selectedMemberId} onClick={handleConfirm}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── Plan card ────────────────────────────────────────────────────────────────

const PlanCard = ({
  plan,
  projectMembers,
  api,
  isFinalizing,
}: {
  plan: CommissionPlan;
  projectMembers: ProjectMember[];
  api: ReturnType<typeof useCommission>;
  isFinalizing: boolean;
}) => {
  const isFrozen = plan.status !== "draft";
  const d = plan.derived;

  const [addOpen, setAddOpen] = useState(false);
  const [deleteShareId, setDeleteShareId] = useState<number | null>(null);
  const deleteShare = plan.share.find((s) => s.commissionShareId === deleteShareId);

  // Split definitions shared by the mobile (row-by-row) and desktop (stacked) trees.
  const pools = {
    developer: {
      label: "Developers",
      pct: plan.developerBps / 100,
      amount: d.developerPoolCents,
      subContainers: ["Main Developer 75–80%", "Assistant Developer 5–10%", "Creatives Developer 15%"],
    },
    staff: {
      label: "Staff",
      pct: plan.staffBps / 100,
      amount: d.staffPoolCents,
      subContainers: ["Lead Partnerships 20%", "Management 50%", "Marketing 20%", "Accounting 10%"],
    },
    company: {
      label: "Company",
      pct: plan.companyBps / 100,
      amount: d.companyCents,
      subContainers: [
        "Company Revenue and Investment ROI",
        "Development Expenses",
        "General Expenses",
      ],
    },
  };

  return (
    <div>
      {/* Top-level split containers */}
      <div className="space-y-2">
        {/* Mobile: row-by-row (header cards, then each pool's split as its own block) */}
        <div className="sm:hidden space-y-3">
          {/* Row 1 — the three pool header cards only */}
          <div className="grid grid-cols-3 gap-2">
            <PoolHeaderCard label={pools.developer.label} pct={pools.developer.pct} amount={pools.developer.amount} />
            <PoolHeaderCard label={pools.staff.label} pct={pools.staff.pct} amount={pools.staff.amount} />
            <PoolHeaderCard label={pools.company.label} pct={pools.company.pct} amount={pools.company.amount} />
          </div>

          {/* Row 2 — Developers split */}
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Developers split</p>
            <SubGrid subContainers={pools.developer.subContainers} cols={3} />
          </div>

          {/* Row 3 — Staff split */}
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Staff split</p>
            <SubGrid subContainers={pools.staff.subContainers} cols={2} />
          </div>

          {/* Row 4 — Company */}
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Company</p>
            <SubGrid subContainers={pools.company.subContainers} cols={2} />
          </div>
        </div>

        {/* Desktop: 3 pool headers side by side, each with its own sub-containers stacked beneath */}
        <div className="hidden sm:flex gap-3 items-stretch">
          <PoolHeader
            label={pools.developer.label}
            pct={pools.developer.pct}
            amount={pools.developer.amount}
            subContainers={pools.developer.subContainers}
          />
          <PoolHeader
            label={pools.staff.label}
            pct={pools.staff.pct}
            amount={pools.staff.amount}
            subContainers={pools.staff.subContainers}
          />
          <PoolHeader
            label={pools.company.label}
            pct={pools.company.pct}
            amount={pools.company.amount}
            subContainers={pools.company.subContainers}
          />
        </div>

        <p className="text-[11px] text-muted-foreground">
          Development Expenses are taken from the Total Developer Pool. General Expenses are taken from the Company Revenue.
        </p>
      </div>

      {/* Column headers (desktop only — mobile share cards are self-describing) */}
      <div className="hidden sm:flex items-center gap-3 px-3 h-9 border-y border-border text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        <span className="w-2 shrink-0" />
        <span className="flex-1 min-w-0">Name</span>
        <span className="w-36 shrink-0">Role</span>
        <span className="w-36 shrink-0 text-right">Percentage</span>
        <span className="w-24 shrink-0 text-right">Agreed</span>
        <span className="w-7 shrink-0" />
      </div>

      {/* Share rows */}
      {plan.share.length === 0 ? (
        <div className="px-3 py-4 text-xs text-muted-foreground">Nobody on this split yet.</div>
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

      {/* Add Member button */}
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

      {/* Finalize gate */}
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

      {/* Popups */}
      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectMembers={projectMembers}
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

// ─── Main panel ───────────────────────────────────────────────────────────────

export function CommissionPanel({ projectId, isOwner }: CommissionPanelProps) {
  const api = useCommission(projectId);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // Load project members from phase-2 assignment data.
  useEffect(() => {
    get<ProjectMember[]>(`/api/projects/${projectId}/members`)
      .then((res) => {
        if (res.data) setProjectMembers(res.data);
      })
      .catch(() => {});
  }, [projectId]);

  if (api.isLoading) {
    return (
      <Panel title="Commission">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </Panel>
    );
  }

  const plans = api.commissionPlan;
  const hasPlan = plans.length > 0;

  const panelAction = isOwner ? (
    hasPlan ? (
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setConfirmDelete(plans[0].commissionPlanId)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    ) : (
      <Button
        size="sm"
        className="h-7 text-xs"
        disabled={api.isCreating}
        onClick={() => api.createCommissionPlan({ projectId })}
      >
        {api.isCreating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        <span className="ml-1.5">Draft Plan</span>
      </Button>
    )
  ) : undefined;

  return (
    <Panel title="Commission" action={panelAction}>
      <ConfirmDeleteDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
        onConfirm={() => {
          if (confirmDelete !== null) api.deleteCommissionPlan(confirmDelete);
          setConfirmDelete(null);
        }}
        noun="commission plan"
        detail="All shares in this draft will be removed."
      />
      {hasPlan ? (
        <div className="space-y-3 p-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.commissionPlanId}
              plan={plan}
              projectMembers={projectMembers}
              api={api}
              isFinalizing={api.isFinalizing}
            />
          ))}
        </div>
      ) : (
        <p className="px-4 py-3 text-xs text-muted-foreground">No commission plan drafted yet.</p>
      )}
    </Panel>
  );
}

export default CommissionPanel;
