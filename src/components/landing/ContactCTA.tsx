import { useState, useEffect } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { get } from "@/lib/api";

interface ContactContent {
  heading: string;
  subtext: string;
  cta_label: string;
  cta_url: string;
}

const DEFAULTS: ContactContent = {
  heading: "Ready to digitalize?",
  subtext: "Prepare your business for the future. Let's work together.",
  cta_label: "Start a Project",
  cta_url: "/start",
};

const ContactCTA = () => {
  const [content, setContent] = useState<ContactContent>(DEFAULTS);

  useEffect(() => {
    (async () => {
      const { data } = await get<{ sectionId: string; content: unknown }[]>(
        "/api/content/sections",
      );
      if (data) {
        const section = data.find((s) => s.sectionId === "contact");
        if (section?.content) {
          const c = section.content as Partial<ContactContent>;
          setContent({ ...DEFAULTS, ...c });
        }
      }
    })();
  }, []);

  return (
    <section
      className="relative py-32 px-6 text-center overflow-hidden"
      style={{ backgroundColor: "hsl(16 92% 60%)" }}
    >
      <div className="max-w-4xl mx-auto">
        <span className="text-xs font-medium text-background/80 uppercase tracking-[0.18em] mb-6 block">
          Let's Build
        </span>

        <h2 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-semibold tracking-tight leading-[1.0] mb-8 text-balance text-background">
          {content.heading}
        </h2>

        <p className="text-background/85 mb-14 max-w-lg mx-auto leading-relaxed text-lg">
          {content.subtext}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
          <Link
            to={content.cta_url}
            className="group inline-flex items-center gap-2.5 px-8 py-4 bg-background text-foreground rounded-full text-base font-medium hover:bg-background/90 btn-press shadow-[0_12px_40px_-8px_rgba(0,0,0,0.4)]"
          >
            {content.cta_label}
            <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <a
            href="mailto:contact@advo.ph"
            className="inline-flex items-center gap-2 px-7 py-4 border border-background/40 rounded-full text-base text-background hover:bg-background/10 hover:border-background/70 transition-colors"
          >
            <Mail className="w-4 h-4" />
            contact@advo.ph
          </a>
        </div>

        <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-background/75">
          No sales calls · Reply within 24h · Free consultation
        </p>
      </div>
    </section>
  );
};

export default ContactCTA;
