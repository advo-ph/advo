import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { get } from "@/lib/api";

interface HeroContent {
  headline: string;
  subtext: string;
  cta_primary_label: string;
  cta_primary_url: string;
  status_badge_text: string;
  status_badge_visible: boolean;
}

const DEFAULTS: HeroContent = {
  headline: "We build software that moves your business forward.",
  subtext: "Web apps, client portals, and digital systems — designed, built, and shipped by a small team that gives a damn.",
  cta_primary_label: "Start a Project",
  cta_primary_url: "/start",
  status_badge_text: "Accepting Clients",
  status_badge_visible: true,
};

const Hero = () => {
  const [content, setContent] = useState<HeroContent>(DEFAULTS);

  useEffect(() => {
    (async () => {
      const { data } = await get<{ sectionId: string; content: unknown }[]>("/api/content/sections");
      if (data) {
        const section = data.find((s) => s.sectionId === "hero");
        if (section?.content) {
          const c = section.content as Partial<HeroContent>;
          setContent({ ...DEFAULTS, ...c });
        }
      }
    })();
  }, []);

  return (
    <section className="relative h-dvh flex flex-col lg:flex-row lg:items-center overflow-hidden">

      <div className="relative z-10 max-w-7xl mx-auto px-6 w-full flex-1 flex flex-col lg:block min-h-0">
        <div className="flex flex-col lg:grid lg:grid-cols-12 gap-0 lg:gap-8 lg:items-center flex-1 min-h-0 h-full">

          {/* Text — takes 5 of 12 columns */}
          <div className="lg:col-span-5 pt-24 pb-8 lg:py-20">
            {/* Status badge */}
            {content.status_badge_visible && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4 }}
                className="inline-flex items-center gap-2.5 px-3.5 py-1.5 mb-8 border border-border rounded-full bg-card/50 backdrop-blur-sm"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  {content.status_badge_text}
                </span>
              </motion.div>
            )}

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08] mb-6"
            >
              {content.headline}
            </motion.h1>

            {/* Subtext */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-base md:text-lg text-muted-foreground max-w-md mb-10 leading-relaxed"
            >
              {content.subtext}
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-wrap items-center gap-4"
            >
              <Link
                to={content.cta_primary_url}
                className="inline-flex items-center gap-2 px-6 py-3 bg-foreground text-background rounded-full font-medium hover:bg-foreground/90 transition-colors btn-press group"
              >
                {content.cta_primary_label}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                to="/team"
                className="inline-flex items-center gap-2 px-6 py-3 border border-border rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
              >
                Meet the Team
              </Link>
            </motion.div>
          </div>

          {/* Photo — takes 7 of 12 columns, bleeds to edge */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="lg:col-span-7 hidden lg:flex justify-end"
          >
            <div className="relative w-full max-w-2xl">
              {/* Decorative accent bar */}
              <div className="absolute -left-6 top-1/2 -translate-y-1/2 w-1 h-24 bg-gradient-to-b from-accent via-accent/50 to-transparent rounded-full" />

              <div className="relative rounded-2xl overflow-hidden shadow-2xl">
                <img
                  src="/team/group.jpg"
                  alt="The ADVO team"
                  className="w-full h-auto object-cover"
                  style={{ aspectRatio: "4/3", objectPosition: "center 30%" }}
                  loading="eager"
                />
                {/* Overlay gradient for depth */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
              </div>

              {/* Floating stat card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.6 }}
                className="absolute -bottom-4 -left-4 bg-card border border-border rounded-xl px-5 py-3 shadow-lg"
              >
                <div className="text-2xl font-bold">6</div>
                <div className="text-xs text-muted-foreground">Team Members</div>
              </motion.div>
            </div>
          </motion.div>

          {/* Mobile: photo fills remaining viewport height */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="lg:hidden -mx-6 flex-1 min-h-0 overflow-hidden"
          >
            <img
              src="/team/group.jpg"
              alt="The ADVO team"
              className="w-full h-full object-cover object-[center_25%]"
              loading="eager"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
