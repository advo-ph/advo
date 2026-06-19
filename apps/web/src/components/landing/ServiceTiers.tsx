import { useState, useEffect } from "react";
import {
  Code2,
  Smartphone,
  Cloud,
  ArrowRight,
  Loader2,
  Globe,
  Globe2,
  Database,
  Shield,
  LockKeyhole,
  LayoutDashboard,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { get } from "@/lib/api";
import { Section, SectionHeader } from "@/components/ui/section";
import { Reveal, RevealGroup } from "@/components/motion/Reveal";

const ICON_MAP: Record<string, LucideIcon> = {
  Code2,
  Smartphone,
  Cloud,
  Globe,
  Globe2,
  Database,
  Shield,
  LockKeyhole,
  LayoutDashboard,
  Wrench,
};

const FALLBACK_FEATURES: Record<string, string[]> = {
  Website: ["Landing", "SEO", "CMS", "Analytics"],
  "Client Hub": ["Login", "Timeline", "Invoices", "Files"],
  Admin: ["Leads", "Content", "Finance", "Team"],
  "Care Plan": ["Hosting", "Edits", "Monitor", "Growth"],
};

const DEFAULT_SERVICES = [
  { icon: "Globe2", title: "Website", description: "A conversion-focused public site with offer, proof, SEO structure, analytics, and a content system ready to grow." },
  { icon: "LockKeyhole", title: "Client Hub", description: "A logged-in space for project timelines, approvals, invoices, files, and the client-side delivery rhythm." },
  { icon: "LayoutDashboard", title: "Admin", description: "Internal controls for leads, content, clients, team capacity, finance, delivery, and launch operations." },
  { icon: "Wrench", title: "Care Plan", description: "Hosting, monitoring, small edits, support, experiments, and steady improvements after the first release ships." },
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
      <Reveal>
        <SectionHeader
          number="03"
          eyebrow="Product Surfaces"
          title="One system, not just a website."
          subtitle="We build the public front door and the private tools behind it: client login, admin controls, launch operations, and the care layer after shipping."
        />
      </Reveal>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <RevealGroup stagger={0.1} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {services.map((service) => {
            const Icon = ICON_MAP[service.icon] || Code2;
            const features = FALLBACK_FEATURES[service.title] || [];
            return (
              <Reveal
                as="div"
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
              </Reveal>
            );
          })}
        </RevealGroup>
      )}
    </Section>
  );
};

export default ServiceTiers;
