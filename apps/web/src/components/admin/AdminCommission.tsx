import { useState } from "react";
import { Plus, Trash2, Loader2, Lock, Check, Sparkles, AlertTriangle } from "lucide-react";
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
  useCommission,
  type CommissionPlan,
  type CommissionRole,
  type CommissionShare,
} from "@/hooks/useCommission";
import { useAdminTeam } from "@/hooks/useAdminTeam";
import { Empty, Dot } from "@/components/admin/_ui";

/**
 * /admin -> Finance -> Commission.
 *
 * The team-facing surface for the 60/25/15 split. Everything money-shaped on this screen
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
  main_developer: "Main developer",
  assistant_developer: "Assistant developer",
  referral: "Referral",
  marketing: "Marketing",
  accounting: "Accounting",
  management: "Management",
  company: "Company reserve",
};

const ASSIGNABLE_ROLE: CommissionRole[] = [
  "main_developer",
  "assistant_developer",
  "referral",
  "marketing",
  "accounting",
  "management",
];

const POOL_DOT: Record<CommissionShare["pool"], string> = {
  developer: "bg-accent",
  staff: "bg-blue-500",
  company: "bg-muted-foreground/50",
};

interface ProjectSummary {
  project_id: number;
  title: string;
  total_value_cents: number;
}

/* ─── One share row ───────────────────────────────────────── */

