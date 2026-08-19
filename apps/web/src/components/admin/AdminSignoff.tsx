import { useState } from "react";
import { FileSignature, Send, Ban, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Panel, Empty, Dot } from "@/components/admin/_ui";
import {
  useProjectSignoff,
  useSignoffDetail,
  formatPeso,
  type ProjectSignoff,
} from "@/hooks/useProjectSignoff";

/**
 * Team panel for the Project Sign-off document (/admin -> Projects -> project ->
 * Sign-off tab). Draft, issue to the client's hub, watch the revision ledger fill,
 * void an unsigned one, and read the signature evidence on a signed one.
 *
 * The deliverable snapshot carries verifiedAt (internal QA). It is team evidence and
 * is never shown to a client — the client read path strips it server-side.
 */

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

const statusDot: Record<string, string> = {
  draft: "bg-muted-foreground",
  issued: "bg-accent",
  signed: "bg-emerald-500",
  void: "bg-destructive",
};

const SignoffRow = ({ row }: { row: ProjectSignoff }) => {
  const { issueSignoff, isIssuing, voidSignoff, signSignoff, isSigning } = useProjectSignoff(
    row.projectId,
  );
  const { data: detail } = useSignoffDetail(row.projectSignoffId);
  const [reason, setReason] = useState("");
  const [deemedName, setDeemedName] = useState("");
  const isSigned = Boolean(row.signedAt);
  const d = row.derived;

  return (
    <div className="border-t border-border first:border-t-0 px-4 py-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{row.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
            {formatPeso(row.finalPaymentCents)} final · {row.paymentDueDayCount}-day payment ·{" "}
            {row.revisionWindowMonthCount}-month revision window
          </p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Dot className={statusDot[row.status] ?? "bg-muted-foreground"} />
          {row.status}
        </span>
      </div>

      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{row.scopeSummary}</p>

      <p className="text-xs text-muted-foreground tabular-nums">
        Revisions {d.freeRevisionUsedCount}/{row.freeRevisionTotalCount} used
        {isSigned && ` · window ends ${fmtDate(d.revisionWindowEndsAt)}`}
      </p>

      {isSigned && (
        <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-xs space-y-1">
          <p className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            Signed by <span className="font-medium">{row.signedName}</span> ({row.signedMethod}) on{" "}
            {fmtDate(row.signedAt)}
          </p>
          <p className="text-muted-foreground">IP {row.signedIp ?? "—"}</p>
          <p className="text-muted-foreground truncate">{row.signedUserAgent ?? "—"}</p>
          <p className="text-muted-foreground">
            Final payment due {fmtDate(d.paymentDueAt)}
            {d.isPaymentOverdue && <span className="text-destructive"> — overdue</span>}
            {row.invoiceId != null && ` · invoice #${row.invoiceId}`}
          </p>
          <p className="text-muted-foreground">
            Typed name + IP + user agent is an audit trail, not a qualified e-signature. The
            countersigned PDF at document_url stays the authoritative artifact.
          </p>
        </div>
      )}

      {detail?.revision && detail.revision.length > 0 && (
        <div className="rounded-lg border border-border divide-y divide-border">
          {detail.revision.map((r) => (
            <div key={r.signoffRevisionId} className="px-3 py-2">
              <p className="text-xs font-medium tabular-nums">
                Round {r.roundNumber}
                {r.isPostSignoff && (
                  <span className="ml-1.5 text-accent">post-sign-off</span>
                )}
                <span className="ml-1.5 text-muted-foreground font-normal">
                  {fmtDate(r.createdAt)}
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3">{r.note}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {row.status === "draft" && (
          <Button size="sm" disabled={isIssuing} onClick={() => issueSignoff(row.projectSignoffId)}>
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {isIssuing ? "Issuing…" : "Issue to client"}
          </Button>
        )}
        {!isSigned && row.status !== "void" && (
          <>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason to void"
              className="h-8 w-56 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!reason.trim()}
              onClick={() => voidSignoff({ id: row.projectSignoffId, reason: reason.trim() })}
            >
              <Ban className="h-3.5 w-3.5 mr-1.5" /> Void
            </Button>
          </>
        )}
      </div>

      {/* Deemed approval — the contract's non-response clause, recorded by a human.
          Nothing auto-fires; there is no scheduler in this model. */}
      {!isSigned && row.status === "issued" && (
        <div className="rounded-lg border border-border px-3 py-2.5 space-y-2">
          <Label className="text-xs">Record deemed approval (non-response clause)</Label>
          <div className="flex items-center gap-2">
            <Input
              value={deemedName}
              onChange={(e) => setDeemedName(e.target.value)}
              placeholder="Name on record"
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!deemedName.trim() || isSigning}
              onClick={() =>
                signSignoff({
                  id: row.projectSignoffId,
                  signedName: deemedName.trim(),
                  signedMethod: "deemed",
                })
              }
            >
              Record
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            This mints the final-payment invoice exactly as a client signature does. Put the basis
            (dates of the notice) in the internal note first.
          </p>
        </div>
      )}
    </div>
  );
};

const AdminSignoff = ({ projectId }: { projectId: number }) => {
  const { signoff, isLoading, createSignoff, isCreating } = useProjectSignoff(projectId);
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [scopeSummary, setScopeSummary] = useState("");
  const [finalPaymentPeso, setFinalPaymentPeso] = useState("");
  const [note, setNote] = useState("");

  const onCreate = async () => {
    const peso = Number(finalPaymentPeso);
    if (!title.trim() || !scopeSummary.trim() || Number.isNaN(peso) || peso < 0) return;
    await createSignoff({
      projectId,
      title: title.trim(),
      scopeSummary: scopeSummary.trim(),
      // Pesos -> integer CENTS. Multiplied exactly ONCE, here, and rounded so a
      // 22500.005 float can never become a fractional cent.
      finalPaymentCents: Math.round(peso * 100),
      note: note.trim() || null,
    });
    setTitle("");
    setScopeSummary("");
    setFinalPaymentPeso("");
    setNote("");
    setIsOpen(false);
  };

  return (
    <Panel
      title="Project Sign-off"
      meta={signoff.length > 0 ? `${signoff.length} document` : undefined}
      action={
        <Button size="sm" variant="outline" onClick={() => setIsOpen((v) => !v)}>
          <FileSignature className="h-3.5 w-3.5 mr-1.5" />
          {isOpen ? "Cancel" : "Draft sign-off"}
        </Button>
      }
    >
      {isOpen && (
        <div className="px-4 py-4 space-y-2.5 border-b border-border">
          <div className="space-y-1.5">
            <Label htmlFor="so-title" className="text-xs">
              Commissioned system
            </Label>
            <Input
              id="so-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Phase 1: Core Attendance System"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="so-scope" className="text-xs">
              Scope being accepted as delivered
            </Label>
            <Textarea
              id="so-scope"
              rows={4}
              value={scopeSummary}
              onChange={(e) => setScopeSummary(e.target.value)}
              placeholder="Biometric time-tracking, offline queuing, agency filtering, geofencing, accomplishment reports."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="so-peso" className="text-xs">
              Final payment (₱, pesos)
            </Label>
            <Input
              id="so-peso"
              type="number"
              inputMode="decimal"
              value={finalPaymentPeso}
              onChange={(e) => setFinalPaymentPeso(e.target.value)}
              placeholder="22500"
            />
            <p className="text-xs text-muted-foreground">
              Stored as integer cents. FourlinQ Tier 1 = ₱22,500 · Tier 2 = ₱35,000.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="so-note" className="text-xs">
              Internal note (never shown to the client)
            </Label>
            <Textarea
              id="so-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <Button size="sm" disabled={isCreating} onClick={onCreate}>
            {isCreating ? "Saving…" : "Save draft"}
          </Button>
        </div>
      )}

      {isLoading ? (
        <Empty text="Loading…" />
      ) : signoff.length === 0 ? (
        <Empty text="No sign-off on this project yet. Draft one when the build is ready for final delivery." />
      ) : (
        signoff.map((row) => <SignoffRow key={row.projectSignoffId} row={row} />)
      )}
    </Panel>
  );
};

export default AdminSignoff;
