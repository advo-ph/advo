import { motion } from "framer-motion";
import PortfolioCard from "./PortfolioCard";

// Sample portfolio data
const portfolioProjects = [
  {
    title: "VBE Eye Center",
    description: "EMR app for an ophthalmology clinic streamlining workflow between OPD, nurses, and doctors. Transitioned from paper to digital with improved queuing and patient tracking.",
    techStack: ["React", "Supabase", "PostgreSQL", "TypeScript"],
    previewUrl: "#",
    imageUrl: "/portfolio-vbe.png",
  },
  {
    title: "Sisia",
    description: "AI-powered content generation tool for marketing teams. Generates copy, images, and campaign strategies.",
    techStack: ["Next.js", "OpenAI", "Stripe", "Vercel"],
    previewUrl: "#",
  },
  {
    title: "Hiramin",
    description: "Enterprise workforce management solution. Handles scheduling, payroll integration, and compliance tracking.",
    techStack: ["React", "GraphQL", "AWS", "Docker"],
    previewUrl: "#",
  },
];

const PortfolioGrid = () => {
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {portfolioProjects.map((project, index) => (
            <PortfolioCard
              key={project.title}
              {...project}
              index={index}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default PortfolioGrid;
