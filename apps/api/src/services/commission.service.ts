/**
 * Commission split — how ADVO pays itself.
 *
 * Prince, 2026-06-19: 60% developer / 25% staff / 15% company. The staff quarter
 * sub-splits 28% referral / 24% marketing / 24% accounting / 24% management. Inside a
 * role held by several people the split is by contribution, "mutually agreed on by the
 * devs upon project completion". Per project: 1 main developer, 1 assistant developer.
 *
 * Seven invariants this file exists to hold. Each is asserted by
 * apps/web/src/test/commission.test.ts, so weakening any of them turns it red:
 *
 *   1. EXACT TO THE CENTAVO — allocate() is largest-remainder (Hamilton) apportionment.
 *      sum(allocate(total, w)) === total for EVERY total and every weight vector,
 *      including the ugly ones. ₱1.00 across three equal devs is 34+33+33, never
 *      33+33+33 with a centavo quietly evaporating.
 *
 *   2. ROUNDING HAPPENS IN EXACTLY ONE PLACE — allocate(). It is applied recursively
 *      (basis -> pool, staff pool -> role, role -> person) and each level is exact, so
 *      the sum is exact at every level rather than only at the top.
 *
 *   3. NO RESIDUE ANYWHERE — the 15% company reserve is a real share row, not a
 *      leftover. computeSplit() therefore reports unallocatedCents explicitly, and
 *      finalize REFUSES while it is non-zero. Money with no name attached never silently
 *      lands in the company pot.
 *
 *   4. INTEGER CENTS, INTEGER BASIS POINTS — no float touches this file. Percentages are
 *      bps (6000 = 60%), read off the PLAN ROW and never from a constant, so renegotiating
 *      the split cannot retroactively rewrite an already-finalized plan.
 *
 *   5. DRAFT AMOUNTS ARE DERIVED, FINAL AMOUNTS ARE FROZEN — while draft, every share
 *      amount is recomputed on read (so an edited contribution can never leave a stale
 *      peso behind). finalizeCommissionPlan() writes them into amount_cents once, and
 *      nothing may edit the plan afterwards.
 *
 *   6. FINALIZE IS ATOMIC AND SINGLE-SHOT — one transaction, and the guard is
 *      UPDATE ... WHERE finalized_at IS NULL RETURNING. Zero rows = 409. The DB enforces
 *      single-finalization, not application care (project_signoff.sign precedent).
 *
 *   7. MUTUAL AGREEMENT IS A GATE — finalize refuses while any person-held share is
 *      unagreed. Prince's "mutually agreed" is a column, not a convention.
 *
 * Deliberately NOT here: payout, disbursement, any payment rail, and any scheduler. A
 * finalized plan states who is owed what. Moving the money is a separate model and a
 * separate act by a human.
 */
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/connection.js";
import {
  activityLog,
  commissionPlan,
  commissionShare,
  project,
  projectAccess,
  projectRoleAssignment,
  projectTierAssignment,
  teamMember,
  user,
} from "../db/schema.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("commission");

// ─── The role vocabulary ─────────────────────────────

export const DEVELOPER_ROLE = [
  "main_developer",
  "assistant_developer",
  "creatives_developer",
] as const;
export const STAFF_ROLE = ["lead_partnerships", "referral", "marketing", "accounting", "management"] as const;
export const COMMISSION_ROLE = [...DEVELOPER_ROLE, ...STAFF_ROLE, "company"] as const;

export type DeveloperRole = (typeof DEVELOPER_ROLE)[number];
export type StaffRole = (typeof STAFF_ROLE)[number];
export type CommissionRole = (typeof COMMISSION_ROLE)[number];

// The four staff sub-pool roles that map to commission_plan columns.
// "lead_partnerships" uses the referral_bps column (column rename avoided via app label only).
// "referral" is kept valid for reading historical rows.
export const STAFF_POOL_ROLES = ["lead_partnerships", "referral", "marketing", "accounting", "management"] as const;

// Maps a project_role_assignment.project_role to the commission role that represents it.
// Roles not present in this map are skipped — not every project role has a commission seat.
export const PROJECT_ROLE_TO_COMMISSION_ROLE: Record<string, CommissionRole> = {
  lead_developer: "main_developer",
  assistant_developer: "assistant_developer",
  creatives_developer: "creatives_developer",
  referral: "referral",
  project_manager: "management",
};

export const COMMISSION_STATUS = ["draft", "finalized", "void"] as const;
export type CommissionStatus = (typeof COMMISSION_STATUS)[number];

/**
 * Prince's numbers, as basis points. These are the DEFAULTS a new plan is seeded with —
 * they are copied into the plan row and read back from there forever after. Nothing in
 * the allocation path may read these constants; that is the whole point of storing them.
 *
 * Updated by Phase 8 / migration 030: 55/35/10 top split; 20/50/10/20 staff sub-split
 * (Lead Partnerships 20%, Management 50%, Marketing 20%, Accounting 10%).
 */
export const DEFAULT_BPS = {
  developer: 5500,
  staff: 3500,
  company: 1000,
  // "referral" column in DB is now displayed as "Lead Partnerships". Default updated.
  referral: 2000,
  marketing: 5000,
  accounting: 1000,
  management: 2000,
} as const;

