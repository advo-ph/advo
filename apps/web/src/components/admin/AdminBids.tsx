import { useEffect, useRef, useState, type ReactNode } from "react";
import { Eye, EyeOff, Landmark, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Empty, Panel } from "@/components/admin/_ui";
import { useBids, type Bid, type BidUpdate, type BidUpdateKind, type BidWin } from "@/hooks/useBids";
import BidRow, { BidListHead, Odds } from "@/components/admin/bids/BidRow";
import BidSheet from "@/components/admin/bids/BidSheet";
import { WIN_LABEL, WIN_ORDER, dayLabel, hasPreBidAhead, manilaDay, peso, timeLabel } from "@/components/admin/bids/bid-format";
import { PAPERS, PARTNERS, PAST_BIG, RULES } from "@/data/bid-guide";

/**
 * Bids — every open government bid ADVO can join, read from PhilGEPS each morning.
 *
 * The page itself never scrolls (Admin.tsx fits it to the screen): the row of view
 * buttons and the filters stay put, and only the list under them scrolls. Four views:
 * the bids, the same bids by date, what changed (the feed the sidebar badge and the
 * daily email come from), and the background (partners, papers, how bids are won,
 * where the big money is). Every bid list uses the one BidRow and opens the one BidSheet.
 */

type Tab = "all" | "calendar" | "updates" | "more";
type WinFilter = BidWin | "unrated" | "all";

const UPDATE_LABEL: Record<BidUpdateKind, string> = {
  new: "New bid",
  changed: "Changed",
  pre_bid_soon: "Pre-bid soon",
  due_soon: "Due soon",
  withdrawn: "Taken down",
};

const FIRST_LOOK_MS = 3 * 24 * 3600_000;
const BIG_BUDGET = 20_000_000;

const winRank = (b: Bid) => WIN_ORDER.indexOf(b.win);
const dueTime = (b: Bid) => new Date(b.dueAt ?? 0).getTime();

const segmentClass = (isOn: boolean) =>
  cn(
    "h-8 px-2 sm:px-3 rounded-md text-[13px] sm:text-sm font-medium transition-colors whitespace-nowrap",
    isOn ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
  );

const Segmented = <T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
}) => (
  <div className="inline-flex rounded-lg bg-secondary p-0.5">
    {options.map((o) => (
      <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value} className={segmentClass(value === o.value)}>
        {o.label}
      </button>
    ))}
  </div>
);

/** The scrolling part of a view. Everything above it stays on screen. */
const Scroll = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", className)}>{children}</div>
);

const List = ({ children }: { children: ReactNode }) => (
  <div className="border border-border rounded-lg bg-card divide-y divide-border overflow-hidden">{children}</div>
);

