import { useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowDown } from "lucide-react";
import { Link } from "react-router-dom";
import { get } from "@/lib/api";
import { EASE, fadeUp, staggerParent } from "@/lib/motion";

interface HeroContent {
  headline: string;
  subtext: string;
  cta_primary_label: string;
  cta_primary_url: string;
  status_badge_text: string;
  status_badge_visible: boolean;
}

const DEFAULTS: HeroContent = {
  headline: "We digitalize for you.",
  subtext:
    "Business websites, operations, and digital systems. Designed, built, and shipped by a small team that gives a damn.",
  cta_primary_label: "Start a Project",
  cta_primary_url: "/start",
  status_badge_text: "Accepting Clients",
  status_badge_visible: true,
};

const STATS = [
  { value: "6", label: "Engineers" },
  { value: "12+", label: "Shipped" },
  { value: "2yr", label: "Building" },
];

const Hero = () => {
  const [content, setContent] = useState<HeroContent>(DEFAULTS);
  const reduced = useReducedMotion();

  useEffect(() => {
    (async () => {
      const { data } = await get<{ sectionId: string; content: unknown }[]>(
        "/api/content/sections",
      );
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
    <section className="relative overflow-hidden border-b border-border bg-background md:min-h-svh md:flex md:flex-col md:justify-end">
      {/* Team photo: full image on phones, full-bleed crop on larger screens */}
      <div className="relative md:absolute md:inset-0">
        <img
          src="/team/group.jpg"
          alt="The ADVO team"
          className="block h-auto w-full md:h-full md:object-cover"
          style={{ objectPosition: "center 35%" }}
          loading="eager"
        />
        {/* Overall darkening for contrast */}
        <div className="absolute inset-0 bg-black/40 md:bg-black/45" />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/45 to-transparent md:hidden" />
        {/* Vertical gradient: heavier at the bottom where text sits */}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-background via-background/70 to-transparent md:h-3/4 md:via-background/75" />
      </div>

      {/* Content overlay */}
      <div className="relative w-full max-w-6xl mx-auto px-6 pb-14 pt-8 md:pb-16 md:pt-32 lg:pb-24">
        <motion.div
          variants={staggerParent(0.1, 0.15)}
          initial={reduced ? false : "hidden"}
          animate="show"
          className="max-w-2xl"
        >
          <motion.h1
            variants={fadeUp}
            transition={{ duration: 0.6, ease: EASE }}
            className="text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.02] mb-8 text-balance [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]"
          >
            {content.headline}
          </motion.h1>

          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.5, ease: EASE }}
            className="text-lg text-foreground/80 max-w-xl mb-10 leading-relaxed [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]"
          >
            {content.subtext}
          </motion.p>

          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5, ease: EASE }}
            className="flex flex-wrap items-center gap-3 mb-12"
          >
            <Link
              to={content.cta_primary_url}
              className="group inline-flex items-center gap-2 px-5 py-3 bg-foreground text-background rounded-full text-sm font-medium hover:bg-foreground/90 btn-press"
            >
              {content.cta_primary_label}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              to="/team"
              className="inline-flex items-center px-5 py-3 border border-border rounded-full text-sm text-foreground/90 hover:text-foreground bg-card/40 hover:bg-card/60 transition-colors"
            >
              Meet the Team
            </Link>
          </motion.div>

          {/* Stats */}
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5, ease: EASE }}
            className="grid grid-cols-3 gap-6 max-w-md pt-8 border-t border-border/60"
          >
            {STATS.map((stat) => (
              <div key={stat.label}>
                <div className="text-xl sm:text-2xl font-semibold tracking-tight mb-1">
                  {stat.value}
                </div>
                <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-foreground/60">
                  {stat.label}
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>

      {/* Scroll cue */}
      <div className="hidden lg:flex absolute bottom-8 right-8 flex-col items-center gap-2 text-foreground/50">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em]">
          Scroll
        </span>
        <ArrowDown className="w-3 h-3 animate-bounce" />
      </div>
    </section>
  );
};

export default Hero;
