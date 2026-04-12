import { useState, useEffect } from "react";
import {
  Code2,
  Smartphone,
  Cloud,
  ArrowRight,
  Loader2,
  Globe,
  Database,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { get } from "@/lib/api";
import { Section, SectionHeader } from "@/components/ui/section";

const ICON_MAP: Record<string, LucideIcon> = {
  Code2,
  Smartphone,
  Cloud,
  Globe,
  Database,
  Shield,
};

const FALLBACK_FEATURES: Record<string, string[]> = {
  "Web App Development": ["React / Next.js", "Node.js / Python", "PostgreSQL / MongoDB", "CI/CD Pipelines"],
  "Mobile Solutions": ["React Native", "iOS / Android", "Push Notifications", "Offline Support"],
  "Cloud Architecture": ["AWS / GCP / Azure", "Kubernetes", "Serverless", "DevOps"],
};

const DEFAULT_SERVICES = [
  { icon: "Code2", title: "Web App Development", description: "Full-stack applications built with modern frameworks. From MVP to enterprise scale." },
  { icon: "Smartphone", title: "Mobile Solutions", description: "Native and cross-platform mobile experiences that users love." },
  { icon: "Cloud", title: "Cloud Architecture", description: "Infrastructure that scales with your business. Secure, reliable, cost-optimized." },
];

interface ServiceItem {
  icon: string;
  title: string;
  description: string;
}

const ServiceTiers = () => {
  const [services, setServices] = useState<ServiceItem[]>(DEFAULT_SERVICES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await get<{ sectionId: string; content: unknown }[]>("/api/content/sections");
      if (data) {
        const section = data.find((s) => s.sectionId === "services");
        if (section?.content) {
          const content = section.content as { items?: ServiceItem[] };
          if (content.items && content.items.length > 0) {
            setServices(content.items);
          }
        }
      }
      setLoading(false);
    })();
  }, []);

  return (
    <Section divided>
      <SectionHeader
        number="03"
        eyebrow="Services"
        title="What We Build"
        subtitle="End-to-end software engineering with a focus on quality, speed, and user experience."
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {services.map((service) => {
            const Icon = ICON_MAP[service.icon] || Code2;
            const features = FALLBACK_FEATURES[service.title] || [];
            return (
              <div
                key={service.title}
                className="group flex flex-col p-6 border border-border rounded-xl bg-card hover:border-foreground/30 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center mb-6 group-hover:bg-foreground group-hover:text-background transition-colors">
                  <Icon className="h-4 w-4" />
                </div>

                <h3 className="text-lg font-medium mb-3">{service.title}</h3>
                <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                  {service.description}
                </p>

                {features.length > 0 && (
                  <ul className="space-y-2 mb-6">
                    {features.map((feature) => (
                      <li
                        key={feature}
                        className="text-xs font-mono text-muted-foreground/80 flex items-center gap-2"
                      >
                        <span className="w-1 h-1 bg-muted-foreground rounded-full" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                )}

                <button className="mt-auto inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors group/btn">
                  Learn more
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5 group-hover/btn:translate-x-0.5 transition-transform" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
};

export default ServiceTiers;
