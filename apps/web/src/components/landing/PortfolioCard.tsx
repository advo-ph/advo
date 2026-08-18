import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Layers3,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/motion/Reveal";
import { cn } from "@/lib/utils";

const isVideoUrl = (url: string) => /\.(mp4|webm|mov|ogg|ogv|m4v)(\?|$)/i.test(url);

export interface CaseStudyProof {
  overview?: string;
  challenge?: string;
  solution?: string;
  results?: string[];
  metric?: string;
  outcome?: string;
  timeline?: string;
  products_used?: string[];
  productsUsed?: string[];
  before_after?: {
    before?: string;
    after?: string;
  };
  beforeAfter?: {
    before?: string;
    after?: string;
  };
}

interface PortfolioCardProps {
  title: string;
  description: string;
  techStack: string[];
  previewUrl?: string;
  imageUrl?: string;
  slug?: string;
  caseStudy?: CaseStudyProof | null;
  isFeatured?: boolean;
}

const FALLBACK_PRODUCTS = ["Website", "Client Hub", "Admin"];

const compactResult = (text: string) =>
  text.length > 140 ? `${text.slice(0, 138).trim()}...` : text;

const getProof = (
  title: string,
  description: string,
  techStack: string[],
  caseStudy?: CaseStudyProof | null,
) => {
  const results = caseStudy?.results?.filter(Boolean) || [];
  const productsUsed =
    caseStudy?.products_used?.filter(Boolean) ||
    caseStudy?.productsUsed?.filter(Boolean) ||
    [];
  const beforeAfter = caseStudy?.before_after || caseStudy?.beforeAfter;

  return {
    outcome:
      caseStudy?.outcome ||
      caseStudy?.overview ||
      description ||
      `A public proof card for ${title}.`,
    timeline: caseStudy?.timeline || "Built for launch",
    products:
      productsUsed.length > 0
        ? productsUsed
        : techStack.length > 0
          ? techStack.slice(0, 4)
          : FALLBACK_PRODUCTS,
    before: beforeAfter?.before || caseStudy?.challenge || "Manual workflow",
    after: beforeAfter?.after || caseStudy?.solution || "Connected system",
    resultBullets: results.slice(0, 2),
  };
};

// Fallback visual shown only when the project has no image. Reads
// before/after from the case study (or falls back to generic copy).
const ProofMock = ({ before, after }: { before: string; after: string }) => {
  const columns = [
    {
      label: "Before",
      value: before,
      rows: ["Email thread", "Manual invoice", "Loose files"],
      tone: "muted" as const,
    },
    {
      label: "After",
      value: after,
      rows: ["Client hub", "Admin console", "VPS handoff"],
      tone: "active" as const,
    },
  ];

  return (
    <div
      data-viewport-check="proof-system-map"
      className="grid h-full grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/70 bg-border/70"
    >
      {columns.map((column) => (
        <div
          key={column.label}
          className="flex min-h-[210px] flex-col bg-background/85 p-3 sm:p-4"
        >
          <div className="mb-5 flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              {column.label}
            </span>
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                column.tone === "active" ? "bg-accent" : "bg-muted-foreground/35",
              )}
            />
          </div>

          <div className="mb-5 space-y-2.5">
            {column.rows.map((row, index) => (
              <div
                key={row}
                className={cn(
                  "rounded-md border px-2.5 py-2",
                  column.tone === "active"
                    ? "border-accent/25 bg-accent/10"
                    : "border-border/55 bg-secondary/20",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-xs text-foreground/80">{row}</span>
                  <span className="font-mono text-[8px] text-muted-foreground">
                    0{index + 1}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto">
            <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
              {column.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

const PortfolioCard = ({
  title,
  description,
  techStack,
  previewUrl,
  imageUrl,
  slug,
  caseStudy,
  isFeatured = false,
}: PortfolioCardProps) => {
  const projectSlug = slug || title.toLowerCase().replace(/\s+/g, "-");
  const proof = getProof(title, description, techStack, caseStudy);
  const hasPreviewUrl = Boolean(previewUrl && previewUrl !== "#");

  return (
    <Reveal
      as="article"
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border/70 bg-card/90 transition-colors hover:border-foreground/30",
        isFeatured && "md:col-span-2",
      )}
    >
      {hasPreviewUrl && (
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${title} live preview`}
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-md border border-border/70 bg-background/75 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}

      <Link
        to={`/project/${projectSlug}`}
        className={cn(
          "block h-full",
          isFeatured ? "flex flex-col md:grid md:grid-cols-[0.95fr_1fr]" : "flex flex-col",
        )}
      >
        <div className="relative bg-secondary/30 p-3">
          <div
            className={cn(
              "aspect-video overflow-hidden rounded-lg border border-border/60 bg-background/70",
              isFeatured && "md:h-full md:min-h-[430px] md:aspect-auto",
            )}
          >
            {imageUrl ? (
              isVideoUrl(imageUrl) ? (
                <video
                  src={imageUrl}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
                />
              ) : (
                <img
                  src={imageUrl}
                  alt={title}
                  className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
                />
              )
            ) : (
              <ProofMock before={proof.before} after={proof.after} />
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                Shipped
              </p>
              <h3 className="text-xl sm:text-2xl font-semibold leading-tight tracking-tight">
                {title}
              </h3>
            </div>
            <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
          </div>

          <div className="mb-5 border-t border-border/55 pt-5">
            <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
              {compactResult(proof.outcome)}
            </p>
          </div>

          <div className="mb-5 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-background/55 p-3">
              <span className="mb-2 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                <Layers3 className="h-3 w-3" />
                Products
              </span>
              <div className="flex flex-wrap gap-1.5">
                {proof.products.slice(0, 4).map((product) => (
                  <Badge
                    key={product}
                    variant="outline"
                    className="border-border/70 bg-transparent font-mono text-[9px] text-muted-foreground"
                  >
                    {product}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/55 p-3">
              <span className="mb-2 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                <Clock3 className="h-3 w-3" />
                Timeline
              </span>
              <p className="text-sm font-medium">{proof.timeline}</p>
            </div>
          </div>

          {proof.resultBullets.length > 0 && (
            <div className="mb-5 space-y-2">
              {proof.resultBullets.map((result) => (
                <p
                  key={result}
                  className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"
                >
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#27a644]" />
                  {result}
                </p>
              ))}
            </div>
          )}

          <span className="mt-auto inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors group-hover:text-accent">
            View case
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
    </Reveal>
  );
};

export default PortfolioCard;
