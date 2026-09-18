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
}
const industry: Industry[] = [
  {
    key: "parking",
    image: "/landing/industry/parking.jpg",
    title: "Parking",
    heading: "A car park that runs itself.",
    copy: "A fully automated car park for drivers, managers, and owners.",
    offer: [
      { name: "Plate recognition", copy: "A camera reads the plate at the gate and the barrier opens." },
      { name: "Self-service payment", copy: "Pay at a kiosk in cash with coin change, or by e-wallet." },
      { name: "Runs offline", copy: "The internet drops and the lane keeps working." },
    ],
  },
  {
    key: "education",
    image: "/landing/industry/education.jpg",
    title: "Education",
    heading: "A safer, more connected campus.",
    copy: "Campus access, safety, and school operations in one system.",
    offer: [
      { name: "ID authentication", copy: "Student IDs tap in at gates, integrated with attendance monitoring." },
      { name: "Safety and Security", copy: "Turnstile tap ID entrance and exit with industry-grade baggage scanning." },
      { name: "Dedicated website and app", copy: "A dedicated website and app for the institution and its students." },
    ],
  },
  {
    key: "flood",
    image: "/landing/industry/flood.png",
    title: "Flood",
    heading: "Know which roads are flooded before you drive them.",
    copy: "A live Metro Manila flood map that combines river gauges, rain data, hazard maps, and route guidance.",
    offer: [
      { name: "Live flood map", copy: "Road conditions update from PAGASA gauges, rainfall data, and UP NOAH hazard maps." },
      { name: "Flood-aware routing", copy: "Routes drivers around risky water and warns them before a flooded stretch." },
      { name: "Works offline", copy: "Cached road data keeps the map usable through weak signal and brownout days." },
    ],
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
    title: "Websites and portals",
    copy: "A clear public site for customers, with the private client space behind it when the work needs more than a contact form.",
  },
  {
    number: "02",
    title: "Operational software",
    copy: "Custom systems for the work happening between a customer, a counter, a team, and the person keeping the numbers right.",
  },
  {
    number: "03",
    title: "Hardware and deployment",
    copy: "The tablets, printers, screens, hosting, training, and support that make the software hold up on a real working floor.",
  },
];

const step = [
  {
    title: "Discover",
    heading: "Learn the floor before we write software",
    copy: "We sit with how the shop actually runs today: paper, Viber, and tally sheets, then name the outcome.",
    still: "/landing/process/discover.jpg",
  },
  {
    title: "Design",
    heading: "Make the system visible before we build it",
    copy: "Screens, hardware, and handoffs are drawn together, so counter staff and the admin see one shared plan.",
    still: "/landing/process/design.jpg",
  },
  {
    title: "Build",
    heading: "Ship in the shared workspace, not in email",
    copy: "Design, development, and integration all happen in one place, so you watch the progress the week it lands.",
    still: "/landing/process/build.jpg",
  },
  {
    title: "Review",
    heading: "Approve what is true, not what was attached",
    copy: "Feedback and sign-off live on the work itself, so there are no lost versions and no mystery last file.",
    still: "/landing/process/review.jpg",
  },
  {
    title: "Launch",
    heading: "Install, train, and stay on the floor",
    copy: "We go live with the tablet, the printer, and the TV, and train the people who use them on a busy night.",
    still: "/landing/process/launch.jpg",
  },
  {
    title: "Support",
    heading: "Stay after launch, because uptime is the product",
    copy: "A care plan or hourly support keeps it running: the printer that dies at 8PM is covered that same night.",
    still: "/landing/process/support.jpg",
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

const heroCopy = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

const LandingPage = () => {
  const reduceMotion = useReducedMotion();
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 680px)").matches,
  );
  const [stepIndex, setStepIndex] = useState(0);
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
  const { project: shippedProject } = usePortfolio();

  // The hero still drifts a little slower than the page. Small on purpose: the
  // photo is the point, the motion only keeps it from reading as a poster.
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroShift = useTransform(scrollYProgress, [0, 1], ["0%", reduceMotion ? "0%" : "14%"]);

  const current = step[stepIndex] ?? step[0];

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
              we modernize it for you.
            </motion.h1>
            <motion.p variants={heroCopy} transition={{ duration: 0.7, ease: EASE }}>
              our vision is To become the infrastructure of the technological layer for industries
              around the Philippines.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {shippedProject.length > 0 ? (
        <section className="landing-marquee" aria-label="Businesses running on ADVO">
          <p>Businesses already running on ADVO</p>
          <div className="landing-marquee-mask">
            <div className="landing-marquee-track">
              {[...shippedProject, ...shippedProject].map((item, index) => {
                const logo = item.slug ? clientLogo[item.slug] : undefined;
                return (
                  <span
                    className={logo?.wide ? "landing-marquee-item is-wide" : "landing-marquee-item"}
                    key={`${item.portfolio_project_id}-${index}`}
                    aria-hidden={index >= shippedProject.length}
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
                <div className="landing-industry-actions">
                  <a className="landing-button landing-button-primary" href="#start">Talk to us</a>
                  <a className="landing-button landing-button-secondary" href="#process">How it ships</a>
                </div>
              </div>
            </Reveal>
          ))}
        </RevealGroup>
      </section>

      <section className="landing-services" id="services" aria-labelledby="services-heading">
        <div className="landing-services-frame">
          <Reveal className="landing-services-intro">
            <p className="landing-kicker">Services</p>
            <h2 id="services-heading">The software layer your operation has been missing.</h2>
            <p>
              ADVO joins the visible part of your business to the work behind it — from the first
              visit to the last report.
            </p>
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
        <Reveal className="landing-process-card" delay={0.1}>
          <div className="landing-process-tab" role="tablist" aria-orientation="vertical" aria-label="How it ships">
            {step.map((item, index) => (
              <button
                type="button"
                role="tab"
                key={item.title}
                aria-selected={index === stepIndex}
                className={index === stepIndex ? "is-active" : ""}
                onClick={() => setStepIndex(index)}
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
