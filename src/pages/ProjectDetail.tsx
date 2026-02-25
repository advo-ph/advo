import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, Github, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import FloatingNav from "@/components/landing/FloatingNav";
import Footer from "@/components/landing/Footer";
import { supabase } from "@/integrations/supabase/client";

interface CaseStudy {
  overview?: string;
  challenge?: string;
  solution?: string;
  results?: string[];
  github_url?: string;
}

interface Project {
  portfolio_project_id: number;
  title: string;
  description: string | null;
  preview_url: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  tech_stack: string[] | null;
  slug: string | null;
  case_study: CaseStudy | null;
}

const ProjectDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data } = await (supabase
        .from("portfolio_project") as unknown as { select: (q: string) => { eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: Project | null }> } } })
        .select("portfolio_project_id, title, description, preview_url, image_url, image_urls, tech_stack, slug, case_study")
        .eq("slug", slug)
        .maybeSingle();

      setProject(data || null);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Project Not Found</h1>
          <Link to="/" className="text-accent hover:underline">
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  const cs = project.case_study || {};
  const heroImage = project.image_urls?.[0] || project.image_url;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <FloatingNav />
      
      <main className="pt-24 pb-16 px-6 flex-1">
        <div className="max-w-4xl mx-auto">
          {/* Back Button */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Link 
              to="/#portfolio"
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8 group"
            >
              <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
              Back to Portfolio
            </Link>
          </motion.div>

          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="text-xs font-medium text-accent uppercase tracking-wider mb-2 block">
              Case Study
            </span>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">{project.title}</h1>
            {project.description && (
              <p className="text-xl text-muted-foreground mb-8">{project.description}</p>
            )}
            
            {/* Tech Stack */}
            {project.tech_stack && project.tech_stack.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-8">
                {project.tech_stack.map((tech) => (
                  <Badge key={tech} variant="outline" className="font-mono text-xs">
                    {tech}
                  </Badge>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-4 mb-12">
              {project.preview_url && project.preview_url !== "#" && (
                <Button asChild className="btn-press">
                  <a href={project.preview_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View Live
                  </a>
                </Button>
              )}
              {cs.github_url && (
                <Button variant="outline" asChild className="btn-press">
                  <a href={cs.github_url} target="_blank" rel="noopener noreferrer">
                    <Github className="w-4 h-4 mr-2" />
                    Source Code
                  </a>
                </Button>
              )}
            </div>
          </motion.div>

          {/* Project Image */}
          {heroImage && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="mb-16"
            >
              <div className="aspect-video bg-secondary rounded-xl overflow-hidden border border-border">
                <img 
                  src={heroImage} 
                  alt={project.title}
                  className="w-full h-full object-cover object-top"
                />
              </div>
            </motion.div>
          )}

          {/* Content Sections */}
          <div className="space-y-12">
            {/* Overview */}
            {cs.overview && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <h2 className="text-2xl font-bold mb-4">Overview</h2>
                <p className="text-muted-foreground leading-relaxed">
                  {cs.overview}
                </p>
              </motion.section>
            )}

            {/* Challenge */}
            {cs.challenge && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="p-6 bg-card border border-border rounded-xl glass"
              >
                <h2 className="text-2xl font-bold mb-4">The Challenge</h2>
                <p className="text-muted-foreground leading-relaxed">
                  {cs.challenge}
                </p>
              </motion.section>
            )}

            {/* Solution */}
            {cs.solution && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <h2 className="text-2xl font-bold mb-4">Our Solution</h2>
                <p className="text-muted-foreground leading-relaxed">
                  {cs.solution}
                </p>
              </motion.section>
            )}

            {/* Results */}
            {cs.results && cs.results.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <h2 className="text-2xl font-bold mb-4">Results</h2>
                <ul className="space-y-3">
                  {cs.results.map((result, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <span className="w-2 h-2 bg-accent rounded-full mt-2 shrink-0" />
                      <span className="text-muted-foreground">{result}</span>
                    </li>
                  ))}
                </ul>
              </motion.section>
            )}
          </div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mt-16 p-8 bg-card border border-border rounded-xl text-center"
          >
            <h3 className="text-2xl font-bold mb-2">Like what you see?</h3>
            <p className="text-muted-foreground mb-6">
              Let's discuss how we can help with your project.
            </p>
            <Button asChild className="btn-press gradient-accent text-white border-0">
              <Link to="/start">Start a Project</Link>
            </Button>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ProjectDetail;
