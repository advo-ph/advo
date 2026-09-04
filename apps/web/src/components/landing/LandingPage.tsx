import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowUpRight, ChevronRight, UtensilsCrossed, Stethoscope, GraduationCap, CircleParking, Building2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { usePortfolio } from "@/hooks/usePortfolio";
import { getCaseStudy } from "@/data/case-study";
import WorkMedia from "@/components/WorkMedia";
import LandingNav from "@/components/LandingNav";
import LandingScrollbar from "@/components/LandingScrollbar";
import { Reveal, RevealGroup } from "@/components/motion/Reveal";
import { EASE } from "@/lib/motion";
import LandingFooter from "./landing-footer";
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
  icon: LucideIcon;
  copy: string;
  offer: Offer[];
}
const industry: Industry[] = [
  {
    key: "food",
    image: "/landing/industry/food.jpg",
    icon: UtensilsCrossed,
    title: "Food",
    copy: "Ordering, seating, and the kitchen behind both.",
    offer: [
      { name: "QR code ordering", copy: "Guests scan the table code and order from their own phone." },
      { name: "Kiosk ordering", copy: "Self-serve terminals that take the order and the payment." },
      { name: "Table management", copy: "A live floor plan with seating, waitlist, and turn times." },
    ],
  },
  {
    key: "medical",
    image: "/landing/industry/medical.jpg",
    icon: Stethoscope,
    title: "Medical",
    copy: "Clinics, hospitals, and the records that move between them.",
    offer: [
      { name: "Clinic management", copy: "Appointments, queueing, billing, and stock in one system." },
      { name: "EMR for doctors", copy: "Patient records a doctor reads and updates between consults." },
      { name: "Hospital integration", copy: "Clinic data to and from hospital systems, no fax machine." },
    ],
  },
  {
    key: "education",
    image: "/landing/industry/education.jpg",
    icon: GraduationCap,
    title: "Education",
    copy: "Campus security, grading, and the school's own portal.",
    offer: [
      { name: "ID authentication", copy: "Student IDs that tap in at the gate and log who is on campus." },
      { name: "Automated monitoring", copy: "Attendance tracked without a teacher counting heads." },
      { name: "Grading system", copy: "Marks entered once, computed to the school's own rules." },
    ],
  },
  {
    key: "parking",
    image: "/landing/industry/parking.jpg",
    icon: CircleParking,
    title: "Parking",
    copy: "A fully automated car park for drivers, managers, and owners.",
    offer: [
      { name: "Plate recognition", copy: "A camera reads the plate at the gate and the barrier opens." },
      { name: "Self-service payment", copy: "Pay at a kiosk in cash with coin change, or by e-wallet." },
      { name: "Runs offline", copy: "The internet drops and the lane keeps working." },
    ],
  },
  {
    key: "business",
    image: "/landing/industry/business.jpg",
    icon: Building2,
    title: "Businesses",
    copy: "If it runs on spreadsheets and group chats, it can run on software.",
    offer: [
      { name: "Construction", copy: "Site progress, manpower, deliveries, and progress billing." },
      { name: "Retail and services", copy: "Inventory, point of sale, scheduling, and customer records." },
      { name: "Logistics", copy: "Fleet tracking, dispatch, and proof of delivery." },
    ],
  },
];