// ─── THE ALLOCATOR ───────────────────────────────────

/**
 * Largest-remainder (Hamilton) apportionment of `totalCents` across `weight`.
 *
 * THE RULE, stated once so it can be argued with:
 *   Each slot gets floor(total * wᵢ / Σw). That floor loses up to one centavo per slot,
 *   so the leftover — total minus the sum of the floors, always 0..n-1 centavos — is
 *   handed out ONE CENTAVO AT A TIME to the slots with the largest fractional remainder.
 *   Ties break by slot order (ledger order), which makes a recompute byte-identical
 *   rather than merely equivalent.
 *
 * Consequences worth knowing:
 *   - sum(result) === totalCents ALWAYS. Not approximately. This is the property every
 *     level of the split depends on, and it is why no centavo is lost or invented.
 *   - An all-zero weight vector means "no contribution recorded yet" and splits evenly.
 *     That is a PLACEHOLDER, not an agreement — is_agreed still gates finalize.
 *   - Weights are relative. [60, 40] and [6000, 4000] allocate identically.
 *
 * No float arithmetic: the comparison is on the integer numerator total*wᵢ mod Σw.
 */
export function allocate(totalCents: number, weight: number[]): number[] {
  if (weight.length === 0) return [];
  if (!Number.isInteger(totalCents)) {
    throw new HTTPException(500, { message: "Commission allocation requires integer cents" });
  }

  let sum = weight.reduce((a, b) => a + b, 0);
  // No contribution recorded yet — split evenly rather than paying everyone zero and
  // dumping the whole pool into the rounding remainder.
  const w = sum === 0 ? weight.map(() => 1) : weight;
  if (sum === 0) sum = w.length;

  const base = w.map((wi) => Math.floor((totalCents * wi) / sum));
  const remainder = w.map((wi) => (totalCents * wi) % sum);

  let leftover = totalCents - base.reduce((a, b) => a + b, 0);

  // Largest remainder first; ties by slot order, so the result is deterministic.
  const order = base
    .map((_, index) => index)
    .sort((a, b) => (remainder[b] - remainder[a]) || (a - b));

  for (const index of order) {
    if (leftover <= 0) break;
    base[index] += 1;
    leftover -= 1;
  }

  return base;
}

// ─── Types ───────────────────────────────────────────

export type PlanRow = typeof commissionPlan.$inferSelect;
export type ShareRow = typeof commissionShare.$inferSelect;

export type ShareComputed = ShareRow & {
  /** What this row is owed. Derived while draft, the frozen amount_cents once finalized. */
  computedAmountCents: number;
  /** Which pool this row draws from — developer, staff or company. */
  pool: "developer" | "staff" | "company";
  memberName: string | null;
};

export type SplitDerived = {
  basisCents: number;
  developerPoolCents: number;
  staffPoolCents: number;
  companyCents: number;
  /** The staff pool, sub-split by the plan's staff bps columns. */
  staffRolePoolCents: Record<StaffRole, number>;
  /** Cents belonging to a pool that has NOBODY in it. Must be 0 to finalize. */
  unallocatedCents: number;
  /** Sum of every share row. Equals basisCents exactly when unallocatedCents is 0. */
  allocatedCents: number;
  isAgreedComplete: boolean;
  isProjectComplete: boolean;
  isFinalizeReady: boolean;
  /** Every reason finalize would refuse right now, in plain words for the admin UI. */
  blocker: string[];
};

export type PlanDetail = PlanRow & {
  share: ShareComputed[];
  derived: SplitDerived;
  projectTitle: string | null;
};

// ─── THE COMPUTATION ─────────────────────────────────

const isStaffRole = (role: string): role is StaffRole =>
  (STAFF_ROLE as readonly string[]).includes(role);

const isDeveloperRole = (role: string): role is DeveloperRole =>
  (DEVELOPER_ROLE as readonly string[]).includes(role);

/**
 * Map a commission_share.role to the plan column that holds its staff pool BPS.
 * "lead_partnerships" uses referral_bps (the DB column was not renamed).
 * "referral" also maps to referral_bps for historical rows.
 */
function staffRoleBpsKey(role: string): keyof PlanRow | null {
  switch (role) {
    case "lead_partnerships":
    case "referral":
      return "referralBps";
    case "marketing":
      return "marketingBps";
    case "accounting":
      return "accountingBps";
    case "management":
      return "managementBps";
    default:
      return null;
  }
}

/**
 * The whole split, computed from the plan snapshot plus the ledger. PURE — it touches no
 * database, which is exactly why the test can hammer it with awkward numbers.
 *
 * Three levels, each exact:
 *   basis      -> [developer pool, staff pool, company]                    by the plan's top bps
 *   staff pool -> [lead_partnerships/referral, marketing, accounting, management] by the plan's staff bps
 *   each pool  -> its people                                               by contribution_bps
 *
 * A pool with no share rows keeps its cents as `unallocatedCents` rather than having them
 * absorbed anywhere. Nameless money is a blocker, not a rounding detail.
 *
 * Staff role mapping (Phase 8):
 *   "lead_partnerships" is the new canonical name. "referral" is kept valid for historical rows.
 *   Both map to the referral_bps column. For pool distribution they are treated as the same pool.
 */
