/**
 * Corpus — every fact ADVO has stated, with the line it rests on.
 *
 * Four things on one screen: check a claim against the sources; the facts with
 * their basis and a verify toggle; the actions people committed to on recordings,
 * with owner, due date and status (the accountability ledger); the sources and
 * the templates distilled from them. Ingest is a Plaud link or pasted text.
 */
import { useMemo, useState } from "react";
import {
  BookOpenCheck,
  Check,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  Loader2,
  Mic,
  Search,
  ShieldCheck,
  Tag,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Panel, Empty, Stat, StatStrip, Dot } from "@/components/admin/_ui";
import { useCorpus, type CorpusAction, type CorpusFact, type CorpusTemplate } from "@/hooks/useCorpus";

type Tab = "check" | "fact" | "action" | "source" | "template";

const basisDot: Record<string, string> = {
  transcript: "bg-green-500",
  document: "bg-green-500",
  human: "bg-green-500",
  ai_note: "bg-yellow-500",
  heuristic: "bg-muted-foreground",
};

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

const FactRow = ({ fact, onVerify }: { fact: CorpusFact; onVerify: (id: number, next: boolean) => void }) => (
  <li className="px-4 py-3 space-y-1.5">
    <div className="flex items-start justify-between gap-3">
      <p className={`text-sm ${fact.superseded_by_fact_id ? "line-through text-muted-foreground" : ""}`}>{fact.claim}</p>
      <button
        type="button"
        onClick={() => onVerify(fact.corpus_fact_id, !fact.is_verified)}
        className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border transition-colors ${
          fact.is_verified ? "border-green-500/40 text-green-400" : "border-border text-muted-foreground hover:text-foreground"
        }`}
        title={fact.is_verified ? "Verified by a person. Click to unverify." : "Mark as verified by a person."}
      >
        <ShieldCheck className="h-3 w-3" />
        {fact.is_verified ? "Verified" : "Verify"}
      </button>
    </div>
    {fact.quote && <p className="text-xs text-muted-foreground italic">“{fact.quote}”</p>}
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Dot className={basisDot[fact.basis] ?? "bg-muted-foreground"} />
        {fact.basis} · {Math.round(Number(fact.confidence) * 100)}%
      </span>
      <span className="px-1.5 py-0.5 rounded bg-secondary">{fact.category}</span>
      {fact.locator && <span className="tabular-nums">{fact.locator}</span>}
      {fact.speaker && <span>{fact.speaker}</span>}
      <span>{fmtDate(fact.occurred_at)}</span>
      {fact.source_url ? (
        <a href={fact.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
          {fact.source_title.slice(0, 60)}
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span>{fact.source_title.slice(0, 60)}</span>
      )}
    </div>
  </li>
);

const ActionRow = ({ action, onUpdate }: { action: CorpusAction; onUpdate: (id: number, patch: { status?: "open" | "done" | "dropped"; resolutionNote?: string | null }) => void }) => {
  const isOverdue = action.status === "open" && action.due_at && new Date(action.due_at).getTime() < Date.now();
  return (
    <li className="px-4 py-3 flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <p className={`text-sm ${action.status !== "open" ? "text-muted-foreground line-through" : ""}`}>{action.description}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/80">{action.owner_name ?? "Unassigned"}</span>
          <span className={isOverdue ? "text-red-400" : ""}>{action.due_at ? `Due ${fmtDate(action.due_at)}` : "No due date"}</span>
          {action.locator && <span className="tabular-nums">{action.locator}</span>}
          <span>{action.source_title.slice(0, 50)}</span>
          <span>{fmtDate(action.source_occurred_at)}</span>
          {action.resolution_note && <span className="italic">{action.resolution_note}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {action.status === "open" ? (
          <>
            <button type="button" onClick={() => onUpdate(action.corpus_action_id, { status: "done" })} className="p-1.5 rounded-md hover:bg-secondary text-green-400" title="Done">
              <CheckCircle2 className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => onUpdate(action.corpus_action_id, { status: "dropped", resolutionNote: "Dropped" })} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground" title="Drop">
              <XCircle className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button type="button" onClick={() => onUpdate(action.corpus_action_id, { status: "open", resolutionNote: null })} className="text-[11px] text-muted-foreground hover:text-foreground">
            Reopen
          </button>
        )}
      </div>
    </li>
  );
};

const TemplateCard = ({ template, onRender }: { template: CorpusTemplate; onRender: (id: number, value: Record<string, string>) => Promise<{ text: string; missing: string[] }> }) => {
  const [value, setValue] = useState<Record<string, string>>({});
  const [out, setOut] = useState<{ text: string; missing: string[] } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{template.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {template.kind} · v{template.version} · {template.placeholder.length} placeholders · {template.body.length.toLocaleString()} chars
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-8" onClick={() => setIsOpen((v) => !v)}>
          {isOpen ? "Close" : "Fill"}
        </Button>
      </div>
      {isOpen && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {template.placeholder.map((key) => (
              <Input key={key} placeholder={key} value={value[key] ?? ""} onChange={(e) => setValue((v) => ({ ...v, [key]: e.target.value }))} className="h-8 text-xs" />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-8" onClick={async () => setOut(await onRender(template.corpusTemplateId, value))}>
              Render
            </Button>
            {out && (
              <Button size="sm" variant="outline" className="h-8" onClick={() => navigator.clipboard.writeText(out.text)}>
                Copy markdown
              </Button>
            )}
            {out && out.missing.length > 0 && <span className="text-[11px] text-yellow-400">{out.missing.length} placeholders still empty</span>}
          </div>
          {out && <pre className="text-xs whitespace-pre-wrap rounded-md border border-border bg-secondary/30 p-3 max-h-80 overflow-y-auto">{out.text}</pre>}
        </div>
      )}
    </li>
  );
};

const AdminCorpus = () => {
  const [tab, setTab] = useState<Tab>("check");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("open");
  const [claim, setClaim] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [unverifiedOnly, setUnverifiedOnly] = useState(false);
  const corpus = useCorpus({ q, category: category || undefined, status: status || undefined, verified: unverifiedOnly ? false : undefined });

  const categoryList = useMemo(() => Array.from(new Set(corpus.fact.map((f) => f.category))).sort(), [corpus.fact]);
  const s = corpus.stat;

  return (
    <div className="space-y-4">
      <PageHeader title="Corpus" subtitle="Every fact ADVO has stated, with the line it rests on. Check a claim before you quote it." />

      <StatStrip cols={4}>
        <Stat label="Sources" value={String(s?.source_count ?? "—")} sub={`${s?.term_count ?? 0} terms`} />
        <Stat label="Facts" value={String(s?.fact_count ?? "—")} sub={`${s?.verified_fact_count ?? 0} verified by a person`} />
        <Stat label="Open actions" value={String(s?.open_action_count ?? "—")} sub={`${s?.overdue_action_count ?? 0} overdue`} accent={Boolean(s?.overdue_action_count)} />
        <Stat label="Templates" value={String(s?.template_count ?? "—")} sub="contract · proposal · deck · brand" />
      </StatStrip>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {(
          [
            ["check", "Fact check", Search],
            ["fact", "Facts", BookOpenCheck],
            ["action", "Accountability", ClipboardList],
            ["source", "Sources", Mic],
            ["template", "Templates", FileText],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
              tab === id ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "check" && (
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
          <Panel title="Check a claim" bodyClassName="p-4 space-y-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (claim.trim()) void corpus.check(claim.trim());
              }}
            >
              <Input value={claim} onChange={(e) => setClaim(e.target.value)} placeholder="e.g. Felici's infrastructure fee is ₱4,000 a month" />
              <Button type="submit" disabled={corpus.isChecking || !claim.trim()} className="bg-accent text-accent-foreground hover:bg-accent/90">
                {corpus.isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </form>
            {corpus.checkResult && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Dot
                    className={
                      corpus.checkResult.verdict === "supported" ? "bg-green-500" : corpus.checkResult.verdict === "conflicting" ? "bg-red-500" : "bg-muted-foreground"
                    }
                  />
                  <span className="font-medium capitalize">{corpus.checkResult.verdict}</span>
                  {corpus.checkResult.discount && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Tag className="h-3 w-3" /> {corpus.checkResult.discount.explanation}
                    </span>
                  )}
                  {corpus.checkResult.isContested && (
                    <span className="text-xs text-yellow-400">other sources carry a different number — check the dates</span>
                  )}
                  <span className="text-muted-foreground text-xs">
                    {corpus.checkResult.numberInClaim.length > 0 ? `numbers in claim: ${corpus.checkResult.numberInClaim.join(", ")}` : "no numbers to compare"} · {corpus.checkResult.match.length} related facts
                  </span>
                </div>
                {corpus.checkResult.match.length === 0 ? (
                  <Empty text="No fact in the corpus mentions this. That is an answer too: nobody has said it on a recording or in a document we hold." />
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {corpus.checkResult.match.map((m) => (
                      <li key={m.corpusFactId} className="px-3 py-2.5 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm">{m.claim}</p>
                          {m.sharesEveryNumber ? <Check className="h-4 w-4 text-green-400 shrink-0" /> : <XCircle className="h-4 w-4 text-muted-foreground/60 shrink-0" />}
                        </div>
                        {m.quote && <p className="text-xs text-muted-foreground italic">“{m.quote}”</p>}
                        <p className="text-[11px] text-muted-foreground">
                          {m.basis} · {Math.round(m.confidence * 100)}% · {m.locator ?? ""} · {m.source.title.slice(0, 60)} · {fmtDate(m.occurredAt)}
                          {m.isVerified && <span className="ml-2 text-green-400">verified</span>}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-muted-foreground">The verdict is a comparison of numbers between your claim and the sources found. It shows its work; it does not decide truth on its own.</p>
              </div>
            )}
          </Panel>

          <div className="space-y-4">
            <Panel title="Ingest a recording" bodyClassName="p-4 space-y-2">
              <Input value={shareUrl} onChange={(e) => setShareUrl(e.target.value)} placeholder="https://web.plaud.ai/s/pub_…" />
              <Button
                size="sm"
                disabled={corpus.isIngesting || !shareUrl.trim()}
                onClick={async () => {
                  await corpus.ingestPlaud({ shareUrl: shareUrl.trim() });
                  setShareUrl("");
                }}
                className="h-8 bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {corpus.isIngesting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Mic className="h-4 w-4 mr-1.5" />}
                Ingest
              </Button>
              <p className="text-[11px] text-muted-foreground">Lands in Meetings too. Claude extracts when a key is set, else a heuristic marks guesses as guesses.</p>
            </Panel>
            <Panel title="Ingest text" bodyClassName="p-4 space-y-2">
              <Input value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} placeholder="Title (minutes, email, chat export)" />
              <Textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={5} placeholder="Paste the text…" />
              <Button
                size="sm"
                variant="outline"
                disabled={corpus.isIngesting || !pasteTitle.trim() || pasteText.trim().length < 20}
                onClick={async () => {
                  await corpus.ingestText({ title: pasteTitle.trim(), text: pasteText });
                  setPasteTitle("");
                  setPasteText("");
                }}
                className="h-8"
              >
                Ingest text
              </Button>
            </Panel>
          </div>
        </div>
      )}

      {tab === "fact" && (
        <Panel
          title="Facts"
          meta={`${corpus.fact.length} shown`}
          action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setUnverifiedOnly((v) => !v)}
                className={`h-8 rounded-md border px-2.5 text-xs ${unverifiedOnly ? "border-accent text-accent" : "border-border text-muted-foreground hover:text-foreground"}`}
                title="Show only facts no person has verified yet"
              >
                Unverified only
              </button>
              {unverifiedOnly && corpus.fact.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={corpus.isVerifyingMany}
                  onClick={() => {
                    if (window.confirm(`Verify all ${corpus.fact.length} facts shown? Only do this after reading them.`)) {
                      corpus.verifyMany({ corpusFactId: corpus.fact.map((f) => f.corpus_fact_id), isVerified: true });
                    }
                  }}
                >
                  <ShieldCheck className="h-3 w-3" /> Verify all {corpus.fact.length} shown
                </Button>
              )}
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
                <option value="">All categories</option>
                {categoryList.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search facts" className="h-8 w-56 text-xs" />
            </div>
          }
        >
          {corpus.fact.length === 0 ? (
            <Empty text={corpus.isLoading ? "Loading…" : "No facts yet. Ingest a recording or run scripts/corpus-load.mjs."} />
          ) : (
            <ul className="divide-y divide-border">
              {corpus.fact.map((f) => (
                <FactRow key={f.corpus_fact_id} fact={f} onVerify={(id, next) => corpus.verify({ corpusFactId: id, isVerified: next })} />
              ))}
            </ul>
          )}
        </Panel>
      )}

      {tab === "action" && (
        <Panel
          title="Accountability"
          meta={`${corpus.action.length} shown`}
          action={
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
              <option value="open">Open</option>
              <option value="done">Done</option>
              <option value="dropped">Dropped</option>
              <option value="">All</option>
            </select>
          }
        >
          {corpus.action.length === 0 ? (
            <Empty text="Nothing committed on a recording is outstanding." />
          ) : (
            <ul className="divide-y divide-border">
              {corpus.action.map((a) => (
                <ActionRow key={a.corpus_action_id} action={a} onUpdate={(id, patch) => corpus.updateAction({ corpusActionId: id, ...patch })} />
              ))}
            </ul>
          )}
        </Panel>
      )}

      {tab === "source" && (
        <Panel title="Sources" meta={`${corpus.source.length}`}>
          {corpus.source.length === 0 ? (
            <Empty text="No sources yet." />
          ) : (
            <ul className="divide-y divide-border">
              {corpus.source.map((src) => (
                <li key={src.corpus_source_id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium truncate">{src.title}</p>
                    {src.summary && <p className="text-xs text-muted-foreground line-clamp-2">{src.summary}</p>}
                    <p className="text-[11px] text-muted-foreground">
                      {src.kind}
                      {src.document_kind ? ` · ${src.document_kind}` : ""} · {fmtDate(src.occurred_at)}
                      {src.duration_second ? ` · ${Math.round(src.duration_second / 60)} min` : ""} · {src.fact_count} facts · {src.open_action_count} open
                      {src.project_id ? ` · project ${src.project_id}` : src.lead_name ? ` · lead ${src.lead_name}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {src.url && (
                      <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                    <button
                      type="button"
                      disabled={corpus.isDeletingSource}
                      onClick={() => {
                        if (window.confirm(`Remove "${src.title}" and its ${src.fact_count} facts? This cannot be undone.`)) {
                          corpus.deleteSource(src.corpus_source_id);
                        }
                      }}
                      className="text-muted-foreground hover:text-red-400 disabled:opacity-50"
                      aria-label="Remove source"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {tab === "template" && (
        <Panel title="Templates" meta={`${corpus.template.length} active`}>
          {corpus.template.length === 0 ? (
            <Empty text="No templates yet. Run scripts/corpus-load.mjs --only template." />
          ) : (
            <ul className="divide-y divide-border">
              {corpus.template.map((t) => (
                <TemplateCard key={t.corpusTemplateId} template={t} onRender={(id, value) => corpus.render({ corpusTemplateId: id, value })} />
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
};

export default AdminCorpus;
