import { useState } from "react";
import { CheckCircle2, FileSignature, Receipt, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Panel, Empty } from "@/components/admin/_ui";
import RevisionBurndown from "@/components/hub/RevisionBurndown";
import {
  useProjectSignoff,
  formatPeso,
  type ProjectSignoff,
} from "@/hooks/useProjectSignoff";

/**
 * Project Sign-off card for /hub.
 *
 * This is the CLIENT-FACING final-delivery document. It never renders
 * deliverable.verifiedAt — that is internal team QA and is stripped server-side.
 *
 * Every date and count shown here comes from the server's `derived` block. Nothing
 * is recomputed in the browser, so the client and the team always read the same clock.
 */

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

const SignoffBlock = ({ row }: { row: ProjectSignoff }) => {
  const { signSignoff, isSigning, requestRevision, isRequestingRevision } =
    useProjectSignoff(row.projectId);
  const [signedName, setSignedName] = useState("");
  const [isAgree, setIsAgree] = useState(false);
  const [note, setNote] = useState("");

  const d = row.derived;
  const isSigned = Boolean(row.signedAt);
  const isRevisionOpen = isSigned ? d.isRevisionWindowOpen : d.isFreeRevisionOpen;

  const onSign = async () => {
    if (!signedName.trim() || !isAgree) return;
    await signSignoff({ id: row.projectSignoffId, signedName: signedName.trim() });
    setSignedName("");
    setIsAgree(false);
  };

  const onRevision = async () => {
    if (!note.trim()) return;
    await requestRevision({ id: row.projectSignoffId, note: note.trim() });
    setNote("");
  };

  return (
    <div className="border-t border-border first:border-t-0">
      <div className="px-4 py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{row.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Final payment {formatPeso(row.finalPaymentCents)}
            </p>
          </div>
          {isSigned ? (
            <span className="shrink-0 inline-flex items-center gap-1.5 text-xs text-emerald-500">
              <CheckCircle2 className="h-3.5 w-3.5" /> Signed
            </span>
          ) : (
            <span className="shrink-0 text-xs text-accent">Awaiting your signature</span>
          )}
        </div>

        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{row.scopeSummary}</p>

        {row.documentUrl && (
          <a
            href={row.documentUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent underline underline-offset-2"
          >
            Open the sign-off document
          </a>
        )}

        {/* ─── Signed: the receipt ─── */}
        {isSigned && (
          <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2.5 space-y-1.5">
            <p className="text-xs">
              Signed by <span className="font-medium">{row.signedName}</span> on{" "}
              {fmtDate(row.signedAt)}
              {row.signedMethod !== "client" && ` (${row.signedMethod})`}
            </p>
            {row.finalPaymentCents > 0 && (
              <p className="text-xs flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                Final payment of {formatPeso(row.finalPaymentCents)} due{" "}
                {fmtDate(d.paymentDueAt)}
                {d.isPaymentOverdue && (
                  <span className="text-destructive font-medium">— overdue</span>
                )}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {d.freeRevisionRemainingCount} complementary{" "}
              {d.freeRevisionRemainingCount === 1 ? "revision remains" : "revisions remain"},
              invocable until {fmtDate(d.revisionWindowEndsAt)}.
            </p>
          </div>
        )}

        {/* ─── Unsigned: use the rounds first, then sign ───
            Drawn rather than only stated. This number's job is to register BEFORE
            somebody asks for a fourth round, not to be produced afterwards during an
            argument — and the FourlinQ dispute was two parties holding different counts.
            The same component renders on the team side, from the same props, so the
            two can never disagree. */}
        {!isSigned && (
          <RevisionBurndown
            usedCount={d.freeRevisionUsedCount}
            totalCount={row.freeRevisionTotalCount}
            audience="client"
          />
        )}

        {/* ─── Revision request ─── */}
        <div className="space-y-2">
          <Label htmlFor={`rev-${row.projectSignoffId}`} className="text-xs">
            Request a revision
          </Label>
          <Textarea
            id={`rev-${row.projectSignoffId}`}
            rows={3}
            value={note}
            disabled={!isRevisionOpen}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              isRevisionOpen
                ? "Batch everything you want changed into one list."
                : "No complementary revisions available."
            }
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {isRevisionOpen
                ? isSigned
                  ? `Post-sign-off window closes ${fmtDate(d.revisionWindowEndsAt)}.`
                  : "Free of charge — part of your package."
                : "This is now a change order, or falls under the maintenance agreement."}
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={!isRevisionOpen || !note.trim() || isRequestingRevision}
              onClick={onRevision}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              {isRequestingRevision ? "Sending…" : "Request"}
            </Button>
          </div>
        </div>

        {/* ─── Signature block ─── */}
        {!isSigned && row.status === "issued" && (
          <div className="rounded-lg border border-border px-3 py-3 space-y-2.5">
            <Label htmlFor={`name-${row.projectSignoffId}`} className="text-xs">
              Type your full legal name
            </Label>
            <Input
              id={`name-${row.projectSignoffId}`}
              value={signedName}
              onChange={(e) => setSignedName(e.target.value)}
              placeholder="Juan dela Cruz"
            />
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={isAgree}
                onCheckedChange={(v) => setIsAgree(v === true)}
                className="mt-0.5"
              />
              <span>
                I confirm final delivery of this system. Signing starts the{" "}
                {row.paymentDueDayCount}-day final-payment period and closes further free
                pre-sign-off revisions.
              </span>
            </label>
            <Button
              size="sm"
              className="w-full"
              disabled={!signedName.trim() || !isAgree || isSigning}
              onClick={onSign}
            >
              <FileSignature className="h-3.5 w-3.5 mr-1.5" />
              {isSigning ? "Recording…" : "Sign the Project Sign-off"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

const SignoffCard = ({ projectId }: { projectId: number }) => {
  const { signoff, isLoading } = useProjectSignoff(projectId);
  const visible = signoff.filter((s) => s.status !== "void");

  return (
    <Panel
      title="Project Sign-off"
      meta={visible.length > 0 ? `${visible.length} document` : undefined}
    >
      {isLoading ? (
        <Empty text="Loading…" />
      ) : visible.length === 0 ? (
        <Empty text="No sign-off has been issued yet. ADVO will send one when the system is ready for final delivery." />
      ) : (
        visible.map((row) => <SignoffBlock key={row.projectSignoffId} row={row} />)
      )}
    </Panel>
  );
};

export default SignoffCard;
