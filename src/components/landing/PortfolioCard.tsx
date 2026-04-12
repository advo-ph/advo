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

const PortfolioCard = ({
  title,
  description,
  techStack,
  previewUrl,
  imageUrl,
  slug,
}: PortfolioCardProps) => {
  const projectSlug = slug || title.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="group relative bg-card border border-border rounded-xl overflow-hidden hover:border-foreground/30 transition-colors">
      <Link to={`/project/${projectSlug}`} className="block">
        <div className="aspect-video bg-secondary/40 flex items-center justify-center relative overflow-hidden">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={title}
              className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
            />
          ) : (
            <span className="font-mono text-5xl font-semibold text-muted-foreground/20">
              {title.charAt(0)}
            </span>
          )}
        </div>

        <div className="p-6">
          <div className="flex items-start justify-between mb-3 gap-3">
            <h3 className="text-lg font-medium">{title}</h3>
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>

          <p className="text-sm text-muted-foreground mb-4 line-clamp-2 leading-relaxed">
            {description}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {techStack.map((tech) => (
              <Badge
                key={tech}
                variant="outline"
                className="font-mono text-[10px] bg-transparent text-muted-foreground"
              >
                {tech}
              </Badge>
            ))}
          </div>
        </div>
      </Link>
    </div>
  );
};

export default PortfolioCard;