const AdminBids = () => {
  const { bids, updates, sync, markSeen, setEmail, edit } = useBids();
  const [tab, setTab] = useState<Tab>("all");
  const [winFilter, setWinFilter] = useState<WinFilter>("all");
  const [isShowingPassed, setIsShowingPassed] = useState(true);
  const [query, setQuery] = useState("");
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [isShowingHidden, setIsShowingHidden] = useState(false);

  const data = bids.data;
  const now = new Date();
  // "New" is measured against the last look BEFORE this visit, so opening Updates
  // (which marks the feed seen) does not wipe the markers off the screen at once. A
  // member who has never opened Updates is shown the last three days, not a month.
  const seenAtRef = useRef<string | null | undefined>(undefined);
  if (data && seenAtRef.current === undefined) seenAtRef.current = data.member.seenAt;
  const seenAt = seenAtRef.current ? new Date(seenAtRef.current) : new Date(Date.now() - FIRST_LOOK_MS);
  const newRefs = new Set(
    (updates.data ?? []).filter((u) => u.kind === "new" && new Date(u.createdAt) > seenAt).map((u) => u.bid.ref),
  );

  const all = data?.bids ?? [];
  const fits = all.filter((b) => b.isFit && b.isHidden === isShowingHidden);
  const hiddenCount = all.filter((b) => b.isFit && b.isHidden).length;
  const isPassed = (b: Bid) => !!b.preBidAt && !hasPreBidAhead(b, now);
  const passedCount = fits.filter(isPassed).length;
  const pool = isShowingPassed ? fits : fits.filter((b) => !isPassed(b));

  const matchesWin = (b: Bid, w: WinFilter) => w === "all" || (w === "unrated" ? !b.win : b.win === w);
  const countOf = (w: WinFilter) => pool.filter((b) => matchesWin(b, w)).length;
  const q = query.trim().toLowerCase();
  const shown = pool
    .filter((b) => matchesWin(b, winFilter))
    .filter((b) => !q || `${b.title} ${b.fullTitle} ${b.buyer} ${b.fullBuyer} ${b.place ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => winRank(a) - winRank(b) || dueTime(a) - dueTime(b));

  const unseenUpdates = (updates.data ?? []).filter((u) => new Date(u.createdAt) > seenAt).length;

  // Opening Updates is reading the feed: clear the badge.
  useEffect(() => {
    if (tab === "updates" && data) markSeen.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, !!data]);

  const openBid = all.find((b) => b.ref === openRef) ?? (updates.data ?? []).find((u) => u.bid.ref === openRef)?.bid ?? null;
  const open = (b: Bid) => setOpenRef(b.ref);

  const lastGood = data?.sync.lastGood;
  const checked = lastGood ? `Checked ${dayLabel(lastGood.startedAt).toLowerCase()}, ${timeLabel(lastGood.startedAt)}` : "Not checked yet";
  const isRunning = !!data?.sync.isRunning || sync.isPending;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <h1 className="sr-only">Bids</h1>
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="-mx-1 overflow-x-auto px-1">
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "all", label: "All bids" },
              { value: "calendar", label: "Calendar" },
              {
                value: "updates",
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    Updates
                    {unseenUpdates > 0 && tab !== "updates" && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-accent-foreground text-[11px] leading-[18px] tabular-nums">
                        {unseenUpdates}
                      </span>
                    )}
                  </span>
                ),
              },
              { value: "more", label: "More" },
            ]}
          />
        </div>
        {isRunning ? (
          // While a check runs the button becomes plain text; the saved list stays below.
          <span role="status" className="inline-flex h-8 shrink-0 items-center gap-1.5 px-3 text-sm text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Checking…
          </span>
        ) : (
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" onClick={() => sync.mutate()}>
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{checked}</span>
          </Button>
        )}
      </div>

      {bids.isLoading ? (
        <List>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 px-4 flex items-center">
              <div className="h-3 w-1/2 bg-secondary animate-pulse rounded" />
            </div>
          ))}
        </List>
      ) : bids.error && !data ? (
        <Panel>
          <Empty text="Bids did not load. Refresh the page to try again." />
        </Panel>
      ) : !lastGood && !all.length ? (
        <Panel>
          <div className="px-4 py-10 text-center space-y-3">
            <Landmark className="h-7 w-7 text-muted-foreground/40 mx-auto" />
            <p className="text-sm text-muted-foreground">
              {isRunning ? "Reading every open bid on PhilGEPS. This takes a few minutes." : "No check has run yet."}
            </p>
            {!isRunning && (
              <Button size="sm" onClick={() => sync.mutate()}>
                Check PhilGEPS now
              </Button>
            )}
          </div>
        </Panel>
      ) : (
        <>
          {tab === "all" && (
            <>
              <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1">
                  <Segmented<WinFilter>
                    value={winFilter}
                    onChange={setWinFilter}
                    options={(["all", "good", "fair", "low", "unrated"] as WinFilter[])
                      .filter((w) => w !== "unrated" || countOf("unrated") > 0)
                      .map((w) => ({
                        value: w,
                        label: (
                          <>
                            {w === "all" ? "All" : w === "unrated" ? "Unrated" : WIN_LABEL[w]}
                            <span className="ml-1.5 tabular-nums opacity-60">{countOf(w)}</span>
                          </>
                        ),
                      }))}
                  />
                  {/* Show or hide bids whose pre-bid meeting has already been held. */}
                  <div className="inline-flex shrink-0 rounded-lg bg-secondary p-0.5">
                    <button
                      type="button"
                      onClick={() => setIsShowingPassed((v) => !v)}
                      aria-pressed={isShowingPassed}
                      title={isShowingPassed ? "Hide bids whose pre-bid has passed" : "Show bids whose pre-bid has passed"}
                      className={cn(segmentClass(isShowingPassed), "inline-flex items-center gap-1.5")}
                    >
                      {isShowingPassed ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      Passed
                      <span className="tabular-nums opacity-60">{passedCount}</span>
                    </button>
                  </div>
                </div>
                <div className="relative sm:w-64">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search buyer or title" className="h-9 pl-8" />
                </div>
              </div>
              {shown.length ? (
                <Scroll className="rounded-lg border border-border bg-card">
                  <BidListHead />
                  <div className="divide-y divide-border">
                    {shown.map((b) => (
                      <BidRow key={b.ref} bid={b} onOpen={open} isNew={newRefs.has(b.ref)} />
                    ))}
                  </div>
                </Scroll>
              ) : (
                <Panel>
                  <Empty text={q ? "No bid matches that search." : "No open bid in this group."} />
                </Panel>
              )}
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {shown.length} bid{shown.length === 1 ? "" : "s"} · {peso(shown.reduce((s, b) => s + (b.abc ?? 0), 0))} total budget.
                  Odds are our judgement, not a measured chance.
                </span>
                {(hiddenCount > 0 || isShowingHidden) && (
                  <button type="button" className="hover:text-foreground" onClick={() => setIsShowingHidden((v) => !v)}>
                    {isShowingHidden ? "Back to open bids" : `Show ${hiddenCount} hidden`}
                  </button>
                )}
              </div>
            </>
          )}

          {tab === "calendar" && (
            <Scroll>
              <CalendarView bids={fits} now={now} onOpen={open} />
            </Scroll>
          )}

          {tab === "updates" && (
            <>
              <Panel className="shrink-0">
                <div className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Email me when something changes</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {lastGood
                        ? `PhilGEPS is checked every day at 6:00 AM. ${checked}: ${lastGood.listedCount.toLocaleString("en-PH")} open bids listed, ${(
                            lastGood.listedCount - lastGood.unreadCount
                          ).toLocaleString("en-PH")} read in full.${lastGood.failedPageCount ? ` ${lastGood.failedPageCount} list pages did not load.` : ""}`
                        : "PhilGEPS is checked every day at 6:00 AM."}
                    </p>
                  </div>
                  <Switch checked={data?.member.isEmail ?? true} onCheckedChange={(v) => setEmail.mutate(v)} aria-label="Daily bid email" />
                </div>
              </Panel>
              <Scroll>
                <UpdatesView updates={updates.data ?? []} isLoading={updates.isLoading} seenAt={seenAt} onOpen={open} />
              </Scroll>
            </>
          )}

          {tab === "more" && (
            <Scroll>
              <MoreView bigOpen={fits.filter((b) => (b.abc ?? 0) >= BIG_BUDGET)} onOpen={open} />
            </Scroll>
          )}
        </>
      )}

      <BidSheet bid={openBid} onClose={() => setOpenRef(null)} onSave={(ref, change) => edit.mutate({ ref, change })} isSaving={edit.isPending} />
    </div>
  );
};

// ─── Calendar ─────────────────────────────────────────

const CalendarView = ({ bids, now, onOpen }: { bids: Bid[]; now: Date; onOpen: (b: Bid) => void }) => {
  const today = manilaDay(now);
  const events = bids
    .flatMap((b) => [
      ...(b.preBidAt ? [{ at: b.preBidAt, what: "Pre-bid", bid: b }] : []),
      ...(b.dueAt ? [{ at: b.dueAt, what: "Bids due", bid: b }] : []),
    ])
    .filter((e) => manilaDay(e.at) >= today)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const byDay = new Map<string, typeof events>();
  for (const e of events) byDay.set(manilaDay(e.at), [...(byDay.get(manilaDay(e.at)) ?? []), e]);

  if (!events.length) return <Panel><Empty text="No pre-bid or deadline ahead." /></Panel>;
  return (
    <div className="space-y-4 pb-20">
      {[...byDay.entries()].map(([dayKey, list]) => (
        <section key={dayKey} className="space-y-2">
          <h2 className="text-sm font-medium">
            {dayLabel(list[0].at, now)}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {list.length} {list.length === 1 ? "item" : "items"}
            </span>
          </h2>
          <List>
            {list.map((e) => (
              <button
                key={`${e.bid.ref}-${e.what}`}
                type="button"
                onClick={() => onOpen(e.bid)}
                className="w-full text-left flex items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/40"
              >
                <span className="w-16 shrink-0 text-sm tabular-nums">{timeLabel(e.at)}</span>
                <span className="w-16 shrink-0 text-xs text-muted-foreground">{e.what}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{e.bid.title}</span>
                  <span className="block text-xs text-muted-foreground truncate">{e.bid.buyer}</span>
                </span>
                <Odds bid={e.bid} className="hidden sm:inline-flex w-20 shrink-0" />
              </button>
            ))}
          </List>
        </section>
      ))}
    </div>
  );
};

// ─── Updates ──────────────────────────────────────────

const UpdatesView = ({
  updates,
  isLoading,
  seenAt,
  onOpen,
}: {
  updates: BidUpdate[];
  isLoading: boolean;
  seenAt: Date;
  onOpen: (b: Bid) => void;
}) => {
  if (isLoading) return null;
  if (!updates.length) return <Panel><Empty text="Nothing has changed in the last 30 days." /></Panel>;
  const byDay = new Map<string, BidUpdate[]>();
  for (const u of updates) byDay.set(manilaDay(u.createdAt), [...(byDay.get(manilaDay(u.createdAt)) ?? []), u]);
  return (
    <div className="space-y-4 pb-20">
      {[...byDay.entries()].map(([dayKey, list]) => (
        <section key={dayKey} className="space-y-2">
          <h2 className="text-sm font-medium">{dayLabel(list[0].createdAt)}</h2>
          <List>
            {list.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => onOpen(u.bid)}
                className="w-full text-left flex items-start gap-4 px-4 py-3 transition-colors hover:bg-secondary/40"
              >
                <span className="w-24 shrink-0 pt-0.5 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle",
                      new Date(u.createdAt) > seenAt ? "bg-accent" : "bg-transparent",
                    )}
                  />
                  {UPDATE_LABEL[u.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-snug line-clamp-2">{u.bid.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {u.bid.buyer} · {u.summary}
                  </span>
                </span>
              </button>
            ))}
          </List>
        </section>
      ))}
    </div>
  );
};

// ─── More ─────────────────────────────────────────────

type BigJob = { key: string; what: string; who: string; amount: string; value: number; status: string; isOpen: boolean; bid?: Bid };

/**
 * One list, biggest first, answering one question: where would a big contract come
 * from? Open bids of ₱20M or more that we can join (tap to open), and the biggest
 * past wins in our kind of work, which show the buyers that spend big every year.
 */
const MoreView = ({ bigOpen, onOpen }: { bigOpen: Bid[]; onOpen: (b: Bid) => void }) => {
  const jobs: BigJob[] = [
    ...bigOpen.map((b) => ({
      key: b.ref,
      what: b.title,
      who: b.buyer,
      amount: peso(b.abc),
      value: b.abc ?? 0,
      status: `Open now${b.win ? ` · ${WIN_LABEL[b.win].toLowerCase()} odds` : ""}`,
      isOpen: true,
      bid: b,
    })),
    ...PAST_BIG.map((p) => ({
      key: `${p.buyer}-${p.what}`,
      what: p.what,
      who: p.buyer,
      amount: p.amount,
      value: p.value,
      status: `Won by ${p.winner}`,
      isOpen: false,
    })),
  ].sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6 pb-20">
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Partners</h2>
        <List>
          {PARTNERS.map((p) => (
            <div key={p.name} className="px-4 py-3">
              <p className="text-sm font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.covers}</p>
              <p className="mt-1 text-sm">{p.record}</p>
            </div>
          ))}
        </List>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Papers each bidder needs</h2>
          <List>
            {PAPERS.map((p) => (
              <p key={p} className="px-4 py-2.5 text-sm">
                {p}
              </p>
            ))}
          </List>
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-medium">How bids are won</h2>
          <List>
            {RULES.map((r, i) => (
              <p key={r} className="flex gap-3 px-4 py-2.5 text-sm">
                <span className="w-4 shrink-0 text-muted-foreground tabular-nums">{i + 1}</span>
                <span>{r}</span>
              </p>
            ))}
          </List>
        </section>
      </div>

      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-medium">Where the big money is</h2>
          <p className="text-xs text-muted-foreground">
            Big jobs in our kind of work: open now (₱20M or more) and the biggest past wins (2023–2025). The same buyers spend again each year.
          </p>
        </div>
        <List>
          {jobs.map((j) => {
            const body = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-snug">{j.what}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {j.who} · <span className={j.isOpen ? "text-accent-ink" : ""}>{j.status}</span>
                  </span>
                </span>
                <span className="shrink-0 text-sm tabular-nums">{j.amount}</span>
              </>
            );
            return j.bid ? (
              <button
                key={j.key}
                type="button"
                onClick={() => onOpen(j.bid!)}
                className="w-full text-left flex items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/40"
              >
                {body}
              </button>
            ) : (
              <div key={j.key} className="flex items-center gap-4 px-4 py-3">
                {body}
              </div>
            );
          })}
        </List>
      </section>
    </div>
  );
};

export default AdminBids;
