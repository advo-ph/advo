import { useState, useEffect } from "react";
import { Globe, TrendingUp, Clock, Users } from "lucide-react";
import { get } from "@/lib/api";
import { Section, SectionHeader } from "@/components/ui/section";
import { Reveal, RevealGroup } from "@/components/motion/Reveal";
import CornerBrackets from "@/components/motion/CornerBrackets";

const ICON_MAP: Record<string, React.ElementType> = {
  Globe,
  TrendingUp,
  Clock,
  Users,
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
          setContent({ ...DEFAULTS, ...c, benefits: c.benefits?.length ? c.benefits : DEFAULTS.benefits });
        }
      }
    })();
  }, []);

  return (
    <Section divided>
      <Reveal>
        <SectionHeader
          number="01"
          eyebrow="Why Go Digital"
          title={content.heading}
          subtitle={content.subtitle || undefined}
        />
      </Reveal>

      <RevealGroup
        stagger={0.08}
        className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border border border-border rounded-xl overflow-hidden relative"
      >
        <CornerBrackets />
        {content.benefits.map((benefit) => {
          const Icon = ICON_MAP[benefit.icon] || Globe;
          return (
            <Reveal
              as="div"
              key={benefit.title}
              className="group flex gap-4 p-6 bg-background hover:bg-card transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0 group-hover:bg-foreground group-hover:text-background transition-colors">
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-medium mb-1.5">{benefit.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {benefit.description}
                </p>
              </div>
            </Reveal>
          );
        })}
      </RevealGroup>
    </Section>
  );
};

export default WhyDigital;
