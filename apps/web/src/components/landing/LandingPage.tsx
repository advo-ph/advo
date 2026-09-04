import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowUpRight, ChevronRight } from "lucide-react";
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
 * The three software surfaces plus the hardware on the counter. One system,
 * shown the way it is used, with the cinematic stills doing the talking.
 */
const surface = [
  {
    title: "Public site",
    heading: "The front door your customers land on.",
    desc: "On your domain, fast on a phone, and wired to the system behind it. Fourlinq is live at fourlinq.ph.",
    still: "/landing/rw/story.jpg",
    primary: { label: "Start a project", href: "/start" },
    secondary: { label: "See Fourlinq", href: "https://fourlinq.ph" },
  },
  {
    title: "Client Hub",
    heading: "Scope, files, approvals, and invoices in one place.",
    desc: "Your team and ours see the same status. Sign-off happens on the work itself, not in a chat thread.",
    still: "/landing/rw/hero.jpg",
    primary: { label: "Log in", href: "/login" },
    secondary: { label: "How it ships", href: "#process" },
  },
  {
    title: "Admin console",
    heading: "The back office your staff opens every morning.",
    desc: "Projects, leads, capacity, and finance. The hardware floor is part of the install: tablet, printer, TV.",
    still: "/landing/rw/deliver.jpg",
    primary: { label: "Log in", href: "/login" },
    secondary: { label: "Request a quotation", href: "#work" },
  },
];

const stage = ["Inquiry", "Scope", "Build", "Review", "Launch"];

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

const tool = [
  { name: "Gmail", asset: "/landing/integration/gmail.svg" },
  { name: "Calendar", asset: "/landing/integration/google-calendar.svg" },
  { name: "Notion", asset: "/landing/integration/notion.svg" },
  { name: "Slack", asset: "/landing/integration/slack.svg" },
  { name: "Trello", asset: "/landing/integration/trello.svg" },
  { name: "Drive", asset: "/landing/integration/google-drive.svg" },
  { name: "Zoom", asset: "/landing/integration/zoom.svg" },
  { name: "Asana", asset: "/landing/integration/asana.svg" },
  { name: "Teams", asset: "/landing/integration/microsoft-teams.svg" },
];

const heroCopy = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

/** In-page anchors stay `<a href>` so the browser owns the smooth scroll. */
const Action = ({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) => {
  if (href.startsWith("http")) {
    return (
      <a className={className} href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  if (href.startsWith("#")) {
    return (
      <a className={className} href={href}>
        {children}
      </a>
    );
  }
  return (
    <Link className={className} to={href}>
      {children}
    </Link>
  );
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
          Three pieces already exist. The system is the fourth.
        </Reveal>
        <Reveal className="landing-lede" delay={0.08}>
          <p>
            Paper, Viber, tally sheets. We drop in the missing piece: software, plus the
            tablet, printer, and TV already on the counter.
          </p>
        </Reveal>

        <RevealGroup className="landing-surface-grid" stagger={0.1}>
          {surface.map((item) => (
            <Reveal as="article" className="landing-surface-card" key={item.title}>
              <h3>{item.title}</h3>
              <div className="landing-still">
                <img src={item.still} alt="" loading="lazy" />
              </div>
              <h4>{item.heading}</h4>
              <p>{item.desc}</p>
              <div className="landing-surface-action">
                <Action className="landing-button landing-button-primary landing-button-small" href={item.primary.href}>
                  {item.primary.label}
                </Action>
                <Action className="landing-button landing-button-ghost landing-button-small" href={item.secondary.href}>
                  {item.secondary.label}
                  {item.secondary.href.startsWith("http") ? <ArrowUpRight size={14} strokeWidth={1} absoluteStrokeWidth /> : null}
                </Action>
              </div>
            </Reveal>
          ))}
        </RevealGroup>

        <Reveal className="landing-tool-row" delay={0.05}>
          <p>Fits the tools your floor already runs on</p>
          <div>
            {tool.map((item) => (
              <span key={item.name}>
                <img src={item.asset} alt="" loading="lazy" />
                {item.name}
              </span>
            ))}
          </div>
        </Reveal>
      </section>

      <section className="landing-process" id="process">
        <Reveal as="div" className="landing-workflow-section" id="workflow">
          {stage.map((label, index) => (
            <span key={label}>
              {index > 0 ? <i aria-hidden="true" /> : null}
              {label}
            </span>
          ))}
        </Reveal>

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