export function computeSplit(
  plan: PlanRow,
  share: ShareRow[],
): { amountByShareId: Map<number, number>; derived: Omit<SplitDerived, "isProjectComplete" | "isFinalizeReady" | "blocker"> } {
  const basisCents = plan.basisCents;

  // Level 1 — the top split. Read off the PLAN, never off DEFAULT_BPS.
  const [developerPoolCents, staffPoolCents, companyCents] = allocate(basisCents, [
    plan.developerBps,
    plan.staffBps,
    plan.companyBps,
  ]);

  // Level 2 — the staff pool's internal split.
  const staffPortion = allocate(staffPoolCents, [
    plan.referralBps,
    plan.marketingBps,
    plan.accountingBps,
    plan.managementBps,
  ]);
  // "referral" key is kept for backward compatibility with the SplitDerived type.
  const staffRolePoolCents: Record<StaffRole, number> = {
    lead_partnerships: staffPortion[0],
    referral: staffPortion[0], // same pool, historical alias
    marketing: staffPortion[1],
    accounting: staffPortion[2],
    management: staffPortion[3],
  };

  const amountByShareId = new Map<number, number>();
  let unallocatedCents = 0;

  /** Level 3 — hand one pool to the people in it, or record it as nameless. */
  const spread = (poolCents: number, row: ShareRow[]) => {
    if (row.length === 0) {
      unallocatedCents += poolCents;
      return;
    }
    const part = allocate(
      poolCents,
      row.map((r) => r.contributionBps),
    );
    row.forEach((r, index) => amountByShareId.set(r.commissionShareId, part[index]));
  };

  // Developer pool: main_developer, assistant_developer, creatives_developer all share ONE pool.
  // Split by contribution — not fixed sub-slices.
  spread(
    developerPoolCents,
    share.filter((r) => isDeveloperRole(r.role)),
  );

  // Staff pools by named role. lead_partnerships and referral share the referral_bps pool.
  const referralPool = share.filter((r) => r.role === "lead_partnerships" || r.role === "referral");
  spread(staffRolePoolCents.referral, referralPool);
  spread(staffRolePoolCents.marketing, share.filter((r) => r.role === "marketing"));
  spread(staffRolePoolCents.accounting, share.filter((r) => r.role === "accounting"));
  spread(staffRolePoolCents.management, share.filter((r) => r.role === "management"));

  const companyShare = share.filter((r) => r.role === "company");
  if (companyShare.length === 0) unallocatedCents += companyCents;
  else amountByShareId.set(companyShare[0].commissionShareId, companyCents);

  const allocatedCents = [...amountByShareId.values()].reduce((a, b) => a + b, 0);

  const isAgreedComplete = share
    .filter((r) => r.teamMemberId !== null)
    .every((r) => r.isAgreed);

  return {
    amountByShareId,
    derived: {
      basisCents,
      developerPoolCents,
      staffPoolCents,
      companyCents,
      staffRolePoolCents,
      unallocatedCents,
      allocatedCents,
      isAgreedComplete,
    },
  };
}

/**
 * Every reason finalize would refuse, spelled out. The UI shows this list; finalize
 * re-derives it server-side and refuses on the same list, so the gate lives in the write
 * path and not only in the query that drew the button.
 */
export function finalizeBlocker(
  plan: PlanRow,
  share: ShareRow[],
  projectStatus: string | null,
  derived: { unallocatedCents: number; isAgreedComplete: boolean },
): string[] {
  const blocker: string[] = [];

  if (plan.status === "finalized") blocker.push("This plan is already finalized.");
  if (plan.status === "void") blocker.push("This plan is void.");
  if (plan.basisCents <= 0) blocker.push("The split basis is zero.");
  if (projectStatus !== null && projectStatus !== "shipped") {
    blocker.push("The project is not shipped yet.");
  }
  if (!share.some((r) => r.role === "main_developer")) {
    blocker.push("No main developer assigned.");
  }
  if (!share.some((r) => r.role === "company")) {
    blocker.push("The company reserve row is missing.");
  }
  if (derived.unallocatedCents > 0) {
    blocker.push(
      `₱${(derived.unallocatedCents / 100).toFixed(2)} belongs to a role with nobody in it. Assign someone or move the percentage.`,
    );
  }
  if (!derived.isAgreedComplete) {
    blocker.push("Not every share is agreed yet — the split must be mutually agreed.");
  }

  return blocker;
}

// ─── Read ────────────────────────────────────────────

