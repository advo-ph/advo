/**
 * The revision allowance, drawn.
 *
 * The Hub already SAID "you have 3 of 5 complementary revisions left" in a sentence, and
 * a sentence is genuinely most of the job. What a sentence does not do is register
 * without being read — and this number's whole purpose is to be noticed BEFORE somebody
 * asks for a fourth round, not confirmed afterwards during an argument.
 *
 * So: pips, not a percentage bar. Five discrete rounds are five discrete things, and a
 * continuous bar at 60% invites the reading "a bit more than half left" when the true
 * statement is "two". Countability is the entire point of a finite allowance.
 *
 * Rendered on BOTH sides — the client Hub and the admin project view — from the same
 * component, so the two never disagree about what the contract permits. That mattered
 * enough to be worth a shared file: the FourlinQ revision dispute was two parties holding
 * different counts.
 *
 * No red on the last pip. The state "one revision left" is not an error, it is the
 * agreement working; colouring it as a warning teaches people the UI is anxious and they
 * stop reading it.
 */

interface RevisionBurndownProps {
  usedCount: number;
  totalCount: number;
  /** Rounds delivered and still awaiting a client response. Omitted when not known. */
  openCount?: number;
  /**
   * Shown to a client vs shown to the team. Same numbers, different sentence: a client
   * reads "you have", the team reads "the client has".
   */
  audience?: "client" | "team";
}

/** Beyond this, pips stop being countable at a glance and a number reads better. */
const MAX_PIP = 12;

const RevisionBurndown = ({
  usedCount,
  totalCount,
  openCount,
  audience = "client",
}: RevisionBurndownProps) => {
  // Clamped rather than trusted. An allowance can legitimately be over-consumed (the
  // write path permits a chargeable round past the free five), and a negative remainder
  // would render as an empty row that reads like "no data".
  const safeTotal = Math.max(0, totalCount);
  const safeUsed = Math.max(0, usedCount);
  const remainingCount = Math.max(0, safeTotal - safeUsed);
  const isExhausted = remainingCount === 0;

  const subject = audience === "client" ? "You have" : "The client has";
  const label = isExhausted
    ? audience === "client"
      ? "Complementary revisions are used up — further rounds are chargeable."
      : "Free allowance spent — further rounds are chargeable."
    : `${subject} ${remainingCount} of ${safeTotal} complementary ${
        remainingCount === 1 ? "revision" : "revisions"
      } left.`;

  return (
    <div className="space-y-1.5">
      <div
        className="flex items-center gap-1"
        role="img"
        // The pips are decorative to a screen reader; the sentence below carries the
        // same fact, so announcing both would read the number twice.
        aria-label={label}
      >
        {safeTotal > 0 && safeTotal <= MAX_PIP ? (
          Array.from({ length: safeTotal }, (_, index) => (
            <span
              key={index}
              aria-hidden="true"
              className={
                index < safeUsed
                  ? "h-1.5 flex-1 rounded-full bg-muted-foreground/30"
                  : "h-1.5 flex-1 rounded-full bg-foreground/70"
              }
            />
          ))
        ) : (
          <span aria-hidden="true" className="text-xs tabular-nums text-muted-foreground">
            {safeUsed}/{safeTotal}
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {label}
        {openCount !== undefined && openCount > 0 && (
          <>
            {" "}
            {openCount} {openCount === 1 ? "round is" : "rounds are"} awaiting a response.
          </>
        )}
      </p>
    </div>
  );
};

export default RevisionBurndown;