const ShareRow = ({
  share,
  isFrozen,
  onWeight,
  onAgree,
  onRemove,
}: {
  share: CommissionShare;
  isFrozen: boolean;
  onWeight: (contributionBps: number) => void;
  onAgree: (isAgreed: boolean) => void;
  onRemove: () => void;
}) => {
  const [draftWeight, setDraftWeight] = useState(String(share.contributionBps));
  const isCompany = share.role === "company";

  return (
    <div className="flex items-center gap-3 px-3 h-11 text-sm">
      <span className="w-40 shrink-0 flex items-center gap-1.5">
        <Dot className={POOL_DOT[share.pool]} />
        <span className="text-xs text-muted-foreground truncate">{ROLE_LABEL[share.role]}</span>
      </span>

      <span className="flex-1 min-w-0 font-medium truncate">
        {share.memberName ?? "ADVO — expenses & investment ROI"}
      </span>

      {/* Relative weight within this role's pool. The server turns it into pesos. */}
      <span className="w-28 shrink-0 flex items-center justify-end gap-1">
        {isCompany ? (
          <span className="text-xs text-muted-foreground tabular-nums">fixed</span>
        ) : (
          <Input
            value={draftWeight}
            onChange={(e) => setDraftWeight(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={() => {
              const next = Number(draftWeight || 0);
              if (next !== share.contributionBps) onWeight(next);
            }}
            disabled={isFrozen}
            className="h-7 w-20 text-xs text-right tabular-nums"
            aria-label={`Contribution weight for ${share.memberName ?? "share"}`}
          />
        )}
      </span>

      <span className="w-28 shrink-0 text-right font-medium tabular-nums">
        {formatPeso(share.computedAmountCents)}
      </span>

      {/* Prince: the split "must be mutually agreed on by the devs upon project
          completion". Editing a weight resets this server-side. */}
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
            {share.isAgreed ? <Check className="h-3 w-3" /> : null}
            <span className={share.isAgreed ? "ml-1" : ""}>
              {share.isAgreed ? "Agreed" : "Agree"}
            </span>
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

/* ─── Add-a-person form ───────────────────────────────────── */

const AddShareForm = ({
  member,
  onAdd,
}: {
  member: { team_member_id: number; name: string }[];
  onAdd: (input: { teamMemberId: number; role: CommissionRole }) => void;
}) => {
  const [teamMemberId, setTeamMemberId] = useState("");
  const [role, setRole] = useState<CommissionRole>("main_developer");

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-secondary/20">
      <Select value={teamMemberId} onValueChange={setTeamMemberId}>
        <SelectTrigger className="h-8 flex-1 text-xs">
          <SelectValue placeholder="Team member" />
        </SelectTrigger>
        <SelectContent>
          {member.map((m) => (
            <SelectItem key={m.team_member_id} value={String(m.team_member_id)}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={role} onValueChange={(v) => setRole(v as CommissionRole)}>
        <SelectTrigger className="h-8 w-44 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ASSIGNABLE_ROLE.map((r) => (
            <SelectItem key={r} value={r}>
              {ROLE_LABEL[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        size="sm"
        variant="outline"
        className="h-8"
        disabled={!teamMemberId}
        onClick={() => {
          onAdd({ teamMemberId: Number(teamMemberId), role });
          setTeamMemberId("");
        }}
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="ml-1">Add</span>
      </Button>
    </div>
  );
};

/* ─── One plan ────────────────────────────────────────────── */

const PlanCard = ({
  plan,
  member,
  api,
  isFinalizing,
}: {
  plan: CommissionPlan;
  member: { team_member_id: number; name: string }[];
  api: ReturnType<typeof useCommission>;
  isFinalizing: boolean;
}) => {
  const [draftBasis, setDraftBasis] = useState((plan.basisCents / 100).toFixed(2));
  const isFrozen = plan.status !== "draft";
  const d = plan.derived;

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-3 h-11 border-b border-border">
        <span className="flex-1 min-w-0 font-medium text-sm truncate">
          {plan.projectTitle ?? `Project ${plan.projectId}`}
        </span>

        {isFrozen ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
            <Lock className="h-3 w-3" />
            {plan.status === "void" ? "Void" : "Finalized"}
          </span>
        ) : (
          <>
            {/* Pesos in, cents out — multiplied by 100 exactly once, here. */}
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-muted-foreground">Basis ₱</span>
              <Input
                value={draftBasis}
                onChange={(e) => setDraftBasis(e.target.value.replace(/[^0-9.]/g, ""))}
                onBlur={() => {
                  const cents = Math.round(Number(draftBasis || 0) * 100);
                  if (cents !== plan.basisCents) {
                    api.updateCommissionPlan({
                      commissionPlanId: plan.commissionPlanId,
                      basisCents: cents,
                    });
                  }
                }}
                className="h-7 w-28 text-xs text-right tabular-nums"
                aria-label="Split basis in pesos"
              />
            </span>

            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs shrink-0"
              onClick={() => api.seedFromProjectAccess(plan.commissionPlanId)}
              title="Propose developer slots from who already has access to this project"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="ml-1">Seed</span>
            </Button>
          </>
        )}
      </div>

      {/* Pool summary. Every figure allocated server-side. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
        <div className="bg-card px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70">
            Developer {plan.developerBps / 100}%
          </div>
          <div className="text-sm font-medium tabular-nums">{formatPeso(d.developerPoolCents)}</div>
        </div>
        <div className="bg-card px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70">
            Staff {plan.staffBps / 100}%
          </div>
          <div className="text-sm font-medium tabular-nums">{formatPeso(d.staffPoolCents)}</div>
        </div>
        <div className="bg-card px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70">
            Company {plan.companyBps / 100}%
          </div>
          <div className="text-sm font-medium tabular-nums">{formatPeso(d.companyCents)}</div>
        </div>
        <div className="bg-card px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70">
            Allocated
          </div>
          <div className="text-sm font-medium tabular-nums">
            {formatPeso(d.allocatedCents)}
            <span className="text-xs text-muted-foreground"> / {formatPeso(d.basisCents)}</span>
          </div>
        </div>
      </div>

      {/* Staff quarter, already sub-split 28/24/24/24 by the server. */}
      <div className="px-3 py-1.5 border-t border-border text-xs text-muted-foreground">
        Staff pool — referral {formatPeso(d.staffRolePoolCents.referral)} · marketing{" "}
        {formatPeso(d.staffRolePoolCents.marketing)} · accounting{" "}
        {formatPeso(d.staffRolePoolCents.accounting)} · management{" "}
        {formatPeso(d.staffRolePoolCents.management)}
      </div>

      <div className="flex items-center gap-3 px-3 h-9 border-y border-border text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
        <span className="w-40 shrink-0">Role</span>
        <span className="flex-1 min-w-0">Person</span>
        <span className="w-28 shrink-0 text-right">Weight</span>
        <span className="w-28 shrink-0 text-right">Amount</span>
        <span className="w-24 shrink-0 text-right">Agreed</span>
        <span className="w-7 shrink-0" />
      </div>

      {plan.share.length === 0 ? (
        <Empty text="Nobody on this split yet" />
      ) : (
        <div className="divide-y divide-border">
          {plan.share.map((share) => (
            <ShareRow
              key={share.commissionShareId}
              share={share}
              isFrozen={isFrozen}
              onWeight={(contributionBps) =>
                api.updateCommissionShare({
                  commissionShareId: share.commissionShareId,
                  contributionBps,
                })
              }
              onAgree={(isAgreed) =>
                api.updateCommissionShare({ commissionShareId: share.commissionShareId, isAgreed })
              }
              onRemove={() => api.removeCommissionShare(share.commissionShareId)}
            />
          ))}
        </div>
      )}

      {!isFrozen && (
        <AddShareForm
          member={member}
          onAdd={(input) =>
            api.addCommissionShare({ commissionPlanId: plan.commissionPlanId, ...input })
          }
        />
      )}

      {/* The gate, quoted from the server. Finalize re-derives this same list. */}
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
            {isFinalizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
            <span className="ml-1.5">Finalize</span>
          </Button>
        </div>
      )}
    </div>
  );
};

/* ─── Section ─────────────────────────────────────────────── */

const AdminCommission = ({ projects }: { projects: ProjectSummary[] }) => {
  const api = useCommission();
  const { activeMembers } = useAdminTeam();
  const [newProjectId, setNewProjectId] = useState("");

  const planned = new Set(
    api.commissionPlan.filter((p) => p.status !== "void").map((p) => p.projectId),
  );
  const unplanned = projects.filter((p) => !planned.has(p.project_id));

  const finalizedCents = api.commissionPlan
    .filter((p) => p.status === "finalized")
    .reduce((sum, p) => sum + p.derived.allocatedCents, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Commission</h2>
          <p className="text-xs text-muted-foreground">
            60% developer · 25% staff (28/24/24/24 referral, marketing, accounting, management) ·
            15% company reserve · {formatPeso(finalizedCents)} finalized
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
          <Empty text="No commission plan drafted yet" />
        </div>
      ) : (
        <div className="space-y-3">
          {api.commissionPlan.map((plan) => (
            <PlanCard
              key={plan.commissionPlanId}
              plan={plan}
              member={activeMembers}
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