async function decorate(plan: PlanRow): Promise<PlanDetail> {
  const share = await db()
    .select()
    .from(commissionShare)
    .where(eq(commissionShare.commissionPlanId, plan.commissionPlanId))
    .orderBy(asc(commissionShare.commissionShareId));

  const memberId = share.map((r) => r.teamMemberId).filter((id): id is number => id !== null);
  const member =
    memberId.length === 0
      ? []
      : await db()
          .select({ teamMemberId: teamMember.teamMemberId, name: teamMember.name })
          .from(teamMember)
          .where(inArray(teamMember.teamMemberId, memberId));
  const nameById = new Map(member.map((m) => [m.teamMemberId, m.name]));

  const [found] = await db()
    .select({ title: project.title, projectStatus: project.projectStatus })
    .from(project)
    .where(eq(project.projectId, plan.projectId))
    .limit(1);

  const { amountByShareId, derived } = computeSplit(plan, share);
  const isFinalized = plan.finalizedAt !== null;

  const decorated: ShareComputed[] = share.map((r) => ({
    ...r,
    // Once frozen, the STORED amount is the record. Never re-derive over the top of it —
    // a display that disagrees with what was agreed is worse than no display.
    computedAmountCents: isFinalized
      ? (r.amountCents ?? 0)
      : (amountByShareId.get(r.commissionShareId) ?? 0),
    pool: r.role === "company" ? "company" : isDeveloperRole(r.role) ? "developer" : "staff",
    memberName: r.teamMemberId === null ? null : (nameById.get(r.teamMemberId) ?? null),
  }));

  const projectStatus = found?.projectStatus ?? null;
  const blocker = isFinalized
    ? []
    : finalizeBlocker(plan, share, projectStatus, derived);

  return {
    ...plan,
    share: decorated,
    projectTitle: found?.title ?? null,
    derived: {
      ...derived,
      isProjectComplete: projectStatus === "shipped",
      isFinalizeReady: !isFinalized && blocker.length === 0,
      blocker,
    },
  };
}

export async function listCommissionPlan(projectId?: number): Promise<PlanDetail[]> {
  const row = await db()
    .select()
    .from(commissionPlan)
    .where(projectId === undefined ? undefined : eq(commissionPlan.projectId, projectId))
    .orderBy(desc(commissionPlan.commissionPlanId));

  return Promise.all(row.map((plan) => decorate(plan)));
}

async function planOr404(commissionPlanId: number): Promise<PlanRow> {
  const [plan] = await db()
    .select()
    .from(commissionPlan)
    .where(eq(commissionPlan.commissionPlanId, commissionPlanId))
    .limit(1);
  if (!plan) throw new HTTPException(404, { message: "Commission plan not found" });
  return plan;
}

export async function getCommissionPlan(commissionPlanId: number): Promise<PlanDetail> {
  return decorate(await planOr404(commissionPlanId));
}

/** Everything one team member has been agreed to earn, across every project. */
export async function listMemberEarning(teamMemberId: number) {
  const row = await db()
    .select({ share: commissionShare, plan: commissionPlan })
    .from(commissionShare)
    .innerJoin(
      commissionPlan,
      eq(commissionShare.commissionPlanId, commissionPlan.commissionPlanId),
    )
    .where(eq(commissionShare.teamMemberId, teamMemberId))
    .orderBy(desc(commissionPlan.commissionPlanId));

  const live = row.filter((r) => r.plan.status !== "void");

  return {
    teamMemberId,
    finalizedCents: live
      .filter((r) => r.plan.status === "finalized")
      .reduce((sum, r) => sum + (r.share.amountCents ?? 0), 0),
    draftShareCount: live.filter((r) => r.plan.status === "draft").length,
    entry: live.map((r) => ({
      commissionPlanId: r.plan.commissionPlanId,
      projectId: r.plan.projectId,
      role: r.share.role,
      status: r.plan.status,
      contributionBps: r.share.contributionBps,
      isAgreed: r.share.isAgreed,
      amountCents: r.share.amountCents,
    })),
  };
}

// ─── Write ───────────────────────────────────────────

function assertDraft(plan: PlanRow) {
  if (plan.finalizedAt !== null) {
    throw new HTTPException(409, {
      message: "A finalized commission plan is frozen — void it and draft a new one instead",
    });
  }
  if (plan.status === "void") {
    throw new HTTPException(409, { message: "This commission plan is void" });
  }
}

export type CreatePlanInput = {
  projectId: number;
  basisCents?: number;
  basisNote?: string | null;
  note?: string | null;
  userId: number;
};

/**
 * A new plan is seeded with Prince's percentages and, critically, WITH ITS COMPANY
 * RESERVE ROW ALREADY IN PLACE. The 15% is never an afterthought that someone has to
 * remember to add — a plan is born whole, and its ledger sums to the basis from the
 * first read.
 */
