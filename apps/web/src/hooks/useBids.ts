import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, patch, post } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { errorText } from "@/lib/error-text";

/**
 * The Bids page's data (GET /api/bids). The API refreshes from PhilGEPS every morning
 * at 06:00; this only reads what it kept, and polls while a check is running.
 */

export type BidWin = "good" | "fair" | "low";

export interface Bid {
  ref: string;
  title: string;
  fullTitle: string;
  buyer: string;
  fullBuyer: string;
  place: string | null;
  abc: number | null;
  preBidAt: string | null;
  preBidTime: string | null;
  preBidPlace: string | null;
  closingAt: string | null;
  dueAt: string | null;
  isDueFromText: boolean;
  isFit: boolean;
  fitReason: string | null;
  win: BidWin | null;
  kind: "product" | "software" | "hardware" | null;
  topic: string | null;
  joinNote: string | null;
  whyNote: string | null;
  note: string | null;
  ratedBy: "team" | "ai" | "rule" | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  mode: string | null;
  category: string | null;
  deliveryPeriod: string | null;
  publishedOn: string | null;
  supplementCount: number;
  fitAt: string | null;
  isHidden: boolean;
}

export interface BidSyncState {
  isRunning: boolean;
  last: { status: string; startedAt: string; finishedAt: string | null; error: string | null } | null;
  lastGood: {
    startedAt: string;
    finishedAt: string | null;
    status: string;
    listedCount: number;
    unreadCount: number;
    failedPageCount: number;
  } | null;
}

export interface BidsData {
  bids: Bid[];
  sync: BidSyncState;
  member: { seenAt: string | null; isEmail: boolean };
}

export type BidUpdateKind = "new" | "changed" | "pre_bid_soon" | "due_soon" | "withdrawn";

export interface BidUpdate {
  id: number;
  kind: BidUpdateKind;
  summary: string;
  createdAt: string;
  bid: Bid;
}

export type BidEdit = Partial<Pick<Bid, "win" | "joinNote" | "whyNote" | "note" | "isFit" | "isHidden">>;

const BIDS_KEY = ["bids"];
const UPDATES_KEY = ["bids", "updates"];
export const UNSEEN_KEY = ["bids", "unseen"];

async function unwrap<T>(promise: Promise<{ data: T; error: string | null }>): Promise<T> {
  const res = await promise;
  if (res.error) throw new Error(res.error);
  return res.data;
}

export function useBids() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const bids = useQuery({
    queryKey: BIDS_KEY,
    queryFn: () => unwrap(get<BidsData>("/api/bids")),
    staleTime: 60 * 1000,
    // While a check runs (a full read takes a few minutes), look again every 15 s.
    refetchInterval: (q) => (q.state.data?.sync.isRunning ? 15_000 : false),
  });

  const updates = useQuery({
    queryKey: UPDATES_KEY,
    queryFn: () => unwrap(get<BidUpdate[]>("/api/bids/updates")),
    staleTime: 60 * 1000,
    refetchInterval: bids.data?.sync.isRunning ? 15_000 : false,
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: BIDS_KEY });
  };

  const sync = useMutation({
    mutationFn: () => unwrap(post<{ started: boolean }>("/api/bids/sync")),
    onSuccess: (data) => {
      toast({
        title: data.started ? "Checking PhilGEPS" : "A check is already running",
        description: "Your list stays here while it checks. It updates when the check is done.",
      });
      refreshAll();
    },
    onError: (err: Error) =>
      toast({ title: "Check not started", description: errorText(err, "Try again in a minute."), variant: "destructive" }),
  });

  const markSeen = useMutation({
    mutationFn: () => unwrap(post<{ seenAt: string }>("/api/bids/seen")),
    onSuccess: () => queryClient.setQueryData(UNSEEN_KEY, { count: 0 }),
  });

  const setEmail = useMutation({
    mutationFn: (isEmail: boolean) => unwrap(patch<{ isEmail: boolean }>("/api/bids/member", { isEmail })),
    onMutate: (isEmail) => {
      queryClient.setQueryData<BidsData>(BIDS_KEY, (old) => (old ? { ...old, member: { ...old.member, isEmail } } : old));
    },
    onSuccess: (data) => toast({ title: data.isEmail ? "Daily email on" : "Daily email off" }),
    onError: (err: Error) => {
      toast({ title: "Not saved", description: errorText(err, "Try again."), variant: "destructive" });
      refreshAll();
    },
  });

  const edit = useMutation({
    mutationFn: ({ ref, change }: { ref: string; change: BidEdit }) => unwrap(patch<Bid>(`/api/bids/${ref}`, change)),
    onSuccess: (row) => {
      queryClient.setQueryData<BidsData>(BIDS_KEY, (old) =>
        old ? { ...old, bids: old.bids.map((b) => (b.ref === row.ref ? row : b)) } : old,
      );
      toast({ title: "Saved" });
    },
    onError: (err: Error) => toast({ title: "Not saved", description: errorText(err, "Try again."), variant: "destructive" }),
  });

  return { bids, updates, sync, markSeen, setEmail, edit };
}

/** The sidebar badge. Cheap; checked on load and every 10 minutes. */
export function useBidUnseen(isEnabled: boolean) {
  return useQuery({
    queryKey: UNSEEN_KEY,
    queryFn: () => unwrap(get<{ count: number }>("/api/bids/unseen")),
    enabled: isEnabled,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });
}
