import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, Palette, Code, Rocket } from "lucide-react";
import { get } from "@/lib/api";

const ICON_MAP: Record<string, React.ElementType> = {
  Search, Palette, Code, Rocket,
};

interface Step {
  icon: string;
  title: string;
  description: string;
}

const DEFAULTS: { heading: string; subtitle: string; steps: Step[] } = {
  heading: "How We Work",
  subtitle: "",
  steps: [
    { icon: "Search", title: "Discovery", description: "Understanding your needs, goals, and vision for the project." },
    { icon: "Palette", title: "Design", description: "Crafting intuitive interfaces and user experiences." },
    { icon: "Code", title: "Build", description: "Developing with modern tech and iterating based on feedback." },
    { icon: "Rocket", title: "Launch", description: "Deploying your product and providing ongoing support." },
  ],
};

const ProcessSteps = () => {
  const [content, setContent] = useState(DEFAULTS);

  useEffect(() => {
    (async () => {
      const { data } = await get<{ sectionId: string; content: Record<string, unknown> }[]>("/api/content/sections");
      if (data) {
        const section = data.find((s) => s.sectionId === "process");
        if (section?.content) {
          const c = section.content as Partial<typeof DEFAULTS>;
          setContent({ ...DEFAULTS, ...c, steps: (c.steps?.length ? c.steps : DEFAULTS.steps) });
        }
      }
    })();
  }, []);

  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-14"
        >
          <span className="text-xs font-medium text-accent uppercase tracking-wider mb-3 block">
            Our Process
          </span>
          <h2 className="text-3xl md:text-4xl font-bold">
            {content.heading}
          </h2>
          {content.subtitle && (
            <p className="text-muted-foreground mt-3 max-w-xl">{content.subtitle}</p>
          )}
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {content.steps.map((step, index) => {
            const Icon = ICON_MAP[step.icon] || Code;
            const num = String(index + 1).padStart(2, "0");
            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.4 }}
                className="group relative p-6 border border-border rounded-xl bg-card hover:border-accent/30 transition-colors"
              >
                <span className="text-5xl font-bold text-border/60 group-hover:text-accent/20 transition-colors absolute top-4 right-5 select-none">
                  {num}
                </span>
                <div className="relative">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-accent" />
                  </div>
                  <h3 className="font-semibold mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default ProcessSteps;
