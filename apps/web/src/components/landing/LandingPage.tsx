import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { usePortfolio } from "@/hooks/usePortfolio";
import LandingNav from "@/components/LandingNav";
import LandingScrollbar from "@/components/LandingScrollbar";
import { Reveal, RevealGroup } from "@/components/motion/Reveal";
import { EASE } from "@/lib/motion";
import WorkShowcase from "./WorkShowcase";
import LandingTeam from "./LandingTeam";
import ProjectInquiry from "./ProjectInquiry";
import LandingFooter from "./landing-footer";
import FlowingBackground from "./FlowingBackground";
import ServicesScroll from "./ServicesScroll";
import SolutionExplorer from "./SolutionExplorer";
import { instrumentLanding } from "@/lib/track";
import {
  heroCopy,
  heroHeading,
  industry,
  industryTab,
  marqueeLogos,
  type IndustryTab,
} from "./landing-content";
import "./landing-page.css";


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
  const [playingHeroVideoKey, setPlayingHeroVideoKey] = useState<string | null>(null);
  const [reduceData, setReduceData] = useState(prefersReducedData);
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
      <LandingNav />
      <LandingScrollbar />

      {/* A still card on every screen size: no scroll or load motion here. */}
      <section className="landing-hero" id="top">
        <div className="landing-hero-frame">
          <div className="landing-hero-media">
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
          </div>
          <div className="landing-hero-copy">
            <h1>{heroHeading}</h1>
            <p>{heroCopy}</p>
          </div>
        </div>
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
                      style={{
                        "--landing-logo-scale": logo.scale,
                        ...("offsetX" in logo ? {
                          "--landing-logo-offset-x": logo.offsetX,
                          "--landing-logo-offset-y": logo.offsetY,
                        } : {}),
                      } as CSSProperties}
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
          <SolutionExplorer items={industry} reduceMotion={reduceMotion} />
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
      <LandingTeam />
      <ProjectInquiry embedded />
      <LandingFooter />
    </main>
  );
};

export default LandingPage;
