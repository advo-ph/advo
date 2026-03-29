import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Globe, TrendingUp, Clock, Users } from "lucide-react";
import { get } from "@/lib/api";

const ICON_MAP: Record<string, React.ElementType> = {
  Globe, TrendingUp, Clock, Users,
};

interface Benefit {
  icon: string;
  title: string;
  description: string;
}

const DEFAULTS: { heading: string; subtitle: string; benefits: Benefit[] } = {
  heading: "Invest in Your Digital Future",
  subtitle: "",
  benefits: [
    { icon: "Globe", title: "24/7 Online Presence", description: "Your business never sleeps. Reach customers anytime, anywhere in the world." },
    { icon: "TrendingUp", title: "Scale Effortlessly", description: "Digital systems grow with your business without the overhead of traditional expansion." },
    { icon: "Clock", title: "Save Time & Resources", description: "Automate repetitive tasks and focus on what matters — growing your business." },
    { icon: "Users", title: "Better Customer Experience", description: "Modern interfaces that your customers expect and love to use." },
  ],
};

const WhyDigital = () => {
  const [content, setContent] = useState(DEFAULTS);

  useEffect(() => {
    (async () => {
      const { data } = await get<{ sectionId: string; content: Record<string, unknown> }[]>("/api/content/sections");
      if (data) {
        const section = data.find((s) => s.sectionId === "why_digital");
        if (section?.content) {
          const c = section.content as Partial<typeof DEFAULTS>;
          setContent({ ...DEFAULTS, ...c, benefits: (c.benefits?.length ? c.benefits : DEFAULTS.benefits) });
        }
      }
    })();
  }, []);

  return (
    <section className="py-24 px-6 bg-secondary/30">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-14"
        >
          <span className="text-xs font-medium text-accent uppercase tracking-wider mb-3 block">
            Why Go Digital
          </span>
          <h2 className="text-3xl md:text-4xl font-bold">
            {content.heading}
          </h2>
          {content.subtitle && (
            <p className="text-muted-foreground mt-3 max-w-xl">{content.subtitle}</p>
          )}
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {content.benefits.map((benefit, index) => {
            const Icon = ICON_MAP[benefit.icon] || Globe;
            return (
              <motion.div
                key={benefit.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08, duration: 0.4 }}
                className="group flex gap-4 p-5 rounded-xl hover:bg-card transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 group-hover:bg-accent/15 transition-colors">
                  <Icon className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{benefit.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{benefit.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default WhyDigital;