export async function createCommissionPlan(input: CreatePlanInput): Promise<PlanDetail> {
  const [found] = await db()
    .select({ totalValueCents: project.totalValueCents })
    .from(project)
    .where(eq(project.projectId, input.projectId))
    .limit(1);
  if (!found) throw new HTTPException(404, { message: "Project not found" });

  const plan = await db().transaction(async (tx) => {
    const [created] = await tx
      .insert(commissionPlan)
      .values({
        projectId: input.projectId,
        // Seeded from the project's contract value, then independently editable.
        basisCents: input.basisCents ?? found.totalValueCents,
        basisNote: input.basisNote ?? null,
        developerBps: DEFAULT_BPS.developer,
        staffBps: DEFAULT_BPS.staff,
        companyBps: DEFAULT_BPS.company,
        referralBps: DEFAULT_BPS.referral,
        marketingBps: DEFAULT_BPS.marketing,
        accountingBps: DEFAULT_BPS.accounting,
        managementBps: DEFAULT_BPS.management,
        note: input.note ?? null,
        createdBy: input.userId,
      })
      .returning();

    // The company reserve is a real ledger row with no member, agreed by construction —
    // there is nobody to agree with. See migration 018, decision 3.
    await tx.insert(commissionShare).values({
      commissionPlanId: created.commissionPlanId,
      teamMemberId: null,
      role: "company",
      contributionBps: 0,
      isAgreed: true,
      agreedAt: new Date(),
      note: "Company reserve — expenses and investment ROI payback.",
    });

    // Draft auto-seed: pull active team members from the project's role assignments and
    // mirror them into the commission ledger. Weights stay at 0 — contribution is mutually
    // agreed by the people involved on project completion, never by the machine that created
    // the plan. Same philosophy as seedFromProjectAccess (~line 715): suggest, don't decide.
    //
    // If there are no role assignments, the plan is born exactly as before (company row only).
    // This block must never throw and break plan creation — errors here are logged, not
    // propagated, so the plan lands cleanly even on a misconfigured project.
    try {
      const roleAssignments = await tx
        .select({
          teamMemberId: projectRoleAssignment.teamMemberId,
          projectRole: projectRoleAssignment.projectRole,
        })
        .from(projectRoleAssignment)
        .innerJoin(teamMember, eq(teamMember.teamMemberId, projectRoleAssignment.teamMemberId))
        .where(
          and(
            eq(projectRoleAssignment.projectId, input.projectId),
            eq(teamMember.isActive, true),
          ),
        );

      // Single-slot roles: the DB partial unique index allows exactly one row per plan for
      // main_developer and assistant_developer. Track which have already been filled so a
      // second person mapped to the same single-slot role is skipped rather than colliding.
      const SINGLE_SLOT_ROLES = new Set<CommissionRole>(["main_developer", "assistant_developer"]);
      const filledSingleSlot = new Set<CommissionRole>();

      // Deduplicate on (teamMemberId, mappedRole) so a person with the same project role
      // twice (data anomaly) does not generate two identical share rows.
      const inserted = new Set<string>();

      for (const row of roleAssignments) {
        const mappedRole = PROJECT_ROLE_TO_COMMISSION_ROLE[row.projectRole];
        if (!mappedRole) continue; // project role has no commission seat — skip

        if (SINGLE_SLOT_ROLES.has(mappedRole)) {
          if (filledSingleSlot.has(mappedRole)) continue; // slot already taken — skip
          filledSingleSlot.add(mappedRole);
        }

        const key = `${row.teamMemberId}:${mappedRole}`;
        if (inserted.has(key)) continue; // exact duplicate in this loop — skip
        inserted.add(key);

        await tx.insert(commissionShare).values({
          commissionPlanId: created.commissionPlanId,
          teamMemberId: row.teamMemberId,
          role: mappedRole,
          contributionBps: 0,
          note: "Auto-added from project roles — contribution still to be agreed.",
        });
      }
    } catch (err) {
      log.warn({ err, projectId: input.projectId }, "commission auto-seed from project roles failed — plan created with company row only");
    }

    await tx.insert(activityLog).values({
      userId: input.userId,
      action: "commission_plan_created",
      entityType: "commission_plan",
      entityId: created.commissionPlanId,
      metadata: { projectId: input.projectId, basisCents: created.basisCents },
    });

    return created;
  });

  return decorate(plan);
}

export type UpdatePlanInput = {
  basisCents?: number;
  basisNote?: string | null;
  developerBps?: number;
  staffBps?: number;
  companyBps?: number;
  referralBps?: number;
  marketingBps?: number;
  accountingBps?: number;
  managementBps?: number;
  note?: string | null;
};

/**
 * Editable ONLY while draft. The two CHECK constraints in 018 mean a percentage edit that
 * does not still sum to 10000 is rejected by the database, so there is no window in which
 * a plan exists whose percentages do not add up.
 */
export async function updateCommissionPlan(
  commissionPlanId: number,
  input: UpdatePlanInput,
): Promise<PlanDetail> {
  assertDraft(await planOr404(commissionPlanId));

  const [updated] = await db()
    .update(commissionPlan)
    .set({ ...input, updatedAt: new Date() })
    .where(
      and(eq(commissionPlan.commissionPlanId, commissionPlanId), isNull(commissionPlan.finalizedAt)),
    )
    .returning();

  if (!updated) throw new HTTPException(409, { message: "Commission plan is frozen" });
  return decorate(updated);
}

export type UpsertShareInput = {
  teamMemberId: number;
  role: CommissionRole;
  contributionBps?: number;
  note?: string | null;
};

/**
 * Put a person in a role. A person may hold TWO roles on one plan (the referrer who also
 * built it) — that is how ADVO actually works, and the unique index is on
 * (plan, role, member) precisely to allow it while forbidding the same person twice in
 * the same role.
 *
 * The one-main-developer / one-assistant-developer cardinality is enforced by the partial
 * unique indexes in 018; a second insert raises rather than quietly overwriting.
 */
export async function addCommissionShare(
  commissionPlanId: number,
  input: UpsertShareInput,
): Promise<PlanDetail> {
  const plan = await planOr404(commissionPlanId);
  assertDraft(plan);

  if (input.role === "company") {
    throw new HTTPException(400, {
      message: "The company reserve is not held by a person — it is seeded with the plan",
    });
  }

  const [member] = await db()
    .select({ teamMemberId: teamMember.teamMemberId })
    .from(teamMember)
    .where(eq(teamMember.teamMemberId, input.teamMemberId))
    .limit(1);
  if (!member) throw new HTTPException(404, { message: "Team member not found" });

  await db()
    .insert(commissionShare)
    .values({
      commissionPlanId,
      teamMemberId: input.teamMemberId,
      role: input.role,
      contributionBps: input.contributionBps ?? 0,
      note: input.note ?? null,
    });

  return decorate(plan);
}

