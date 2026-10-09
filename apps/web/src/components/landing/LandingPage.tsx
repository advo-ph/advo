import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionStyle,
} from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { usePortfolio } from "@/hooks/usePortfolio";
import LandingNav from "@/components/LandingNav";
import LandingScrollbar from "@/components/LandingScrollbar";
import { Reveal, RevealGroup } from "@/components/motion/Reveal";
import { EASE } from "@/lib/motion";
import WorkShowcase from "./WorkShowcase";
import ProjectInquiry from "./ProjectInquiry";
import LandingFooter from "./landing-footer";
import FlowingBackground from "./FlowingBackground";
import ServicesScroll from "./ServicesScroll";
import { instrumentLanding } from "@/lib/track";
import "./landing-page.css";

/**
 * What ADVO builds, by industry, each with the products we actually sell into it.
 * Prince, 09-03: this reads to a restaurant or a clinic owner as "yes, they have
 * built the thing I need", where "Strategy / Design / Development" never does.
 */
interface Offer {
  name: string;
  copy: string;
}
interface Industry {
  key: string;
  image: string;
  title: string;
  heading: string;
  copy: string;
  offer: Offer[];
  href?: string;
}
const industry: Industry[] = [
  {
    key: "flood",
    image: "/landing/industry/flood.webp",
    title: "Flood",
    heading: "Know flooded roads in real-time",
    copy: "Navigational map of real-time flooded roads",
    offer: [
      {
        name: "Live flood depth measurements",
        copy: "Flood monitoring devices in flood-prone streets, PAGASA river gauges, live rainfall data, and UP NOAH hazard maps.",
      },
      {
        name: "Navigation avoids flooded areas",
        copy: "The app gives directions to safer routes to avoid flooded roads.",
      },
      { name: "Shared operational view", copy: "Provide LGUs live data for faster coordination and rescues." },
    ],
    href: "https://floodpass.com",
  },
  {
    key: "education",
    image: "/landing/industry/education.webp",
    title: "School",
    heading: "A safer, more connected campus.",
    copy: "Campus access, safety, and school operations in one system.",
    offer: [
      { name: "ID authentication", copy: "Student IDs tap in at gates, integrated with attendance monitoring." },
      { name: "Safety and Security", copy: "Turnstile tap ID entrance and exit with industry-grade baggage scanning." },
      { name: "Dedicated website and app", copy: "A dedicated website and app for the institution and its students." },
    ],
  },
  {
    key: "parking",
    image: "/landing/industry/parking.webp",
    title: "Parking",
    heading: "A convenient parking experience.",
    copy: "A fully automated car park for drivers, managers, and owners.",
    offer: [
      {
        name: "Ticketless system",
        copy: "Entrance and exit automatically open by scanning the license plate.",
      },
      { name: "Self-service payment", copy: "Pay at the kiosk, or scan the QR to pay using your phone" },
      { name: "Find my car", copy: "Locate your parking spot through the app" },
    ],
    href: "https://park.advo.ph",
  },
  {
    key: "medical",
    image: "/landing/industry/medical.webp",
    title: "Medical",
    heading: "Connected care for clinics, labs, and pharmacies.",
    copy: "Clinic management system with EMR for appointments, queueing, billing, inventory, and integration.",
    offer: [
      { name: "Clinic operations", copy: "Manage appointments, queueing, billing, and stock." },
      { name: "Electronic medical records", copy: "Give doctors EMR tools for patient records." },
      { name: "Hospital integration", copy: "Connect care systems without relying on fax machines." },
    ],
  },
];

interface IndustryTab {
  title: string;
  heading: string;
  copy: string;
  still: string;
  offer?: Offer[];
  href?: string;
}

const industryTab: IndustryTab[] = [
  {
    title: "Food",
    heading: "Restaurants, cafes, and food stalls",
    copy: "QR code ordering from the table, kiosk ordering with payment, and table management for seating, waitlists, and turn times.",
    still: "/landing/industry/food.webp",
  },
  {
    title: "Medical",
    heading: "Clinics, labs, and pharmacies",
    copy: "Clinic management system with EMR for appointments, queueing, billing, inventory, and integration.",
    still: "/landing/industry/medical.webp",
  },
  {
    // Construction still is a stand-in until a real photo lands in
    // apps/web/public/landing/industry/construction.jpg
    title: "Construction",
    heading: "Contractors and developers",
    copy: "Site progress and manpower tracking, delivery coordination, and progress billing in one system.",
    still: "/landing/hero-building.webp",
  },
  {
    title: "Business",
    heading: "Offices, retail, and services",
    copy: "Inventory and point of sale; scheduling and customer records; fleet tracking, dispatch, and proof of delivery.",
    still: "/landing/industry/business.webp",
  },
];

