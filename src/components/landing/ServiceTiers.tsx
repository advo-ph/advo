import { useState, useEffect } from "react";
import { motion } from "framer-motion";
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
import { supabase } from "@/integrations/supabase/client";

/* ─── Icon map ───────────────────────────────────────────── */

const ICON_MAP: Record<string, LucideIcon> = {
  Code2,
  Smartphone,
  Cloud,
  Globe,
  Database,
  Shield,
};

/* ─── Fallback features (not yet in JSONB) ───────────────── */

const FALLBACK_FEATURES: Record<string, string[]> = {
  "Web App Development": ["React / Next.js", "Node.js / Python", "PostgreSQL / MongoDB", "CI/CD Pipelines"],
  "Mobile Solutions": ["React Native", "iOS / Android", "Push Notifications", "Offline Support"],
  "Cloud Architecture": ["AWS / GCP / Azure", "Kubernetes", "Serverless", "DevOps"],
};

/* ─── Default services if site_content is empty ──────────── */

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
    const fetchServices = async () => {
      const { data } = await supabase
        .from("site_content")
        .select("content")
        .eq("section_id", "services")
        .single();

      if (data?.content) {
        const content = data.content as { items?: ServiceItem[] };
        if (content.items && content.items.length > 0) {
          setServices(content.items);
        }
      }

      setLoading(false);
    };

    fetchServices();
  }, []);

  return (
    <section id="services" className="py-24 px-6 bg-card">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16"
        >
          <span className="text-xs font-medium text-accent uppercase tracking-wider mb-2 block">Services</span>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">What We Build</h2>
          <p className="text-muted-foreground max-w-2xl">End-to-end software engineering with a focus on quality, speed, and user experience.</p>
        </motion.div>

        {/* Service Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {services.map((service, index) => {
              const IconComponent = ICON_MAP[service.icon] || Code2;
              const features = FALLBACK_FEATURES[service.title] || [];

              return (
                <motion.div
                  key={service.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1, duration: 0.5, type: "spring", damping: 20 }}
                  className="group p-6 bg-background border border-border rounded-xl shadow-card hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
                >
                  {/* Icon */}
                  <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center mb-6 group-hover:bg-accent/10 transition-colors">
                    <IconComponent className="h-6 w-6 text-accent" />
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-semibold mb-3">{service.title}</h3>
                  <p className="text-sm text-muted-foreground mb-6">{service.description}</p>

                  {/* Features */}
                  {features.length > 0 && (
                    <ul className="space-y-2 mb-6">
                      {features.map((feature) => (
                        <li key={feature} className="text-sm font-mono text-muted-foreground flex items-center gap-2">
                          <span className="w-1 h-1 bg-accent rounded-full" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* CTA */}
                  <button className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group/btn">
                    Learn more
                    <ArrowRight className="ml-2 h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default ServiceTiers;
