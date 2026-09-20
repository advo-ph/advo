import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { usePortfolio } from "@/hooks/usePortfolio";
import LandingNav from "@/components/LandingNav";
import LandingScrollbar from "@/components/LandingScrollbar";
import { Reveal, RevealGroup } from "@/components/motion/Reveal";
import { EASE } from "@/lib/motion";
import WorkShowcase from "./WorkShowcase";
import ProjectInquiry from "./ProjectInquiry";
import LandingFooter from "./landing-footer";
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
    image: "/landing/industry/flood.png",
    title: "Flood",
    heading: "Know which roads are flooded in real-time",
    copy: "A live Metro Manila flood map that combines river gauges, rain data, hazard maps, and route guidance.",
    offer: [
      {
        name: "Live flood map",
        copy: "Automatically detect flood depth through flood monitoring devices in streets, PAGASA river gauges, live rainfall data, and UP NOAH hazard maps.",
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
    image: "/landing/industry/education.jpg",
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
    image: "/landing/industry/parking.jpg",
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
];

interface Service {
  number: string;
  title: string;
  copy: string;
}

const services: Service[] = [
  {
    number: "01",
    title: "Websites and apps",
    copy: "A public site that makes your business visible to customers, and an app your customers use.",
  },
  {
    number: "02",
    title: "Operational software",
    copy: "Custom systems for the full operational flow between your staff and your customers.",
  },
  {
    number: "03",
    title: "Hardware, training, and support",
    copy: "Kiosks, devices, and screens, installed with training and support.",
  },
];

const industryTab = [
  {
    title: "Food",
    heading: "Restaurants, cafes, and food stalls",
    copy: "QR code ordering from the table, kiosk ordering with payment, and table management for seating, waitlists, and turn times.",
    still: "/landing/industry/food.jpg",
  },
  {
    title: "Medical",
    heading: "Clinics, labs, and pharmacies",
    copy: "Clinic management for appointments, queueing, billing, and stock; EMR for doctors; and hospital integration without a fax machine.",
    still: "/landing/industry/medical.jpg",
  },
  {
    // Construction still is a stand-in until a real photo lands in
    // apps/web/public/landing/industry/construction.jpg
    title: "Construction",
    heading: "Contractors and developers",
    copy: "Site progress and manpower tracking, delivery coordination, and progress billing in one system.",
    still: "/landing/hero-building.jpg",
  },
  {
    title: "Business",
    heading: "Offices, retail, and services",
    copy: "Inventory and point of sale; scheduling and customer records; fleet tracking, dispatch, and proof of delivery.",
    still: "/landing/industry/business.jpg",
  },
];

/**
 * Real client marks, lifted from each client's own repository. Keyed by the
 * portfolio slug so the strip stays driven by the live portfolio table: a
 * client with no entry here shows its name as text, and removing a client
 * from the CMS removes it here too.
 */
const clientLogo: Record<string, { src: string; filter?: string; wide?: boolean }> = {
  fourlinq: { src: "/landing/logo/fourlinq.png" },
  "felici-artisan-gelato": { src: "/landing/logo/felici.png", wide: true },
  "tmc-registry": { src: "/landing/logo/tmc-registry.png", wide: true },
  "camps-ph": { src: "/landing/logo/camps-ph.png" },
  // Coffee Rush ships a white-on-transparent badge for their own dark site.
  "coffee-rush-eastridge": { src: "/landing/logo/coffee-rush.png", filter: "invert(1)" },
};

/**
 * Keep the proof strip present while its remote source is loading or briefly
 * unavailable. A successful empty response still renders no strip: the API
 * remains the source of truth when it is reachable.
 */
const fallbackMarquee = [
  { key: "vbe-eye-center-clinic", title: "VBE Eye Center Clinic", slug: null },
  { key: "fourlinq", title: "FourlinQ", slug: "fourlinq" },
  { key: "felici-artisan-gelato", title: "Felici Artisan Gelato", slug: "felici-artisan-gelato" },
  { key: "coffee-rush-eastridge", title: "Coffee Rush Eastridge", slug: "coffee-rush-eastridge" },
  { key: "tmc-registry", title: "TMC Registry", slug: "tmc-registry" },
  { key: "camps-ph", title: "Camps PH", slug: "camps-ph" },
] as const;

const heroCopy = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

const LandingPage = () => {
  const reduceMotion = useReducedMotion();
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 680px)").matches,
  );
  const [tabIndex, setTabIndex] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 680px)");
    const handleChange = () => setIsMobileViewport(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Section attention + scroll-depth milestones. A no-op until the visitor grants
  // consent, and detaches again on withdrawal — see apps/web/src/lib/track.ts.
  useEffect(() => {
    if (!pageRef.current) return;
    return instrumentLanding(pageRef.current);
  }, []);

  // Prince, 08-21: "keep only the section for the websites that we've already
  // created". Real portfolio rows or nothing.
  const { project: shippedProject, isLoading: isPortfolioLoading, isError: isPortfolioError } = usePortfolio();
  const marqueeItems =
    shippedProject.length > 0
      ? shippedProject.map((item) => ({
          key: String(item.portfolio_project_id),
          title: item.title,
          slug: item.slug,
        }))
      : isPortfolioLoading || isPortfolioError
        ? fallbackMarquee
        : [];

  // The hero still drifts a little slower than the page. Small on purpose: the
  // photo is the point, the motion only keeps it from reading as a poster.
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroShift = useTransform(scrollYProgress, [0, 1], ["0%", reduceMotion ? "0%" : "14%"]);

  const current = industryTab[tabIndex] ?? industryTab[0];

  return (
    <main className={reduceMotion ? "landing-page is-reduce-motion" : "landing-page"} ref={pageRef}>
      <LandingNav overlayHero />
      <LandingScrollbar />

      <section className="landing-hero" id="top">
        <div className="landing-hero-frame" ref={heroRef}>
          <motion.div
            className="landing-hero-media"
            style={{ y: heroShift }}
            initial={reduceMotion ? false : { scale: 1.06 }}
            animate={{ scale: 1 }}
            transition={{ duration: 1.8, ease: EASE }}
          >
            {reduceMotion ? (
              <img
                src={isMobileViewport ? "/landing/hero-building-mobile.jpg" : "/landing/hero-building.jpg"}
                alt=""
              />
            ) : (
              <video
                key={isMobileViewport ? "mobile" : "desktop"}
                className="landing-hero-video"
                src={isMobileViewport ? "/landing/hero-building-mobile.mp4" : "/landing/hero-building.mp4"}
                poster={isMobileViewport ? "/landing/hero-building-mobile.jpg" : "/landing/hero-building.jpg"}
                autoPlay
                muted
                loop
                playsInline
                aria-hidden="true"
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
              Our vision is to become the infrastructure of the technological layer for industries
              around the Philippines.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {marqueeItems.length > 0 ? (
        <section className="landing-marquee" aria-label="Businesses running on ADVO">
          <p>Businesses already running on ADVO</p>
          <div className="landing-marquee-mask">
            <div className="landing-marquee-track">
              {[...marqueeItems, ...marqueeItems].map((item, index) => {
                const logo = item.slug ? clientLogo[item.slug] : undefined;
                return (
                  <span
                    className={logo?.wide ? "landing-marquee-item is-wide" : "landing-marquee-item"}
                    key={`${item.key}-${index}`}
                    aria-hidden={index >= marqueeItems.length}
                  >
                    {logo ? (
                      <img src={logo.src} alt={item.title} style={logo.filter ? { filter: logo.filter } : undefined} />
                    ) : null}
                    {!logo || !logo.wide ? <span>{item.title}</span> : null}
                  </span>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      <section className="landing-piece" id="solutions" aria-labelledby="solutions-heading">
        <Reveal as="h2" id="solutions-heading" className="landing-display landing-solutions-title">
          Building Real-World Technological Solutions
        </Reveal>

        <RevealGroup className="landing-industry-grid" stagger={0.08}>
          {industry.map((item) => (
            <Reveal as="article" className="landing-industry-card" key={item.key}>
              <p className="landing-industry-label">{item.title}</p>
              <div className="landing-industry-media">
                <img src={item.image} alt={`${item.title} — an ADVO solution`} loading="lazy" />
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
      </section>

      <section className="landing-services" id="services" aria-labelledby="services-heading">
        <div className="landing-services-frame">
          <Reveal className="landing-services-intro">
            <h2 id="services-heading">What we offer</h2>
          </Reveal>

          <RevealGroup className="landing-services-list" stagger={0.08}>
            {services.map((service) => (
              <Reveal as="article" className="landing-service-row" key={service.number}>
                <span className="landing-service-number">{service.number}</span>
                <div>
                  <h3>{service.title}</h3>
                  <p>{service.copy}</p>
                </div>
                <ArrowUpRight size={18} strokeWidth={1.25} aria-hidden="true" />
              </Reveal>
            ))}
          </RevealGroup>
        </div>
      </section>

      <section className="landing-process" id="process">
        <Reveal as="h2" className="landing-process-title">Industries we modernize</Reveal>
        <Reveal className="landing-process-card" delay={0.1}>
          <div className="landing-process-tab" role="tablist" aria-orientation="vertical" aria-label="Industries we modernize">
            {industryTab.map((item, index) => (
              <button
                type="button"
                role="tab"
                key={item.title}
                aria-selected={index === tabIndex}
                className={index === tabIndex ? "is-active" : ""}
                onClick={() => setTabIndex(index)}
              >
                {item.title}
              </button>
            ))}
          </div>

          <div className="landing-process-panel" role="tabpanel">
            <div className="landing-still landing-process-still">
              <AnimatePresence initial={false}>
                <motion.img
                  key={current.still + current.title}
                  src={current.still}
                  alt=""
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
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
                transition={{ duration: 0.28, ease: EASE }}
              >
                <h3>{current.heading}</h3>
                <p>{current.copy}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </Reveal>
      </section>
      {shippedProject.length > 0 ? <WorkShowcase project={shippedProject} /> : null}
      <ProjectInquiry embedded />
      <LandingFooter />
    </main>
  );
};

export default LandingPage;
