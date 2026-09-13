/**
 * One corpus source, opened: what it is, where it came from, the full text it was
 * extracted from, and what the corpus took out of it.
 *
 * The body is shown as written. No markdown renderer ships in this repo and a document
 * this long does not justify adding one, so markdown is kept legible as preformatted,
 * wrapping text in a monospace face — headings, tables and lists stay readable as source.
 * A multi-megabyte transcript scrolls inside its own box, so the facts under it are one
 * scroll away rather than a million characters away, and nothing overflows at 375px.
 */
import { ArrowLeft, Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { Panel, Empty } from "@/components/admin/_ui";
import type { CorpusDocument } from "@/hooks/useCorpus";
import { isMarkdownLike } from "@/lib/corpus-document";

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

const Meta = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="text-sm break-words">{children}</dd>
  </div>
);

export const CorpusDocumentView = ({
  document,
  projectTitle,
  onClose,
}: {
  document: CorpusDocument;
  projectTitle?: string | null;
  onClose: () => void;
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const body = document.body ?? "";
  const isMarkdown = body ? isMarkdownLike(body) : false;

  return (
    <article className="space-y-4 min-w-0" aria-label={document.title}>
      <div className="flex items-start gap-3 min-w-0">
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
          aria-label="Back to sources"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-medium break-words">{document.title}</h2>
          <p className="text-[11px] text-muted-foreground break-all">{document.externalId}</p>
        </div>
        {document.url && (
          <a
            href={document.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
            aria-label="Open the original"
          >
            <ExternalLink className="h-4 w-4" strokeWidth={1} />
          </a>
        )}
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 border-y border-border py-3">
        <Meta label="Kind">
          {document.kind}
          {document.documentKind ? ` · ${document.documentKind}` : ""}
        </Meta>
        <Meta label="Project">{projectTitle ?? (document.projectId ? `Project ${document.projectId}` : document.leadName ? `Lead ${document.leadName}` : "—")}</Meta>
        <Meta label="Occurred">
          {fmtDate(document.occurredAt)}
          {document.durationSecond ? ` · ${Math.round(document.durationSecond / 60)} min` : ""}
        </Meta>
        <Meta label="Ingested">{fmtDate(document.ingestedAt)}</Meta>
      </dl>

      {document.summary && (
        <section className="space-y-1">
          <h3 className="text-xs font-medium text-muted-foreground">Summary</h3>
          <p className="text-sm whitespace-pre-wrap break-words">{document.summary}</p>
        </section>
      )}

      <Panel
        title="Document"
        meta={body ? `${body.length.toLocaleString()} characters${isMarkdown ? " · markdown" : ""}` : undefined}
        action={
          body ? (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(body);
                setIsCopied(true);
              }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {isCopied ? <Check className="h-3 w-3" strokeWidth={1} /> : <Copy className="h-3 w-3" strokeWidth={1} />}
              {isCopied ? "Copied" : "Copy"}
            </button>
          ) : undefined
        }
      >
        {body ? (
          <pre
            data-testid="corpus-document-body"
            className={`max-h-[70vh] overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words p-4 text-xs leading-relaxed ${
              isMarkdown ? "font-mono" : "font-sans"
            }`}
          >
            {body}
          </pre>
        ) : (
          <Empty text="No full text is stored for this source. It was ingested before the corpus kept documents, or from a bundle without a body." />
        )}
      </Panel>

      <Panel title="Facts" meta={`${document.fact.length}`}>
        {document.fact.length === 0 ? (
          <Empty text="Nothing was extracted from this source." />
        ) : (
          <ul className="divide-y divide-border">
            {document.fact.map((f) => (
              <li key={f.corpusFactId} className="px-4 py-3 space-y-1 min-w-0">
                <p className={`text-sm break-words ${f.supersededByFactId ? "line-through text-muted-foreground" : ""}`}>{f.claim}</p>
                {f.quote && <p className="text-xs text-muted-foreground italic break-words">“{f.quote}”</p>}
                <p className="text-[11px] text-muted-foreground">
                  {f.category} · {f.basis} · {Math.round(Number(f.confidence) * 100)}%{f.locator ? ` · ${f.locator}` : ""}
                  {f.isVerified ? " · verified" : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {document.term.length > 0 && (
        <Panel title="Terms" meta={`${document.term.length}`}>
          <ul className="divide-y divide-border">
            {document.term.map((t) => (
              <li key={t.corpusTermId} className="px-4 py-2 flex items-center justify-between gap-3 text-xs min-w-0">
                <span className="font-medium break-all">{t.name}</span>
                <span className="tabular-nums text-right break-all">
                  {t.value}
                  {t.unit ? ` ${t.unit}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {document.action.length > 0 && (
        <Panel title="Actions" meta={`${document.action.length}`}>
          <ul className="divide-y divide-border">
            {document.action.map((a) => (
              <li key={a.corpusActionId} className="px-4 py-3 space-y-1 min-w-0">
                <p className={`text-sm break-words ${a.status !== "open" ? "line-through text-muted-foreground" : ""}`}>{a.description}</p>
                <p className="text-[11px] text-muted-foreground">
                  {a.ownerName ?? "Unassigned"} · {a.dueAt ? `Due ${fmtDate(a.dueAt)}` : "No due date"} · {a.status}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </article>
  );
};

/** Loading and failure states around the view, so the tab never renders a half-empty article. */
export const CorpusDocumentState = ({
  document,
  isLoading,
  error,
  projectTitle,
  onClose,
}: {
  document: CorpusDocument | null;
  isLoading: boolean;
  error: string | null;
  projectTitle?: string | null;
  onClose: () => void;
}) => {
  if (document) return <CorpusDocumentView document={document} projectTitle={projectTitle} onClose={onClose} />;
  return (
    <Panel title="Document" action={<button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Back to sources</button>}>
      {isLoading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1} /> Opening…
        </div>
      ) : (
        <Empty text={error ?? "No such source."} />
      )}
    </Panel>
  );
};