export type UpdateShareInput = {
  contributionBps?: number;
  isAgreed?: boolean;
  note?: string | null;
};

/**
 * Editing a contribution RESETS the agreement on that row. Agreement is agreement to a
 * NUMBER; letting a weight change while is_agreed stays true would mean someone signed
 * off on a figure they never saw. This is the single most important line in this file
 * after the allocator.
 */
export async function updateCommissionShare(
  commissionShareId: number,
  input: UpdateShareInput,
): Promise<PlanDetail> {
  const [row] = await db()
    .select()
    .from(commissionShare)
    .where(eq(commissionShare.commissionShareId, commissionShareId))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Commission share not found" });

  const plan = await planOr404(row.commissionPlanId);
  assertDraft(plan);

  const isWeightChanged =
    input.contributionBps !== undefined && input.contributionBps !== row.contributionBps;

  const isAgreed = isWeightChanged ? (input.isAgreed ?? false) : (input.isAgreed ?? row.isAgreed);

  await db()
    .update(commissionShare)
    .set({
      contributionBps: input.contributionBps ?? row.contributionBps,
      isAgreed,
      // The CHECK in 018 forbids is_agreed true with a null timestamp, and vice versa.
      agreedAt: isAgreed ? (row.agreedAt ?? new Date()) : null,
      note: input.note === undefined ? row.note : input.note,
      updatedAt: new Date(),
    })
    .where(eq(commissionShare.commissionShareId, commissionShareId));

  return decorate(plan);
}

export async function removeCommissionShare(commissionShareId: number): Promise<PlanDetail> {
  const [row] = await db()
    .select()
    .from(commissionShare)
    .where(eq(commissionShare.commissionShareId, commissionShareId))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Commission share not found" });

  const plan = await planOr404(row.commissionPlanId);
  assertDraft(plan);

  if (row.role === "company") {
    throw new HTTPException(409, {
      message: "The company reserve cannot be removed — the ledger would stop summing to the basis",
    });
  }

  await db().delete(commissionShare).where(eq(commissionShare.commissionShareId, commissionShareId));
  return decorate(plan);
}

/**
 * SUGGESTION, not assignment. Reads project_access — the existing team<->project link —
 * and proposes developer slots: the highest permission level becomes main developer, the
 * next becomes assistant. Everyone else is returned as unassigned for a human to place.
 *
 * It deliberately does NOT touch anyone already on the ledger, and it assigns no
 * contribution weight: the weights are the part that must be mutually agreed, and a
 * machine guessing them would put a number in front of people that nobody chose.
 */
export async function seedFromProjectAccess(commissionPlanId: number) {
  const plan = await planOr404(commissionPlanId);
  assertDraft(plan);

  const access = await db()
    .select({
      teamMemberId: projectAccess.teamMemberId,
      permissionLevel: projectAccess.permissionLevel,
      name: teamMember.name,
      permissionRole: teamMember.permissionRole,
    })
    .from(projectAccess)
    .innerJoin(teamMember, eq(projectAccess.teamMemberId, teamMember.teamMemberId))
    .where(and(eq(projectAccess.projectId, plan.projectId), eq(teamMember.isActive, true)));

  const existing = await db()
    .select({ role: commissionShare.role, teamMemberId: commissionShare.teamMemberId })
    .from(commissionShare)
    .where(eq(commissionShare.commissionPlanId, commissionPlanId));

  const rank: Record<string, number> = { admin: 0, write: 1, read: 2 };
  const candidate = access
    .filter((a) => !existing.some((e) => e.teamMemberId === a.teamMemberId))
    .sort((a, b) => (rank[a.permissionLevel] ?? 9) - (rank[b.permissionLevel] ?? 9));

  const seeded: { teamMemberId: number; role: DeveloperRole; name: string }[] = [];
  const unassigned: { teamMemberId: number; name: string }[] = [];

  for (const person of candidate) {
    const role: DeveloperRole | null = !existing.some((e) => e.role === "main_developer")
      && seeded.every((s) => s.role !== "main_developer")
      ? "main_developer"
      : !existing.some((e) => e.role === "assistant_developer")
          && seeded.every((s) => s.role !== "assistant_developer")
        ? "assistant_developer"
        : null;

    if (role === null) {
      unassigned.push({ teamMemberId: person.teamMemberId, name: person.name });
      continue;
    }
    seeded.push({ teamMemberId: person.teamMemberId, role, name: person.name });
  }

  for (const row of seeded) {
    await db().insert(commissionShare).values({
      commissionPlanId,
      teamMemberId: row.teamMemberId,
      role: row.role,
      contributionBps: 0,
      note: "Seeded from project access — contribution still to be agreed.",
    });
  }

  return { plan: await decorate(plan), seeded, unassigned };
}

// ─── Finalize ────────────────────────────────────────

