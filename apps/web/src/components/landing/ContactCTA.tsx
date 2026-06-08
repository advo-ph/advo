import { useState, useEffect, useRef } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import { get } from "@/lib/api";
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
 * Organic blob gradient — warm orange palette blended via blur.
 * Blobs are oversized and overlap the section edges so there is no dark halo
 * along the top/bottom where the base shows through.
 */
const Blobs = () => (
  <>
    <div
      aria-hidden
      className="pointer-events-none absolute -top-[30%] -left-[20%] w-[110%] h-[130%] rounded-full blur-[120px] opacity-95 animate-blob-1 will-change-transform"
      style={{ background: "#E67A3A" }}
    />
    <div
      aria-hidden
      className="pointer-events-none absolute -top-[15%] -right-[20%] w-[90%] h-[120%] rounded-full blur-[140px] opacity-85 animate-blob-2 will-change-transform"
      style={{ background: "#C94820" }}
    />
    <div
      aria-hidden
      className="pointer-events-none absolute -bottom-[25%] left-[15%] w-[80%] h-[90%] rounded-full blur-[130px] opacity-80 animate-blob-3 will-change-transform"
      style={{ background: "#F59E5B" }}
    />
    <div
      aria-hidden
      className="pointer-events-none absolute top-[30%] left-[30%] w-[55%] h-[60%] rounded-full blur-[110px] opacity-70 animate-blob-4 will-change-transform"
      style={{ background: "#FFBA85" }}
    />
  </>
);

/**
 * Scroll-driven rising gradient.
 *
 * The blob layer translates up and fades in as the section travels through the
 * lower part of the viewport. Progress starts when the section's top reaches
 * ~85% down the viewport (near the bottom, but not pinned to the very edge) and
 * completes by the time it reaches the upper-middle (~38%).
 *
 * Uses the canonical `#root` scroll container (see lib/useRootScroll.ts): the
 * app scrolls inside `#root`, not the window, so `container` must point at it.
 */
const RisingGradient = ({
  root,
  sectionRef,
}: {
  root: HTMLElement;
  sectionRef: React.RefObject<HTMLElement>;
}) => {
  // Seed the container ref with the already-resolved root so useScroll attaches
  // on first render (the "#root gotcha" — see lib/useRootScroll.ts).
  const containerRef = useRef<HTMLElement>(root);
  containerRef.current = root;

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    container: containerRef,
    offset: ["start 0.85", "start 0.38"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [160, 0]);
  const opacity = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 will-change-transform"
      style={{ y, opacity }}
    >
      <Blobs />
    </motion.div>
  );
};

const ContactCTA = () => {
  const [content, setContent] = useState<ContactContent>(DEFAULTS);
  const sectionRef = useRef<HTMLElement>(null);
  const prefersReduced = useReducedMotion();

  // Resolve the #root scroll container once mounted. Gate the scroll-linked
  // layer on a non-null element to avoid useScroll's attach race.
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => setRoot(document.getElementById("root")), []);

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
      ref={sectionRef}
      className="relative z-40 py-48 lg:py-56 px-6 text-center overflow-hidden bg-[#6b2a12]"
    >
      {/* Warm gradient that rises into place as the section enters the lower
         viewport. Static fallback before #root resolves or when the user
         prefers reduced motion. */}
      {root && !prefersReduced ? (
        <RisingGradient root={root} sectionRef={sectionRef} />
      ) : (
        <Blobs />
      )}
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
