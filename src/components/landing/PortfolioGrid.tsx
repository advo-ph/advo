import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import PortfolioCard from "./PortfolioCard";
import { get } from "@/lib/api";

interface PortfolioProject {
  portfolio_project_id: number;
  title: string;
  description: string | null;
  preview_url: string | null;
  image_url: string | null;
  tech_stack: string[];
  slug: string | null;
}

const PortfolioGrid = () => {
  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPortfolio = async () => {
      const { data } = await get<Record<string, unknown>[]>("/api/content/portfolio");

      setProjects((data || []).map((p) => ({
        portfolio_project_id: (p.portfolioProjectId ?? p.portfolio_project_id) as number,
        title: p.title as string,
        description: (p.description as string) || null,
        tech_stack: (p.techStack ?? p.tech_stack) as string[] | null,
        preview_url: (p.previewUrl ?? p.preview_url) as string | null,
        image_url: (p.imageUrl ?? p.image_url) as string | null,
        slug: (p.slug as string) || null,
        is_featured: (p.isFeatured ?? p.is_featured) as boolean,
      })));
      setLoading(false);
    };

    fetchPortfolio();
  }, []);

  return (
    <section id="portfolio" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16"
        >
          <span className="text-xs font-medium text-accent uppercase tracking-wider mb-2 block">Portfolio</span>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Recent Work</h2>
          <p className="text-muted-foreground max-w-2xl">A selection of projects we've delivered for startups and enterprises.</p>
        </motion.div>

        {/* Bento Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project, index) => (
              <PortfolioCard
                key={project.portfolio_project_id}
                title={project.title}
                description={project.description || ""}
                techStack={project.tech_stack || []}
                previewUrl={project.preview_url || "#"}
                imageUrl={project.image_url || undefined}
                slug={project.slug || undefined}
                index={index}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default PortfolioGrid;
