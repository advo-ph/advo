import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { Bid, BidEdit, BidWin } from "@/hooks/useBids";
import { Odds } from "./BidRow";
import { NOTICE_URL, WIN_LABEL, dateTime, peso } from "./bid-format";

const RATED_BY: Record<string, string> = {
  team: "Rated by the team",
  ai: "First read by AI. Change it if you know better.",
  rule: "Not rated yet. Keyword rules kept it.",
};

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-[96px_1fr] gap-3 py-2.5 text-sm">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="min-w-0 break-words">{children}</dd>
  </div>
);

/** Everything about one bid, in the same order every time. */
const BidSheet = ({
  bid,
  onClose,
  onSave,
  isSaving,
}: {
  bid: Bid | null;
  onClose: () => void;
  onSave: (ref: string, change: BidEdit) => void;
  isSaving: boolean;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [win, setWin] = useState<BidWin | null>(null);
  const [joinNote, setJoinNote] = useState("");
  const [whyNote, setWhyNote] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    setIsEditing(false);
    setWin(bid?.win ?? null);
    setJoinNote(bid?.joinNote ?? "");
    setWhyNote(bid?.whyNote ?? "");
    setNote(bid?.note ?? "");
  }, [bid]);

  const save = () => {
    if (!bid) return;
    onSave(bid.ref, { win, joinNote: joinNote || null, whyNote: whyNote || null, note: note || null, isFit: true });
    setIsEditing(false);
  };

  return (
    <Sheet open={!!bid} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
        {bid && (
          <div className="flex min-h-full flex-col">
            <SheetHeader className="px-5 pt-5 pb-4 border-b border-border text-left space-y-1">
              <SheetDescription className="text-xs pr-6">
                {bid.buyer}
                {bid.place ? ` · ${bid.place}` : ""}
              </SheetDescription>
              <SheetTitle className="text-base leading-snug pr-6">{bid.title}</SheetTitle>
              <p className="pt-1 text-2xl font-semibold tracking-tight tabular-nums">{peso(bid.abc)}</p>
            </SheetHeader>

            <dl className="px-5 divide-y divide-border">
              <Fact label="Pre-bid">
                {bid.preBidAt ? (
                  <>
                    {dateTime(bid.preBidAt)}
                    {bid.preBidPlace && <span className="block text-muted-foreground">{bid.preBidPlace}</span>}
                  </>
                ) : (
                  "None in the notice"
                )}
              </Fact>
              <Fact label="Bids due">
                {dateTime(bid.dueAt)}
                {bid.isDueFromText && (
                  <span className="block text-muted-foreground">
                    From the notice text. PhilGEPS closes it {dateTime(bid.closingAt)}.
                  </span>
                )}
              </Fact>
              {!bid.isFit && bid.fitReason && <Fact label="Not for us">{bid.fitReason}</Fact>}
              <Fact label="Can we join">{bid.joinNote || "—"}</Fact>
              <Fact label="Can we win">
                <Odds bid={bid} className="text-sm text-foreground" />
                {bid.whyNote && <span className="block mt-0.5">{bid.whyNote}</span>}
                {bid.ratedBy && <span className="block mt-1 text-xs text-muted-foreground">{RATED_BY[bid.ratedBy]}</span>}
              </Fact>
              {bid.note && <Fact label="Note">{bid.note}</Fact>}
              <Fact label="Contact">
                {bid.contactName || "—"}
                {bid.contactPhone && (
                  <a className="block text-accent-ink hover:underline" href={`tel:${bid.contactPhone.replace(/[^\d+]/g, "")}`}>
                    {bid.contactPhone}
                  </a>
                )}
                {bid.contactEmail && (
                  <a className="block text-accent-ink hover:underline" href={`mailto:${bid.contactEmail}`}>
                    {bid.contactEmail}
                  </a>
                )}
              </Fact>
              <Fact label="Details">
                {[bid.mode, bid.category, bid.deliveryPeriod && `Deliver in ${bid.deliveryPeriod.replace("Day/s", "days")}`]
                  .filter(Boolean)
                  .join(" · ") || "—"}
                {bid.supplementCount > 0 && (
                  <span className="block text-muted-foreground">
                    {bid.supplementCount} bid bulletin{bid.supplementCount === 1 ? "" : "s"} posted
                  </span>
                )}
              </Fact>
              {bid.fullTitle !== bid.title && (
                <Fact label="Notice title">
                  <span className="text-muted-foreground">{bid.fullTitle}</span>
                </Fact>
              )}
            </dl>

            {isEditing && (
              <div className="mx-5 my-3 space-y-3 rounded-lg border border-border p-3">
                <div className="inline-flex rounded-lg bg-secondary p-0.5">
                  {(["good", "fair", "low"] as BidWin[]).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWin(w)}
                      aria-pressed={win === w}
                      className={cn(
                        "h-8 px-3 rounded-md text-sm font-medium transition-colors",
                        win === w ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {WIN_LABEL[w]}
                    </button>
                  ))}
                </div>
                <Input value={joinNote} onChange={(e) => setJoinNote(e.target.value)} placeholder="Can we join? e.g. Yes, with West Point" />
                <Input value={whyNote} onChange={(e) => setWhyNote(e.target.value)} placeholder="Why these odds?" />
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the team" rows={3} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={save} disabled={isSaving}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-auto flex flex-wrap gap-2 border-t border-border px-5 py-4">
              <Button asChild size="sm">
                <a href={`${NOTICE_URL}${bid.ref}`} target="_blank" rel="noreferrer">
                  Open notice <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
              {!isEditing && (
                <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                  Change rating
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                disabled={isSaving}
                onClick={() => onSave(bid.ref, { isHidden: !bid.isHidden })}
              >
                {bid.isHidden ? "Show again" : "Hide"}
              </Button>
              <span className="w-full pt-1 text-xs text-muted-foreground">PhilGEPS {bid.ref}</span>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default BidSheet;
