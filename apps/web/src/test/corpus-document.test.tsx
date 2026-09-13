/**
 * The corpus document view (migration 047): a source opened to its full text, then the
 * facts, terms and actions taken from it. Rendered in jsdom; no API.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CorpusDocumentState, CorpusDocumentView } from "@/components/admin/CorpusDocument";
import { isMarkdownLike } from "@/lib/corpus-document";
import { SOURCE_PAGE_SIZE, sourcePagePath } from "@/hooks/useCorpus";

describe("corpus source paging", () => {
  it("sends the filters with every page, so page two is page two of the same search", () => {
    const first = new URL(sourcePagePath({ q: " felici ", kind: "plaud", projectId: 3 }, 0), "http://x");
    const second = new URL(sourcePagePath({ q: " felici ", kind: "plaud", projectId: 3 }, SOURCE_PAGE_SIZE), "http://x");
    expect(first.pathname).toBe("/api/corpus/source");
    expect(Object.fromEntries(first.searchParams)).toEqual({ q: "felici", kind: "plaud", projectId: "3", limit: "50", offset: "0" });
    expect(second.searchParams.get("offset")).toBe("50");
    expect(second.searchParams.get("q")).toBe("felici");
  });
  it("leaves out filters that are not set", () => {
    const url = new URL(sourcePagePath({}, 0), "http://x");
    expect([...url.searchParams.keys()]).toEqual(["limit", "offset"]);
  });
});
import type { CorpusDocument } from "@/hooks/useCorpus";

const base: CorpusDocument = {
  corpusSourceId: 7,
  kind: "drive_doc",
  externalId: "drive:felici-contract",
  url: "https://docs.google.com/document/d/example",
  title: "Felici service agreement",
  documentKind: "contract",
  occurredAt: "2026-08-20T00:00:00Z",
  durationSecond: null,
  language: "en",
  summary: "Four sites, one fee.",
  body: "# Agreement\n\n- Fee: ₱200,000 for four sites\n- Revisions: 5 rounds",
  projectId: 3,
  leadName: null,
  ingestedAt: "2026-09-03T00:00:00Z",
  updatedAt: "2026-09-03T00:00:00Z",
  fact: [
    { corpusFactId: 1, claim: "The total fee is ₱200,000 for four sites.", category: "pricing", quote: "₱200,000", locator: "Fees", basis: "document", confidence: "0.90", isVerified: true, supersededByFactId: null },
  ],
  term: [{ corpusTermId: 1, name: "revision_round", value: "5", unit: "rounds" }],
  action: [{ corpusActionId: 1, description: "Send the signed copy", ownerName: "Gelo", dueAt: null, status: "open" }],
};

describe("corpus document view", () => {
  it("shows the metadata, the full body, then what was extracted", () => {
    render(<CorpusDocumentView document={base} projectTitle="Felici" onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: "Felici service agreement" })).toBeInTheDocument();
    expect(screen.getByText("Felici")).toBeInTheDocument();
    expect(screen.getByText(/drive_doc · contract/)).toBeInTheDocument();
    expect(screen.getByText("Four sites, one fee.")).toBeInTheDocument();
    const body = screen.getByTestId("corpus-document-body");
    expect(body.textContent).toBe(base.body);
    expect(screen.getByText(/markdown/)).toBeInTheDocument();
    expect(screen.getByText("The total fee is ₱200,000 for four sites.")).toBeInTheDocument();
    expect(screen.getByText("revision_round")).toBeInTheDocument();
    expect(screen.getByText("Send the signed copy")).toBeInTheDocument();
  });

  it("keeps a very long body inside its own scrolling, wrapping box", () => {
    const longBody = "word ".repeat(400_000);
    render(<CorpusDocumentView document={{ ...base, body: longBody }} onClose={() => {}} />);
    const body = screen.getByTestId("corpus-document-body");
    expect(body.textContent?.length).toBe(longBody.length);
    expect(body.className).toContain("overflow-y-auto");
    expect(body.className).toContain("whitespace-pre-wrap");
    expect(body.className).toContain("break-words");
    expect(body.className).toContain("max-h-[70vh]");
    expect(screen.getByText(/2,000,000 characters/)).toBeInTheDocument();
  });

  it("says so when a source has no stored text, and goes back on request", () => {
    const onClose = vi.fn();
    render(<CorpusDocumentView document={{ ...base, body: null, fact: [], term: [], action: [] }} onClose={onClose} />);
    expect(screen.queryByTestId("corpus-document-body")).toBeNull();
    expect(screen.getByText(/No full text is stored/)).toBeInTheDocument();
    expect(screen.getByText("Nothing was extracted from this source.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to sources" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows loading and failure instead of a half-empty article", () => {
    const { rerender } = render(<CorpusDocumentState document={null} isLoading error={null} onClose={() => {}} />);
    expect(screen.getByText("Opening…")).toBeInTheDocument();
    rerender(<CorpusDocumentState document={null} isLoading={false} error="No such source" onClose={() => {}} />);
    expect(screen.getByText("No such source")).toBeInTheDocument();
  });

  it("recognises markdown by its line structure, not by any stray symbol", () => {
    expect(isMarkdownLike("# Title\n\ntext")).toBe(true);
    expect(isMarkdownLike("intro\n| a | b |\n|---|---|")).toBe(true);
    expect(isMarkdownLike("Speaker 1: the fee is 50% down")).toBe(false);
  });
});
