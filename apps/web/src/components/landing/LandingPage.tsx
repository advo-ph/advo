import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowUpRight, ChevronDown, ChevronRight } from "lucide-react";
import { usePortfolio } from "@/hooks/usePortfolio";
import LandingNav from "@/components/LandingNav";
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
    copy: "On your domain, fast on a phone, and wired to the system behind it. Fourlinq is live at fourlinq.ph.",
    still: "/landing/rw/story.jpg",
    primary: { label: "Start a project", href: "/start" },
    secondary: { label: "See Fourlinq", href: "https://fourlinq.ph" },
  },
  {
    title: "Client Hub",
    heading: "Scope, files, approvals, and invoices in one place.",
    copy: "Your team and ours see the same status. Sign-off happens on the work itself, not in a chat thread.",
    still: "/landing/rw/hero.jpg",
    primary: { label: "Log in", href: "/login" },
    secondary: { label: "How it ships", href: "#process" },
  },
  {
    title: "Admin console",
    heading: "The back office your staff opens every morning.",
    copy: "Projects, leads, capacity, and finance. The hardware floor is part of the install: tablet, printer, TV.",
    still: "/landing/rw/deliver.jpg",
    primary: { label: "Log in", href: "/login" },
    secondary: { label: "Request a quotation", href: "#engagement" },
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

const engagement = [
  { title: "Project", copy: "Fixed scope, timeline, and deliverables." },
  { title: "Retainer", copy: "A dedicated team for ongoing work." },
  { title: "Hourly", copy: "On-demand help when you need it." },
  { title: "Enterprise", copy: "Custom systems for large teams." },
];

const faq = [
  {
    question: "Do I get a website, or a system?",
    answer:
      "Both, and they are the same build. The public site is the front door. Behind it sit the client hub your customer signs into, the admin console your staff runs the day on, and the hardware on the counter.",
  },
  {
    question: "What is the client hub, and who sees it?",
    answer:
      "The signed-in workspace holding scope, files, milestones, approvals, and invoices for one project. You invite your team and your client by role, so everyone sees the same truth.",
  },
  {
    question: "What does the admin console do?",
    answer:
      "It is the back office: projects, leads, tasks, capacity, approvals, and finance. The surface your studio opens every morning.",
  },
  {
    question: "Where does it run, and do I own it?",
    answer:
      "On a self-hosted VPS stack we set up and operate: Postgres, Node, Nginx, TLS. No per-seat cloud tax. At handoff the whole stack moves into your name: server, domain, database, and repository.",
  },
  {
    question: "Is the hardware on the floor your job too?",
    answer:
      "Yes. The tablet at the counter, the receipt printer, and the TV on the wall are part of the system we install, train on, and support.",
  },
  {
    question: "What happens after launch?",
    answer:
      "A care plan or hourly support keeps it running: fixes, monitoring, and new work. The printer that dies at 8PM is covered that night.",
  },
];

const partner = [
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
  const [faqOpen, setFaqOpen] = useState(0);
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

      <section className="landing-hero" id="top">
        <div className="landing-hero-frame" ref={heroRef}>
          <motion.div
            className="landing-hero-media"
            style={{ y: heroShift }}
            initial={reduceMotion ? false : { scale: 1.06 }}
            animate={{ scale: 1 }}
            transition={{ duration: 1.8, ease: EASE }}
          >
            <img src="/landing/rw/hero.jpg" alt="" fetchPriority="high" />
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
                <ChevronRight size={14} />
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section className="landing-marquee" aria-label="Tools the floor already runs on">
        <p>Works alongside the tools your floor already runs on</p>
        <div className="landing-marquee-mask">
          <div className={reduceMotion ? "landing-marquee-track is-static" : "landing-marquee-track"}>
            {[...partner, ...partner].map((item, index) => (
              <span className="landing-marquee-item" key={`${item.name}-${index}`}>
                <img src={item.asset} alt="" />
                {item.name}
              </span>
            ))}
          </div>
        </div>
      </section>

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
              <p>{item.copy}</p>
              <div className="landing-surface-action">
                <Action className="landing-button landing-button-primary landing-button-small" href={item.primary.href}>
                  {item.primary.label}
                </Action>
                <Action className="landing-button landing-button-ghost landing-button-small" href={item.secondary.href}>
                  {item.secondary.label}
                  {item.secondary.href.startsWith("http") ? <ArrowUpRight size={14} /> : null}
                </Action>
              </div>
            </Reveal>
          ))}
        </RevealGroup>
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

      <section className="landing-band" id="engagement">
        <div className="landing-band-frame">
          <img src="/landing/rw/story.jpg" alt="" loading="lazy" />
          <div className="landing-band-shade" />
          <div className="landing-band-inner">
            <Reveal className="landing-band-lede">
              <h2>
                To become the infrastructure of the technological layer for industries around
                the Philippines. We will modernize the Philippines.
              </h2>
              <Link className="landing-button landing-button-outline" to="/start">
                Start a project
              </Link>
            </Reveal>

            <Reveal className="landing-band-list" delay={0.12}>
              <p>
                We do not publish rates. Tell us what the floor has to do and we send a
                quotation built on your scope.
              </p>
              {engagement.map((item) => (
                <Link key={item.title} to="/start" className="landing-band-row">
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.copy}</small>
                  </span>
                  <ArrowUpRight size={16} />
                </Link>
              ))}
            </Reveal>
          </div>
        </div>
      </section>

      {shippedProject.length > 0 ? (
        <section className="landing-work" id="work">
          <Reveal as="h2" className="landing-display">
            The sites we have already shipped.
          </Reveal>
          <RevealGroup className="landing-work-grid" stagger={0.1}>
            {shippedProject.map((item) => {
              const body = (
                <>
                  <div className="landing-still landing-work-shot">
                    <img src={item.screenshotUrl ?? ""} alt={`${item.title} screenshot`} loading="lazy" />
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.blurb}</p>
                </>
              );
              return (
                <Reveal as="article" className="landing-work-card" key={item.portfolio_project_id}>
                  {item.live_url ? (
                    <a href={item.live_url} target="_blank" rel="noopener noreferrer">
                      {body}
                      <span className="landing-text-link">
                        Visit the site
                        <ArrowUpRight size={14} />
                      </span>
                    </a>
                  ) : item.slug ? (
                    <Link to={`/project/${item.slug}`}>
                      {body}
                      <span className="landing-text-link">
                        Read the case study
                        <ChevronRight size={14} />
                      </span>
                    </Link>
                  ) : (
                    <div>{body}</div>
                  )}
                </Reveal>
              );
            })}
          </RevealGroup>
        </section>
      ) : null}

      <section className="landing-faq" id="faq">
        <Reveal as="h2" className="landing-display">
          Questions before we build
        </Reveal>
        <RevealGroup className="landing-faq-list" stagger={0.05}>
          {faq.map(({ question, answer }, index) => {
            const isOpen = faqOpen === index;
            return (
              <Reveal className={isOpen ? "landing-faq-item is-open" : "landing-faq-item"} key={question}>
                <button
                  type="button"
                  onClick={() => setFaqOpen(isOpen ? -1 : index)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-${index}`}
                >
                  <span>{question}</span>
                  <ChevronDown size={16} />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen ? (
                    <motion.div
                      id={`faq-${index}`}
                      className="landing-faq-answer"
                      initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
                      transition={{ duration: 0.32, ease: EASE }}
                    >
                      <p>{answer}</p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </Reveal>
            );
          })}
        </RevealGroup>
      </section>

      <LandingFooter />
    </main>
  );
};

export default LandingPage;