const solutionExplorerItems: IndustryTab[] = industry.map((item) => ({
  title: item.title,
  heading: item.heading,
  copy: item.copy,
  still: item.image,
  offer: item.offer,
  href: item.href,
}));

interface IndustryExplorerProps {
  items: IndustryTab[];
  activeIndex: number;
  onSelect: (index: number) => void;
  idPrefix: string;
  tablistLabel: string;
  orientation: "horizontal" | "vertical";
  reduceMotion: boolean | null;
}

const IndustryExplorer = ({
  items,
  activeIndex,
  onSelect,
  idPrefix,
  tablistLabel,
  orientation,
  reduceMotion,
}: IndustryExplorerProps) => {
  const current = items[activeIndex] ?? items[0];
  if (!current) return null;

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const backwards = orientation === "horizontal" ? event.key === "ArrowLeft" : event.key === "ArrowUp";
    const forwards = orientation === "horizontal" ? event.key === "ArrowRight" : event.key === "ArrowDown";
    let nextIndex: number | null = null;

    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;
    else if (backwards) nextIndex = (activeIndex - 1 + items.length) % items.length;
    else if (forwards) nextIndex = (activeIndex + 1) % items.length;

    if (nextIndex === null) return;

    event.preventDefault();
    onSelect(nextIndex);
    document.getElementById(`${idPrefix}-tab-${nextIndex}`)?.focus();
  };

  return (
    <Reveal className="landing-process-card" delay={0.1}>
      <div
        className="landing-process-tab"
        role="tablist"
        aria-orientation={orientation}
        aria-label={tablistLabel}
        onKeyDown={handleTabKeyDown}
      >
        {items.map((item, index) => (
          <button
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${index}`}
            aria-controls={`${idPrefix}-panel`}
            aria-selected={index === activeIndex}
            tabIndex={index === activeIndex ? 0 : -1}
            key={item.title}
            className={index === activeIndex ? "is-active" : ""}
            onClick={() => onSelect(index)}
          >
            {item.title}
          </button>
        ))}
      </div>

      <div
        className="landing-process-panel"
        id={`${idPrefix}-panel`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${activeIndex}`}
        tabIndex={0}
      >
        <div className="landing-still landing-process-still">
          <AnimatePresence initial={false}>
            <motion.img
              key={current.still + current.title}
              src={current.still}
              alt=""
              loading="lazy"
              decoding="async"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.45, ease: EASE }}
            />
          </AnimatePresence>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current.title}
            className="landing-process-copy"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: reduceMotion ? 0 : 0.28, ease: EASE }}
          >
            <h3>{current.heading}</h3>
            <p>{current.copy}</p>
            {current.offer?.length ? (
              <ul className="landing-industry-offer">
                {current.offer.map((offer) => (
                  <li key={offer.name}>
                    <span className="landing-industry-offer-name">{offer.name}</span>
                    <span className="landing-industry-offer-copy">{offer.copy}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {current.href ? (
              <div className="landing-industry-actions">
                <a
                  className="landing-industry-more"
                  href={current.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>See more</span>
                  <ArrowUpRight size={17} strokeWidth={1.5} aria-hidden="true" />
                </a>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </Reveal>
  );
};

const marqueeLogos = [
  { src: "/landing/logo/vbe-eye-center.png", alt: "VBE Eye Center", scale: 1.2, width: 315, height: 155 },
  { src: "/landing/logo/fourlinq.png", alt: "FourlinQ", scale: 1, width: 423, height: 141 },
  {
    src: "/landing/logo/philippine-college-endocrinology.webp",
    alt: "Philippine College of Endocrinology, Diabetes and Metabolism",
    scale: 1.55,
    width: 720,
    height: 720,
  },
  { src: "/landing/logo/nokoji.webp", alt: "Nokoji Matcha and Doughnuts", scale: 1.08, width: 720, height: 720 },
  { src: "/landing/logo/felici.webp", alt: "Felici Artisan Gelato", scale: 1.55, width: 720, height: 720 },
  { src: "/landing/logo/felici-italian-cafe.webp", alt: "Felici Italian Café", scale: 1.18, width: 720, height: 720 },
] as const;

/** Scroll distance (px) over which the phone hero settles into its card. Matches --landing-strip-height. */
const HERO_SETTLE = 120;

const heroCopy = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

type NetworkInformation = EventTarget & {
  effectiveType?: string;
  saveData?: boolean;
};

const prefersReducedData = () => {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  return connection?.saveData === true || ["slow-2g", "2g"].includes(connection?.effectiveType ?? "");
};

const LandingPage = () => {
  const reduceMotion = useReducedMotion();
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 680px)").matches,
  );
  const [isCompactViewport, setIsCompactViewport] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches,
  );
  const [tabIndex, setTabIndex] = useState(0);
  const [solutionTabIndex, setSolutionTabIndex] = useState(0);
  const [playingHeroVideoKey, setPlayingHeroVideoKey] = useState<string | null>(null);
  const [reduceData, setReduceData] = useState(prefersReducedData);
  const heroRef = useRef<HTMLDivElement>(null);
  const heroVideoRef = useRef<HTMLVideoElement>(null);
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 680px)");
    const handleChange = () => setIsMobileViewport(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const handleChange = () => setIsCompactViewport(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (!connection) return;

    const updateDataPreference = () => setReduceData(prefersReducedData());
    connection.addEventListener("change", updateDataPreference);
    return () => connection.removeEventListener("change", updateDataPreference);
  }, []);

  // Section attention + scroll-depth milestones. A no-op until the visitor grants
  // consent, and detaches again on withdrawal — see apps/web/src/lib/track.ts.
  useEffect(() => {
    if (!pageRef.current) return;
    return instrumentLanding(pageRef.current);
  }, []);

  // The marquee is a fixed set of supplied partner marks. Portfolio rows still
  // drive the projects section below.
  const { project: shippedProject } = usePortfolio();

  // The hero still drifts a little slower than the page. Small on purpose: the
  // photo is the point, the motion only keeps it from reading as a poster.
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  // Phones anchor the video to its bottom edge, so the drift stays off there.
  const heroShift = useTransform(scrollYProgress, [0, 1], ["0%", reduceMotion || isMobileViewport ? "0%" : "14%"]);
  // Phones open on a full-bleed hero. The first HERO_SETTLE px of scroll pull it in
  // to the guttered, rounded card; the CSS reads the 0 → 1 progress from --hero-settle.
  const { scrollY } = useScroll();
  const heroSettle = useTransform(scrollY, [0, HERO_SETTLE], [0, 1], { clamp: true });
  const smoothHeroSettle = useSpring(heroSettle, { stiffness: 140, damping: 30, mass: 0.8 });
  const heroVideoKey = `${isMobileViewport ? "mobile" : "desktop"}-${reduceData ? "poster" : "autoplay"}`;
  const heroPoster = isMobileViewport ? "/landing/hero-building-mobile.webp" : "/landing/hero-building.webp";

  // Keep the hero video muted and inline so browsers can autoplay it. Attempt
  // playback immediately and retry once media data is ready; the poster stays
  // visible while loading or if the browser blocks autoplay, with no controls.
  useEffect(() => {
    const video = heroVideoRef.current;
    if (!video) return;
    if (reduceData) {
      video.pause();
      video.load();
      return;
    }

    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;

    const startPlayback = () => {
      void video.play().catch(() => {
        // Keep the poster in place if autoplay is blocked; there are no controls.
      });
    };

    video.addEventListener("canplay", startPlayback);
    startPlayback();
    return () => video.removeEventListener("canplay", startPlayback);
  }, [isMobileViewport, reduceData]);

  return (
    <main className={reduceMotion ? "landing-page is-reduce-motion" : "landing-page"} ref={pageRef}>
      <FlowingBackground />
      <LandingNav overlayHero={isMobileViewport} />
      <LandingScrollbar />

      <section className="landing-hero" id="top">
        <motion.div
          className="landing-hero-frame"
          ref={heroRef}
          style={isMobileViewport ? ({ "--hero-settle": smoothHeroSettle } as unknown as MotionStyle) : undefined}
        >
          <motion.div
            className="landing-hero-media"
            style={{ y: heroShift }}
            initial={reduceMotion ? false : { scale: 1.06 }}
            animate={{ scale: 1 }}
            transition={{ duration: 1.8, ease: EASE }}
          >
            <video
              ref={heroVideoRef}
              key={heroVideoKey}
              className="landing-hero-video"
              src={reduceData ? undefined : isMobileViewport ? "/landing/hero-building-mobile.mp4" : "/landing/hero-building.mp4"}
              poster={heroPoster}
              autoPlay={!reduceData}
              muted
              loop
              playsInline
              controls={false}
              preload={reduceData ? "none" : "auto"}
              aria-hidden="true"
              onPlaying={() => setPlayingHeroVideoKey(heroVideoKey)}
              onPause={() => setPlayingHeroVideoKey((activeKey) => (activeKey === heroVideoKey ? null : activeKey))}
              onWaiting={() => setPlayingHeroVideoKey((activeKey) => (activeKey === heroVideoKey ? null : activeKey))}
              onError={() => setPlayingHeroVideoKey((activeKey) => (activeKey === heroVideoKey ? null : activeKey))}
            />
            {/* iOS can paint a native play control even with controls disabled. Keep the still above it until video frames are playing. */}
            {(!reduceData && playingHeroVideoKey === heroVideoKey) ? null : (
              <img
                className="landing-hero-poster"
                src={heroPoster}
                alt=""
                aria-hidden="true"
                loading="eager"
                fetchPriority="high"
              />
            )}
          </motion.div>
          <div className="landing-hero-shade" />
          <motion.div
            className="landing-hero-copy"
            initial={reduceMotion ? false : "hidden"}
            animate="show"
            transition={{ staggerChildren: 0.1, delayChildren: 0.25 }}
          >
            <motion.h1 variants={heroCopy} transition={{ duration: 0.7, ease: EASE }}>
              We digitalize it for you.
            </motion.h1>
            <motion.p variants={heroCopy} transition={{ duration: 0.7, ease: EASE }}>
              Our vision is to build the technological infrastructure for industries across the Philippines.
            </motion.p>
          </motion.div>
        </motion.div>
      </section>

      <section className="landing-marquee" aria-label="Businesses running on ADVO">
        <div className="landing-marquee-mask">
          <div className="landing-marquee-track">
            {[0, 1].map((groupIndex) => (
              <div
                className="landing-marquee-group"
                key={groupIndex}
                aria-hidden={groupIndex === 1 ? true : undefined}
              >
                {marqueeLogos.map((logo) => (
                  <span className="landing-marquee-item" key={logo.src}>
                    <img
                      src={logo.src}
                      alt={groupIndex === 0 ? logo.alt : ""}
                      width={logo.width}
                      height={logo.height}
                      style={{ "--landing-logo-scale": logo.scale } as CSSProperties}
                      decoding="async"
                    />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className="landing-piece"
        id="solutions"
        aria-labelledby="solutions-heading"
      >
        <img
          className="landing-solutions-logo"
          src="/landing/advo-logo-lockup.png"
          alt="ADVO Technologies"
          width={886}
          height={310}
        />
        <Reveal as="h2" id="solutions-heading" className="landing-display landing-solutions-title">
          Building Real-World Technological Solutions
        </Reveal>

        {isMobileViewport ? (
          <div className="landing-mobile-industry-explorer">
            <IndustryExplorer
              items={solutionExplorerItems}
              activeIndex={solutionTabIndex}
              onSelect={setSolutionTabIndex}
              idPrefix="solutions-industry"
              tablistLabel="Choose a solution"
              orientation="horizontal"
              reduceMotion={reduceMotion}
            />
          </div>
        ) : (
          <RevealGroup className="landing-industry-grid" stagger={0.08}>
            {industry.map((item) => (
              <Reveal as="article" className="landing-industry-card" key={item.key}>
                <p className="landing-industry-label">{item.title}</p>
                <div className="landing-industry-media">
                  <img
                    src={item.image}
                    alt={`${item.title} — an ADVO solution`}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="landing-industry-content">
                  <h3>{item.heading}</h3>
                  <p className="landing-industry-copy">{item.copy}</p>
                  <ul className="landing-industry-offer">
                    {item.offer.map((o) => (
                      <li key={o.name}>
                        <span className="landing-industry-offer-name">{o.name}</span>
                        <span className="landing-industry-offer-copy">{o.copy}</span>
                      </li>
                    ))}
                  </ul>
                  {item.href ? (
                    <div className="landing-industry-actions">
                      <a
                        className="landing-industry-more"
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <span>See more</span>
                        <ArrowUpRight size={17} strokeWidth={1.5} aria-hidden="true" />
                      </a>
                    </div>
                  ) : null}
                </div>
              </Reveal>
            ))}
          </RevealGroup>
        )}
      </section>

      <ServicesScroll />

      {!isMobileViewport ? (
        <section className="landing-process" id="process">
          <Reveal as="h2" className="landing-process-title">Industries we modernize</Reveal>
          <IndustryExplorer
            items={industryTab}
            activeIndex={tabIndex}
            onSelect={setTabIndex}
            idPrefix="process-industry"
            tablistLabel="Industries we modernize"
            orientation={isCompactViewport ? "horizontal" : "vertical"}
            reduceMotion={reduceMotion}
          />
        </section>
      ) : null}
      {shippedProject.length > 0 ? <WorkShowcase project={shippedProject} /> : null}
      <ProjectInquiry embedded />
      <LandingFooter />
    </main>
  );
};

export default LandingPage;
