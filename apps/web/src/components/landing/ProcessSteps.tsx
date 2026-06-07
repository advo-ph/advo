import { useState, useEffect } from "react";
import { Search, Palette, Code, Rocket } from "lucide-react";
import { get } from "@/lib/api";
import { Section, SectionHeader } from "@/components/ui/section";
import { Reveal, RevealGroup } from "@/components/motion/Reveal";
import CornerBrackets from "@/components/motion/CornerBrackets";

const ICON_MAP: Record<string, React.ElementType> = {
  Search,
  Palette,
  Code,
  Rocket,
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
          setContent({ ...DEFAULTS, ...c, steps: c.steps?.length ? c.steps : DEFAULTS.steps });
        }
      }
    })();
  }, []);

  return (
    <Section divided>
      <Reveal>
        <SectionHeader
          number="02"
          eyebrow="Our Process"
          title={content.heading}
          subtitle={content.subtitle || undefined}
        />
      </Reveal>

      <RevealGroup stagger={0.12} className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <CornerBrackets />
        {content.steps.map((step, index) => {
          const Icon = ICON_MAP[step.icon] || Code;
          const num = String(index + 1).padStart(2, "0");
          return (
            <Reveal
              as="div"
              key={step.title}
              className="group relative p-6 border border-border rounded-xl bg-card hover:border-foreground/30 transition-colors"
            >
              <span className="absolute top-5 right-5 text-xs font-mono text-muted-foreground/50 tracking-wider">
                {num}
              </span>
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center mb-6 group-hover:bg-foreground group-hover:text-background transition-colors">
                <Icon className="w-4 h-4" />
              </div>
              <h3 className="font-medium mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {step.description}
              </p>
            </Reveal>
          );
        })}
      </RevealGroup>
    </Section>
  );
};

export default ProcessSteps;
