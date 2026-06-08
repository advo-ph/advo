import { useState, useEffect } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { get } from "@/lib/api";
import { EASE } from "@/lib/motion";
import { Reveal, RevealGroup } from "@/components/motion/Reveal";

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

/**
 * Warm radial gradient whose RADIUS is driven by the `--cta-grad-r` CSS custom
 * property. Bright #FFBA85 core fades through warm oranges into the section's
 * dark base #6b2a12 at 100% of the radius — so anything past the radius is pure
 * base, blending seamlessly with no hard edge.
 */
const RADIAL =
  "radial-gradient(circle var(--cta-grad-r) at 50% 58%, #FFBA85 0%, #F59E5B 18%, #E67A3A 38%, #C94820 60%, #6b2a12 100%)";

const GRAD_R_START = "760px";
const GRAD_R_END = "1500px";

/**
 * RisingGradient — a one-time, on-view reveal: the radial gradient's circle
 * literally grows by animating its radius variable from a tight bright core
 * (40px) to a section-filling 1400px the first time it enters the viewport.
 * Runs once (not scroll-linked). Reduced motion → static gradient at full
 * radius, no animation.
 */
const RisingGradient = () => {
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={
          { background: RADIAL, "--cta-grad-r": GRAD_R_END } as React.CSSProperties
        }
      />
    );
  }

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={
        { background: RADIAL, "--cta-grad-r": GRAD_R_START } as React.CSSProperties
      }
      initial={{ "--cta-grad-r": GRAD_R_START }}
      whileInView={{ "--cta-grad-r": GRAD_R_END }}
      viewport={{ once: true, amount: 0.55, margin: "0px 0px -160px 0px" }}
      transition={{ duration: 2.6, ease: EASE }}
    />
  );
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
    <section className="relative z-40 py-48 lg:py-56 px-6 text-center overflow-hidden bg-[#6b2a12]">
      {/* Warm radial gradient that rises + scales up once, on view. */}
      <RisingGradient />
      {/* Grain texture via inline SVG noise — adds that organic, non-uniform quality */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      <RevealGroup stagger={0.09} className="relative max-w-4xl mx-auto">
        <Reveal as="span" className="text-xs font-medium text-background/80 uppercase tracking-[0.18em] mb-6 block">
          Let's Build
        </Reveal>

        <Reveal as="h2" className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-semibold tracking-tight leading-[1.0] mb-8 text-balance text-background">
          {content.heading}
        </Reveal>

        <Reveal as="p" className="text-background/85 mb-14 max-w-lg mx-auto leading-relaxed text-lg">
          {content.subtext}
        </Reveal>

        <Reveal as="div" className="flex flex-wrap items-center justify-center gap-3 mb-10">
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
        </Reveal>

        <Reveal as="p" className="text-[11px] font-mono uppercase tracking-[0.2em] text-background/75">
          Reply within 24h · Free consultation
        </Reveal>
      </RevealGroup>
    </section>
  );
};

export default ContactCTA;
