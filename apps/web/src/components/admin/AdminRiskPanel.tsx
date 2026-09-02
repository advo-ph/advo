/**
 * The panel that would have caught Coffee Rush.
 *
 * Coffee Rush is in development with no signed contract. That is the FourlinQ mistake —
 * open-ended revisions and a downpayment that "isnt enough" — repeating live, and nothing
 * on this dashboard said so. Every fact needed to say it was already in the database.
 *
 * Three deliberate presentation choices, each of which is the difference between a panel
 * people act on and one they learn to scroll past:
 *
 *   1. IT DISAPPEARS WHEN THERE IS NOTHING TO SAY. A risk panel showing "0 issues" every
 *      day is furniture, and furniture is invisible by the time it finally has something
 *      on it. Rendering nothing is a real state, not an unfinished one.
 *
 *   2. EVERY ROW NAMES A REASON IN WORDS. "₱60,000 at risk" prompts "why?", and a number
 *      whose explanation lives in someone's head is a number that gets argued with rather
 *      than acted on.
 *
 *   3. NO RED. The severity is carried by ORDER — worst first — and by the reason text.
 *      A wall of red is read as decoration within a week; this repo's landing work already
 *      settled that colour is not an argument.
 *
 * Staleness sits in the same panel because the two questions are the same question asked
 * from different ends: money exposed, and a client nobody has spoken to.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { Panel } from "@/components/admin/_ui";

interface ProjectRisk {
  projectId: number;
  title: string;
  projectStatus: string;
  totalValueCents: number;
  uninvoicedCents: number;
  overdueCents: number;
  exposureCents: number;
  reason: string[];
}

interface MoneyAtRisk {
  totalExposureCents: number;
  unsignedCount: number;
  project: ProjectRisk[];
}

interface ClientStaleness {
  clientId: number;
  companyName: string;
  dayCountSinceContact: number | null;
  activeProjectCount: number;
  isStale: boolean;
}

/**
 * Plain sentences, not codes.
 *
 * The API returns machine reasons because a UI should not parse prose; this map is the
 * one place they become English, so a wording change is one edit rather than a search.
 */
const REASON_TEXT: Record<string, string> = {
  unsigned_contract: "in progress with no signed contract",
  no_contract_value: "no contract value recorded",
  uninvoiced_value: "contract value not yet invoiced",
  overdue_invoice: "invoice past due",
};

/** Days of silence before a client with active work is worth a look. Matches the API. */
const STALE_LABEL_THRESHOLD = 14;

interface AdminRiskPanelProps {
  formatCurrency: (cents: number) => string;
  onOpenProject?: (projectId: number) => void;
}

const AdminRiskPanel = ({ formatCurrency, onOpenProject }: AdminRiskPanelProps) => {
  const [risk, setRisk] = useState<MoneyAtRisk | null>(null);
  const [stale, setStale] = useState<ClientStaleness[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const [riskRes, staleRes] = await Promise.all([
        api<MoneyAtRisk>("/api/insight/money-at-risk"),
        api<ClientStaleness[]>("/api/insight/staleness"),
      ]);
      if (!isMounted) return;
      // A failed read leaves the panel absent rather than showing a zero. Reporting
      // "nothing at risk" because a request failed is the one wrong answer here.
      if (riskRes.data) setRisk(riskRes.data);
      if (staleRes.data) setStale(staleRes.data.filter((one) => one.isStale));
      setIsLoaded(true);
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  if (!isLoaded) return null;

  const projectAtRisk = risk?.project ?? [];
  // Choice 1: nothing to say, nothing rendered.
  if (projectAtRisk.length === 0 && stale.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {projectAtRisk.length > 0 && (
        <Panel
          title="Needs paper"
          meta={
            risk && risk.unsignedCount > 0
              ? `${risk.unsignedCount} unsigned · ${formatCurrency(risk.totalExposureCents)} exposed`
              : `${formatCurrency(risk?.totalExposureCents ?? 0)} exposed`
          }
        >
          <ul className="divide-y divide-border">
            {projectAtRisk.slice(0, 6).map((one) => (
              <li key={one.projectId}>
                <button
                  type="button"
                  onClick={() => onOpenProject?.(one.projectId)}
                  disabled={!onOpenProject}
                  className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/50 disabled:hover:bg-transparent disabled:cursor-default transition-colors"
                >
                  <AlertTriangle
                    className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium truncate">{one.title}</span>
                    {/* Choice 2: the reason, in words, on every row. */}
                    <span className="block text-xs text-muted-foreground">
                      {one.reason.map((r) => REASON_TEXT[r] ?? r).join(" · ")}
                    </span>
                  </span>
                  <span className="text-sm tabular-nums shrink-0">
                    {formatCurrency(one.exposureCents)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {projectAtRisk.length > 6 && (
            <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
              +{projectAtRisk.length - 6} more
            </p>
          )}
        </Panel>
      )}

      {stale.length > 0 && (
        <Panel title="Gone quiet" meta={`${STALE_LABEL_THRESHOLD}+ days, active work`}>
          <ul className="divide-y divide-border">
            {stale.slice(0, 6).map((one) => (
              <li key={one.clientId} className="px-4 py-3 flex items-center gap-3">
                <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{one.companyName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {one.activeProjectCount} active{" "}
                    {one.activeProjectCount === 1 ? "project" : "projects"}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                  {/* null is NOT "0 days ago" — it means no contact was ever recorded,
                      which is the worse state and must not read as the better one. */}
                  {one.dayCountSinceContact === null
                    ? "no contact on record"
                    : `${one.dayCountSinceContact}d`}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
};

export default AdminRiskPanel;