/**
 * ATOMIC AND SINGLE-SHOT (project_signoff.sign precedent).
 *
 * The guard is UPDATE ... WHERE finalized_at IS NULL RETURNING inside one transaction.
 * Zero rows returned means another request finalized first, and we bail BEFORE writing a
 * single amount. Two clicks cannot freeze two different sets of numbers.
 *
 * Inside the same transaction the derived amounts are written into share.amount_cents,
 * which is what turns a computation into a record.
 */
export async function finalizeCommissionPlan(
  commissionPlanId: number,
  userId: number,
): Promise<PlanDetail> {
  const plan = await planOr404(commissionPlanId);
  const [found] = await db()
    .select({ projectStatus: project.projectStatus })
    .from(project)
    .where(eq(project.projectId, plan.projectId))
    .limit(1);

  // A cheap pre-check, purely so the caller gets a readable 409 without opening a
  // transaction. It is NOT the gate — the authoritative one runs inside, below.
  const preShare = await db()
    .select()
    .from(commissionShare)
    .where(eq(commissionShare.commissionPlanId, commissionPlanId))
    .orderBy(asc(commissionShare.commissionShareId));

  const preBlocker = finalizeBlocker(
    plan,
    preShare,
    found?.projectStatus ?? null,
    computeSplit(plan, preShare).derived,
  );
  if (preBlocker.length > 0) throw new HTTPException(409, { message: preBlocker.join(" ") });

  const finalizedAt = new Date();
  let allocatedCents = 0;
  let shareCount = 0;

  const updated = await db().transaction(async (tx) => {
    // THE GUARD. Zero rows means another request finalized first, and we bail before
    // writing a single amount. It also locks the plan row for the rest of this
    // transaction, which is what lets the re-read below be authoritative.
    const [locked] = await tx
      .update(commissionPlan)
      .set({ status: "finalized", finalizedAt, finalizedBy: userId, updatedAt: finalizedAt })
      .where(
        and(
          eq(commissionPlan.commissionPlanId, commissionPlanId),
          isNull(commissionPlan.finalizedAt),
        ),
      )
      .returning();

    if (!locked) throw new HTTPException(409, { message: "Commission plan is already finalized" });

    // RE-READ INSIDE THE TRANSACTION. What gets frozen must be what was validated: a
    // share edited between the pre-check and here would otherwise be paid at a number
    // nobody agreed to. The blocker is re-derived on this read, and a failure rolls the
    // whole finalize back rather than freezing a stale split.
    const share = await tx
      .select()
      .from(commissionShare)
      .where(eq(commissionShare.commissionPlanId, commissionPlanId))
      .orderBy(asc(commissionShare.commissionShareId));

    const { amountByShareId, derived } = computeSplit(locked, share);
    const blocker = finalizeBlocker(
      { ...locked, status: "draft", finalizedAt: null },
      share,
      found?.projectStatus ?? null,
      derived,
    );
    if (blocker.length > 0) throw new HTTPException(409, { message: blocker.join(" ") });

    for (const row of share) {
      await tx
        .update(commissionShare)
        .set({
          amountCents: amountByShareId.get(row.commissionShareId) ?? 0,
          updatedAt: finalizedAt,
        })
        .where(eq(commissionShare.commissionShareId, row.commissionShareId));
    }

    await tx.insert(activityLog).values({
      userId,
      action: "commission_plan_finalized",
      entityType: "commission_plan",
      entityId: commissionPlanId,
      metadata: {
        basisCents: locked.basisCents,
        allocatedCents: derived.allocatedCents,
        shareCount: share.length,
      },
    });

    allocatedCents = derived.allocatedCents;
    shareCount = share.length;
    return locked;
  });

  log.info(
    `plan ${commissionPlanId} finalized: ${allocatedCents} of ${updated.basisCents} cents across ${shareCount} shares`,
  );

  return decorate(updated);
}

/**
 * Void is restricted to UNFINALIZED plans. A finalized plan is a compensation record: it
 * is superseded by voiding nothing and drafting nothing — it stands. Correcting one is a
 * deliberate, separate act, not a button.
 */
export async function deleteCommissionPlan(
  commissionPlanId: number,
  userId: number,
): Promise<void> {
  const plan = await planOr404(commissionPlanId);
  assertDraft(plan);

  await db().delete(commissionShare).where(eq(commissionShare.commissionPlanId, commissionPlanId));
  await db().delete(commissionPlan).where(eq(commissionPlan.commissionPlanId, commissionPlanId));

  await db().insert(activityLog).values({
    userId,
    action: "commission_plan_deleted",
    entityType: "commission_plan",
    entityId: commissionPlanId,
    metadata: {},
  });
}

export async function voidCommissionPlan(
  commissionPlanId: number,
  reason: string,
  userId: number,
): Promise<PlanDetail> {
  const plan = await planOr404(commissionPlanId);
  if (plan.finalizedAt !== null) {
    throw new HTTPException(409, {
      message: "A finalized commission plan cannot be voided — it is a compensation record",
    });
  }

  const [updated] = await db()
    .update(commissionPlan)
    .set({
      status: "void",
      note: plan.note ? `${plan.note}\n\nVoided: ${reason}` : `Voided: ${reason}`,
      updatedAt: new Date(),
    })
    .where(
      and(eq(commissionPlan.commissionPlanId, commissionPlanId), isNull(commissionPlan.finalizedAt)),
    )
    .returning();

  if (!updated) throw new HTTPException(409, { message: "Commission plan is frozen" });

  await db().insert(activityLog).values({
    userId,
    action: "commission_plan_voided",
    entityType: "commission_plan",
    entityId: commissionPlanId,
    metadata: { reason },
  });

  return decorate(updated);
}

