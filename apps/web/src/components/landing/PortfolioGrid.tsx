import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import PortfolioCard, { type CaseStudyProof } from "./PortfolioCard";
import { get } from "@/lib/api";
import { Section, SectionHeader } from "@/components/ui/section";
import { Reveal, RevealGroup } from "@/components/motion/Reveal";

interface PortfolioProject {
  portfolio_project_id: number;
  title: string;
  description: string | null;
  preview_url: string | null;
  image_url: string | null;
  tech_stack: string[];
  slug: string | null;
  is_featured: boolean;
  case_study: CaseStudyProof | null;
}

const PortfolioGrid = () => {
  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await get<Record<string, unknown>[]>("/api/content/portfolio");
      setProjects(
        (data || []).map((p) => ({
          portfolio_project_id: (p.portfolioProjectId ?? p.portfolio_project_id) as number,
          title: p.title as string,
          description: (p.description as string) || null,
          tech_stack: ((p.techStack ?? p.tech_stack) as string[] | null) || [],
          preview_url: (p.previewUrl ?? p.preview_url) as string | null,
          image_url: (p.imageUrl ?? p.image_url) as string | null,
          slug: (p.slug as string) || null,
          is_featured: Boolean(p.isFeatured ?? p.is_featured),
          case_study: (p.caseStudy ?? p.case_study ?? null) as CaseStudyProof | null,
        })),
      );
      setLoading(false);
    })();
  }, []);

  return (
    <Section id="portfolio" divided>
      <Reveal>
        <SectionHeader
          number="04"
          eyebrow="Portfolio"
          title="Proof, not just screenshots."
          subtitle="Each card shows the outcome, the surfaces shipped, the launch timeline, and what changed from before to after."
        />
      </Reveal>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <RevealGroup stagger={0.08} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {projects.map((project) => (
            <PortfolioCard
              key={project.portfolio_project_id}
              title={project.title}
              description={project.description || ""}
              techStack={project.tech_stack}
              previewUrl={project.preview_url || undefined}
              imageUrl={project.image_url || undefined}
              slug={project.slug || undefined}
              caseStudy={project.case_study}
              isFeatured={project.is_featured}
            />
          ))}
        </RevealGroup>
      )}
    </Section>
  );
};

export default PortfolioGrid;
