import { motion } from "framer-motion";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, Github } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import FloatingNav from "@/components/landing/FloatingNav";
import Footer from "@/components/landing/Footer";

// Project data - in a real app, this would come from a database/CMS
const projectsData: Record<string, {
  title: string;
  description: string;
  fullDescription: string;
  challenge: string;
  solution: string;
  results: string[];
  techStack: string[];
  imageUrl?: string;
  previewUrl?: string;
  githubUrl?: string;
}> = {
  "vbe-eye-center": {
    title: "VBE Eye Center",
    description: "EMR app for an ophthalmology clinic streamlining workflow between OPD, nurses, and doctors.",
    fullDescription: "A comprehensive Electronic Medical Record (EMR) system designed specifically for ophthalmology clinics. The system digitizes the entire patient journey from registration to consultation and follow-up care.",
    challenge: "The clinic was operating entirely on paper records, leading to lost files, slow patient processing, and difficulty tracking patient history across multiple visits.",
    solution: "We built a custom EMR system with role-based access for OPD staff, nurses, and doctors. The system features real-time queue management, digital patient records, prescription generation, and appointment scheduling.",
    results: [
      "Reduced patient wait time by 40%",
      "Zero lost patient records since implementation",
      "Streamlined workflow between departments",
      "Digital prescriptions and medical certificates",
    ],
    techStack: ["React", "Supabase", "PostgreSQL", "TypeScript", "Tailwind CSS"],
    imageUrl: "/portfolio-vbe.png",
    previewUrl: "#",
  },
  "sisia": {
    title: "Sisia",
    description: "AI-powered content generation tool for marketing teams.",
    fullDescription: "Sisia is a marketing automation platform that leverages AI to generate compelling copy, images, and campaign strategies for marketing teams of all sizes.",
    challenge: "Marketing teams often spend hours brainstorming content ideas and creating multiple variations for A/B testing, leading to slow campaign launches.",
    solution: "We integrated OpenAI's GPT and DALL-E APIs to create a unified platform where marketing teams can generate copy, images, and complete campaign strategies with just a few prompts.",
    results: [
      "10x faster content creation",
      "Consistent brand voice across channels",
      "Reduced creative costs by 60%",
      "Improved campaign performance",
    ],
    techStack: ["Next.js", "OpenAI", "Stripe", "Vercel", "TailwindCSS"],
    previewUrl: "#",
  },
  "hiramin": {
    title: "Hiramin",
    description: "Enterprise workforce management solution.",
    fullDescription: "A comprehensive workforce management platform handling scheduling, payroll integration, time tracking, and compliance management for enterprises with distributed teams.",
    challenge: "Large enterprises struggle to manage schedules, track attendance, and ensure labor law compliance across multiple locations and time zones.",
    solution: "We built a scalable solution on AWS with GraphQL APIs, featuring real-time schedule updates, automated compliance checks, and seamless integration with existing payroll systems.",
    results: [
      "Reduced scheduling errors by 85%",
      "Automated compliance reporting",
      "Seamless payroll integration",
      "Real-time workforce visibility",
    ],
    techStack: ["React", "GraphQL", "AWS", "Docker", "Kubernetes"],
    previewUrl: "#",
  },
};

const ProjectDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const project = slug ? projectsData[slug] : null;

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

  return (
    <div className="min-h-screen bg-background">
      <FloatingNav />
      
      <main className="pt-24 pb-16 px-6">
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
            <p className="text-xl text-muted-foreground mb-8">{project.description}</p>
            
            {/* Tech Stack */}
            <div className="flex flex-wrap gap-2 mb-8">
              {project.techStack.map((tech) => (
                <Badge key={tech} variant="outline" className="font-mono text-xs">
                  {tech}
                </Badge>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-4 mb-12">
              {project.previewUrl && project.previewUrl !== "#" && (
                <Button asChild className="btn-press">
                  <a href={project.previewUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View Live
                  </a>
                </Button>
              )}
              {project.githubUrl && (
                <Button variant="outline" asChild className="btn-press">
                  <a href={project.githubUrl} target="_blank" rel="noopener noreferrer">
                    <Github className="w-4 h-4 mr-2" />
                    Source Code
                  </a>
                </Button>
              )}
            </div>
          </motion.div>

          {/* Project Image */}
          {project.imageUrl && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="mb-16"
            >
              <div className="aspect-video bg-secondary rounded-xl overflow-hidden border border-border">
                <img 
                  src={project.imageUrl} 
                  alt={project.title}
                  className="w-full h-full object-cover object-top"
                />
              </div>
            </motion.div>
          )}

          {/* Content Sections */}
          <div className="space-y-12">
            {/* Overview */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-2xl font-bold mb-4">Overview</h2>
              <p className="text-muted-foreground leading-relaxed">
                {project.fullDescription}
              </p>
            </motion.section>

            {/* Challenge */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="p-6 bg-card border border-border rounded-xl glass"
            >
              <h2 className="text-2xl font-bold mb-4">The Challenge</h2>
              <p className="text-muted-foreground leading-relaxed">
                {project.challenge}
              </p>
            </motion.section>

            {/* Solution */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-2xl font-bold mb-4">Our Solution</h2>
              <p className="text-muted-foreground leading-relaxed">
                {project.solution}
              </p>
            </motion.section>

            {/* Results */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-2xl font-bold mb-4">Results</h2>
              <ul className="space-y-3">
                {project.results.map((result, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <span className="w-2 h-2 bg-accent rounded-full mt-2 shrink-0" />
                    <span className="text-muted-foreground">{result}</span>
                  </li>
                ))}
              </ul>
            </motion.section>
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