// ─── Tier assignment (Phase 8) ───────────────────────

export const TIER_OPTIONS = [
  {
    tierLabel: "Tier 1 Contribution (5% Allocation): Routine and Assisted Execution. Routine manual labor, basic data population, and simple AI image generation. Low complexity, and normally needs oversight or later clean-up by the Senior Developer.",
    allocationBps: 500,
  },
  {
    tierLabel: "Tier 2 Contribution (10% Allocation): Independent High-Volume Asset Creation. Independent execution and high-volume generation of quality AI image assets. Output must be consistently high quality and client-ready, needing zero manual correction, quality checking, or Senior Developer help before it is used.",
    allocationBps: 1000,
  },
  {
    tierLabel: "Tier 3 Contribution (15% Allocation): Advanced Media and Public-Ready Execution. Successful generation and delivery of complex AI video assets. Must be premium, public-facing quality, ready for immediate client presentation or live deployment with no further edits.",
    allocationBps: 1500,
  },
] as const;

/**
 * Upsert a tier pick for an assistant_developer or creatives_developer share row.
 * Replaces any existing tier assignment for that share.
 */
export async function upsertTierAssignment(
  commissionShareId: number,
  tierLabel: string,
): Promise<{ tierAssignmentId: number; tierLabel: string; allocationBps: number }> {
  const option = TIER_OPTIONS.find((t) => t.tierLabel === tierLabel);
  if (!option) {
    throw new HTTPException(400, { message: "Invalid tier label. Must be one of the three defined tiers." });
  }

  const [share] = await db()
    .select()
    .from(commissionShare)
    .where(eq(commissionShare.commissionShareId, commissionShareId))
    .limit(1);
  if (!share) throw new HTTPException(404, { message: "Commission share not found" });

  if (share.role !== "assistant_developer" && share.role !== "creatives_developer") {
    throw new HTTPException(400, {
      message: "Tier assignment only applies to assistant_developer and creatives_developer roles.",
    });
  }

  const plan = await planOr404(share.commissionPlanId);
  assertDraft(plan);

  // Delete existing then insert (upsert via delete+insert to handle ON CONFLICT edge cases).
  await db()
    .delete(projectTierAssignment)
    .where(eq(projectTierAssignment.commissionShareId, commissionShareId));

  const [created] = await db()
    .insert(projectTierAssignment)
    .values({
      commissionShareId,
      tierLabel: option.tierLabel,
      allocationBps: option.allocationBps,
    })
    .returning();

  return {
    tierAssignmentId: created.tierAssignmentId,
    tierLabel: created.tierLabel,
    allocationBps: created.allocationBps,
  };
}

// ─── Visibility redaction (Phase 8) ─────────────────

/**
 * Redact commission share rows so the API never sends figures the caller
 * is not permitted to see.
 *
 * Rules (enforced server-side — the UI matches):
 *   - Owner (isOwner true) or admin role: sees everything.
 *   - Team member assigned to this project:
 *       * Always sees: name, role.
 *       * Sees amounts + agreed status ONLY for rows whose role matches their own role on this project.
 *   - Not on the project: sees names and roles only. No amount, no agreed status.
 */
export function redactShares(
  shares: ShareComputed[],
  callerRole: string | null,
  isOwnerOrAdmin: boolean,
): ShareComputed[] {
  if (isOwnerOrAdmin) return shares;

  return shares.map((s) => {
    const canSee = callerRole !== null && s.role === callerRole;
    if (canSee) return s;
    return {
      ...s,
      computedAmountCents: 0,
      amountCents: null,
      contributionBps: 0,
      isAgreed: false,
      agreedAt: null,
    };
  });
}

/**
 * Look up the project_role_assignment role for a given user on a given project.
 * Returns null when the user has no team_member record or no assignment.
 */
export async function getCallerProjectRole(
  userId: number,
  projectId: number,
): Promise<string | null> {
  const [tm] = await db()
    .select({ teamMemberId: teamMember.teamMemberId })
    .from(teamMember)
    .where(eq(teamMember.userId, userId))
    .limit(1);
  if (!tm) return null;

  const [assignment] = await db()
    .select({ projectRole: projectRoleAssignment.projectRole })
    .from(projectRoleAssignment)
    .where(
      and(
        eq(projectRoleAssignment.projectId, projectId),
        eq(projectRoleAssignment.teamMemberId, tm.teamMemberId),
      ),
    )
    .limit(1);

  return assignment?.projectRole ?? null;
}

/**
 * Look up whether a user is the owner (is_owner column).
 */
export async function getIsOwner(userId: number): Promise<boolean> {
  const [u] = await db()
    .select({ isOwner: user.isOwner })
    .from(user)
    .where(eq(user.userId, userId))
    .limit(1);
  return u?.isOwner ?? false;
}
