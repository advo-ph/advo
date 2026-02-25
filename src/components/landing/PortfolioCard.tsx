import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

interface PortfolioCardProps {
  title: string;
  description: string;
  techStack: string[];
  previewUrl?: string;
  imageUrl?: string;
  index: number;
  slug?: string;
}

const PortfolioCard = ({ title, description, techStack, previewUrl, imageUrl, index, slug }: PortfolioCardProps) => {
  // Generate slug from title if not provided
  const projectSlug = slug || title.toLowerCase().replace(/\s+/g, "-");
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.5, type: "spring", damping: 20 }}
      className="group relative bg-card border border-border rounded-lg overflow-hidden card-glow"
    >
      <Link to={`/project/${projectSlug}`} className="block">
        {/* Preview area */}
        <div className="aspect-video bg-secondary/50 flex items-center justify-center relative overflow-hidden">
          {imageUrl ? (
            <img 
              src={imageUrl} 
              alt={title}
              className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <>
              <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,hsl(var(--border))_25%,hsl(var(--border))_50%,transparent_50%,transparent_75%,hsl(var(--border))_75%)] bg-[size:4px_4px] opacity-30" />
              <span className="font-mono text-4xl font-bold text-muted-foreground/30 relative z-10">
                {title.charAt(0)}
              </span>
            </>
          )}
          
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/5 transition-colors duration-300" />
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-xl font-semibold group-hover:text-accent transition-colors">{title}</h3>
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
          
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
            {description}
          </p>

          {/* Tech Stack */}
          <div className="flex flex-wrap gap-2">
            {techStack.map((tech) => (
              <Badge 
                key={tech} 
                variant="outline" 
                className="font-mono text-xs bg-transparent"
              >
                {tech}
              </Badge>
            ))}
          </div>
        </div>
      </Link>

      {/* Hover border effect */}
      <div className="absolute inset-0 border border-accent/0 group-hover:border-accent/50 rounded-lg transition-colors duration-300 pointer-events-none" />
    </motion.div>
  );
};

export default PortfolioCard;