const step = [
  {
    title: "Discover",
    heading: "Learn the floor before we write software",
    copy: "We sit with how the business actually runs: paper, Viber, tally sheets. Then we name the outcome, not a feature list.",
    still: "/landing/rw/before.jpg",
  },
  {
    title: "Design",
    heading: "Make the system visible before we build it",
    copy: "Screens, hardware, and handoffs are specified together, so the counter staff and the admin see the same plan.",
    still: "/landing/rw/story.jpg",
  },
  {
    title: "Build",
    heading: "Ship in the shared workspace, not in email",
    copy: "Design, development, and integration happen in one place. You see progress the week it happens.",
    still: "/landing/rw/hero.jpg",
  },
  {
    title: "Review",
    heading: "Approve what is true, not what was attached",
    copy: "Feedback and sign-off live on the work itself. No lost versions, no mystery last file.",
    still: "/landing/rw/story.jpg",
  },
  {
    title: "Launch",
    heading: "Install, train, and stay on the floor",
    copy: "We go live with the tablet, the printer, the TV, and the people who will use them on a Saturday night.",
    still: "/landing/rw/deliver.jpg",
  },
  {
    title: "Support",
    heading: "Stay after launch, because uptime is the product",
    copy: "A care plan or hourly support covers the printer that dies at 8PM, not a ticket that waits until Monday.",
    still: "/landing/rw/hero.jpg",
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
  const [stepIndex, setStepIndex] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);

  // Prince, 08-21: "keep only the section for the websites that we've already
  // created". Real portfolio rows or nothing.
  const { project: shippedProject } = usePortfolio();

  // The hero still drifts a little slower than the page. Small on purpose: the
  // photo is the point, the motion only keeps it from reading as a poster.
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroShift = useTransform(scrollYProgress, [0, 1], ["0%", reduceMotion ? "0%" : "14%"]);

  const current = step[stepIndex] ?? step[0];

  return (
    <main className={reduceMotion ? "landing-page is-reduce-motion" : "landing-page"}>
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
              <img src="/landing/hero-building.jpg" alt="" />
            ) : (
              <video
                className="landing-hero-video"
                src="/landing/hero-building.mp4"
                poster="/landing/hero-building.jpg"
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
              Philippine software agency and client workspace. One shared place from brief to
              launch.
            </motion.p>
            <motion.div className="landing-hero-action" variants={heroCopy} transition={{ duration: 0.7, ease: EASE }}>
              <Link className="landing-button landing-button-hero" to="/start">
                Start a project
                <ChevronRight size={14} strokeWidth={1} absoluteStrokeWidth />
              </Link>
            </motion.div>
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

      <section className="landing-piece" id="showcase">
        <Reveal as="h2" className="landing-display">
          What we build
        </Reveal>
        <Reveal className="landing-lede" delay={0.08}>
          <p>
            Paper, Viber, tally sheets. We drop in the missing piece: software for the
            industries we already ship into, plus the tablet, printer, and TV on the counter.
          </p>
        </Reveal>

        <RevealGroup className="landing-industry-grid" stagger={0.08}>
          {industry.map((item) => (
            <Reveal as="article" className="landing-industry-card" key={item.key}>
              <div className="landing-industry-media">
                <img src={item.image} alt={`${item.title} — what ADVO builds`} loading="lazy" />
              </div>
              <div className="landing-industry-head">
                <item.icon size={20} strokeWidth={1.25} absoluteStrokeWidth />
                <h3>{item.title}</h3>
              </div>
              <p className="landing-industry-copy">{item.copy}</p>
              <ul className="landing-industry-offer">
                {item.offer.map((o) => (
                  <li key={o.name}>
                    <span className="landing-industry-offer-name">{o.name}</span>
                    <span className="landing-industry-offer-copy">{o.copy}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </RevealGroup>

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
      {shippedProject.length > 0 ? (
        <section className="landing-work" id="work">
          <Reveal as="h2" className="landing-display">
            The sites we have already shipped.
          </Reveal>
          <RevealGroup className="landing-work-grid" stagger={0.1}>
            {shippedProject.map((item) => {
              // A case study read out of the client's own source beats bouncing
              // the visitor straight off-site. The live URL is one click away
              // inside it.
              const study = getCaseStudy(item.slug);
              const href = study
                ? `/work/${item.slug}`
                : item.live_url ?? (item.slug ? `/project/${item.slug}` : null);
              const isExternal = !study && Boolean(item.live_url);
              const body = (
                <>
                  <WorkMedia slug={item.slug} title={item.title} fallback={item.screenshotUrl} />
                  <h3>{item.title}</h3>
                  <p>{item.blurb}</p>
                  {href ? (
                    <span className="landing-text-link">
                      {study ? "Read the case study" : isExternal ? "Visit the site" : "See the project"}
                      {isExternal ? <ArrowUpRight size={14} strokeWidth={1} absoluteStrokeWidth /> : <ChevronRight size={14} strokeWidth={1} absoluteStrokeWidth />}
                    </span>
                  ) : null}
                </>
              );
              return (
                <Reveal as="article" className="landing-work-card" key={item.portfolio_project_id}>
                  {href && isExternal ? (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {body}
                    </a>
                  ) : href ? (
                    <Link to={href}>{body}</Link>
                  ) : (
                    <div>{body}</div>
                  )}
                </Reveal>
              );
            })}
          </RevealGroup>
        </section>
      ) : null}
      <LandingFooter />
    </main>
  );
};

export default LandingPage;
