import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import {
  IconBrandFacebook,
  IconBrandGithub,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandX,
  IconBrandYoutube,
  IconMail,
  IconWorld,
} from "@tabler/icons-react";
import { get } from "@/lib/api";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import "./landing-page.css";

interface SocialLink {
  icon: string;
  href: string;
  label: string;
}

interface NavItem {
  label: string;
  href: string;
  panel?: { label: string; href: string }[];
}

const navItem: NavItem[] = [
  {
    label: "Product",
    href: "#showcase",
    panel: [
      { label: "Client Hub", href: "/login" },
      { label: "Admin", href: "/login" },
      { label: "Workspace", href: "#showcase" },
      { label: "Start a project", href: "/start" },
    ],
  },
  {
    label: "Services",
    href: "#service",
    panel: [
      { label: "Strategy", href: "#service" },
      { label: "Design", href: "#service" },
      { label: "Development", href: "#service" },
      { label: "Support", href: "#service" },
    ],
  },
  { label: "Work", href: "#work" },
  { label: "Process", href: "#process" },
  { label: "Pricing", href: "#engagement" },
];

const capability = [
  { title: "Strategy", copy: "Goals, market, plan", icon: "/landing/icon/strategy.png" },
  { title: "Design", copy: "Brand, UI, content", icon: "/landing/icon/design.png" },
  { title: "Development", copy: "Web, mobile, systems", icon: "/landing/icon/development.png" },
  { title: "Support", copy: "Launch and retain", icon: "/landing/icon/hardware.png" },
];

const floor = [
  {
    title: "Clinic",
    copy: "Queue, records, and the desk that still runs on notebooks.",
    icon: "/landing/icon/strategy.png",
  },
  {
    title: "Café",
    copy: "Orders, receipts, and the tablet-printer pair on the counter.",
    icon: "/landing/icon/hardware.png",
  },
  {
    title: "Shop",
    copy: "Inventory and the floor that cannot wait for a seat in the cloud.",
    icon: "/landing/icon/surface.png",
  },
];

const toolCard = [
  {
    title: "Client Hub",
    desc: "One workspace for scope, files, milestones, and approvals.",
    image: "/landing/rw/after.jpg",
    cta: "Open hub",
    href: "/login",
    more: true,
  },
  {
    title: "Plan",
    desc: "Capture briefs, set timelines, and lock scope before build.",
    image: "/landing/rw/plan.jpg",
    cta: "Start a project",
    href: "/start",
  },
  {
    title: "Create",
    desc: "Design and develop in one shared place, not a thread of files.",
    image: "/landing/rw/create.jpg",
    cta: "See the workspace",
    href: "#showcase",
    more: true,
  },
  {
    title: "Approve",
    desc: "Share work, gather feedback, and get sign-off without the chase.",
    image: "/landing/rw/approve.jpg",
    cta: "See approvals",
    href: "#showcase",
    more: true,
  },
  {
    title: "Deliver",
    desc: "Handoff, launch, and bill without the back-and-forth.",
    image: "/landing/rw/deliver.jpg",
    cta: "Start a project",
    href: "/start",
  },
  {
    title: "Public site",
    desc: "The site your customers see. Shipped and live.",
    image: "/landing/rw/story.jpg",
    cta: "See Fourlinq",
    href: "https://fourlinq.ph",
    more: true,
  },
];

const useCase = [
  {
    title: "Discover",
    heading: "Learn the floor before we write software",
    desc: "We sit with how the business actually runs: paper, Viber, tally sheets. Then we name the outcome, not a feature list.",
    chip: ["site visit", "current tools", "constraints", "success metric"],
  },
  {
    title: "Design",
    heading: "Make the system visible before we build it",
    desc: "Screens, hardware, and handoffs get specified together so the counter staff and the admin see the same plan.",
    chip: ["flows", "UI", "hardware", "roles"],
  },
  {
    title: "Build",
    heading: "Ship in the shared workspace, not in email",
    desc: "Design, development, and integration happen in one place. You see progress the week it happens.",
    chip: ["milestones", "previews", "commits", "updates"],
  },
  {
    title: "Review",
    heading: "Approve what is true, not what was attached",
    desc: "Feedback and sign-off live on the work itself. No lost versions. No mystery last file.",
    chip: ["comments", "approvals", "revisions"],
  },
  {
    title: "Launch",
    heading: "Install, train, and stay on the floor",
    desc: "We go live with the tablet, the printer, the TV, and the people who will use them on Saturday night.",
    chip: ["deploy", "train", "handoff"],
  },
  {
    title: "Support",
    heading: "Stay after launch, because uptime is the product",
    desc: "Retainers and hourly support cover the printer that dies at 8PM, not a ticket that waits until Monday.",
    chip: ["retainer", "hourly", "SLA"],
  },
];

const surface = [
  {
    title: "Client Hub",
    desc: "Status, files, invoices, and the team. The same truth your operators see.",
    icon: "/landing/icon/surface.png",
    thumb: "/landing/rw/after.jpg",
    href: "/login",
  },
  {
    title: "Admin",
    desc: "Projects, leads, finance, and the tools the studio runs on every day.",
    icon: "/landing/icon/development.png",
    thumb: "/landing/rw/create.jpg",
    href: "/login",
  },
  {
    title: "Public site",
    desc: "The marketing surface. Fourlinq is live at fourlinq.ph.",
    icon: "/landing/icon/design.png",
    thumb: "/landing/rw/story.jpg",
    href: "https://fourlinq.ph",
  },
  {
    title: "Hardware floor",
    desc: "Tablet, printer, TV. Commodity devices. Software that survives the counter.",
    icon: "/landing/icon/hardware.png",
    thumb: "/landing/rw/deliver.jpg",
    href: "/start",
  },
  {
    title: "Approvals",
    desc: "Sign-off on the work, not in a chat thread.",
    icon: "/landing/icon/approve.png",
    thumb: "/landing/rw/approve.jpg",
    href: "#showcase",
  },
  {
    title: "Planning",
    desc: "Briefs, timelines, and scope before a line of code.",
    icon: "/landing/icon/strategy.png",
    thumb: "/landing/rw/plan.jpg",
    href: "/start",
  },
];

const engagement = [
  { title: "Project", copy: "Fixed scope, timeline, and deliverables.", price: "₱60,000", suffix: "starting at", action: "Get a quote" },
  { title: "Retainer", copy: "Dedicated team for ongoing work.", price: "₱80,000/mo", suffix: "starting at", action: "Book a call" },
  { title: "Hourly", copy: "On-demand help when you need it.", price: "₱800/hr", suffix: "starting at", action: "Request access" },
  { title: "Enterprise", copy: "Custom solutions for large teams.", price: "Custom", suffix: "talk to us", action: "Contact us" },
];

const faq = [
  { question: "How does the ADVO workspace work?", answer: "Every project has one shared workspace for scope, files, milestones, feedback, approvals, and delivery, so your team and ours always see the same truth." },
  { question: "Can I invite my team and client to the workspace?", answer: "Yes. Invite collaborators by role and control what internal teams, partners, and clients can view or update." },
  { question: "What's included in the project fee?", answer: "Your proposal defines the agreed strategy, design, development, project management, revisions, and launch support before work begins." },
  { question: "How do payments and invoicing work?", answer: "Projects use clear milestone billing. Retainers and support plans are invoiced on a recurring schedule with transparent activity records." },
  { question: "Do you provide ongoing support after launch?", answer: "Yes. Choose a retainer or hourly support plan for continuous optimization, fixes, reporting, and new feature work." },
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

const chartPoint = [
  { name: "Jan", value: 24 }, { name: "Feb", value: 30 }, { name: "Mar", value: 28 },
  { name: "Apr", value: 44 }, { name: "May", value: 40 }, { name: "Jun", value: 58 },
  { name: "Jul", value: 52 }, { name: "Aug", value: 71 }, { name: "Sep", value: 82 },
];

const socialDefault: SocialLink[] = [
  { icon: "Facebook", href: "https://www.facebook.com/share/1DDt8dVJUd/?mibextid=wwXIfr", label: "Facebook" },
  { icon: "Instagram", href: "https://www.instagram.com/advo_ph/", label: "Instagram" },
  { icon: "Linkedin", href: "https://www.linkedin.com/company/advocompany/", label: "LinkedIn" },
  { icon: "Mail", href: "mailto:contact@advo.ph", label: "Email" },
];

const socialIcon: Record<string, typeof IconBrandInstagram> = {
  Facebook: IconBrandFacebook,
  Instagram: IconBrandInstagram,
  Linkedin: IconBrandLinkedin,
  Mail: IconMail,
  Twitter: IconBrandX,
  Youtube: IconBrandYoutube,
  Globe: IconWorld,
  Github: IconBrandGithub,
};

const footerCol: { title: string; link: { label: string; href: string; ext?: boolean }[] }[] = [
  {
    title: "Product",
    link: [
      { label: "Client Hub", href: "/login" },
      { label: "Admin", href: "/login" },
      { label: "Workspace", href: "#showcase" },
      { label: "Start a project", href: "/start" },
      { label: "Log in", href: "/login" },
    ],
  },
  {
    title: "Services",
    link: [
      { label: "Strategy", href: "#service" },
      { label: "Design", href: "#service" },
      { label: "Development", href: "#service" },
      { label: "Support", href: "#service" },
    ],
  },
  {
    title: "Company",
    link: [
      { label: "Team", href: "/team" },
      { label: "Process", href: "#process" },
      { label: "Work", href: "#work" },
      { label: "Pricing", href: "#engagement" },
      { label: "Contact", href: "/start" },
    ],
  },
  {
    title: "Resources",
    link: [
      { label: "FAQs", href: "#faq" },
      { label: "Fourlinq", href: "https://fourlinq.ph", ext: true },
      { label: "Client Hub", href: "/login" },
    ],
  },
];

const LandingPage = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const [faqOpen, setFaqOpen] = useState(0);
  const [useCaseIndex, setUseCaseIndex] = useState(0);
  const [surfacePage, setSurfacePage] = useState(0);
  const [socialLink, setSocialLink] = useState<SocialLink[]>(socialDefault);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    (async () => {
      const { data } = await get<{ key: string; value: unknown }[]>("/api/settings/public");
      if (data) {
        const setting = data.find((row) => row.key === "social_links");
        if (setting?.value && Array.isArray(setting.value) && setting.value.length > 0) {
          setSocialLink(setting.value as SocialLink[]);
        }
      }
    })();
  }, []);

  const current = useCase[useCaseIndex] ?? useCase[0];
  const surfacePer = 3;
  const surfacePageCount = Math.ceil(surface.length / surfacePer);
  const visibleSurface = surface.slice(surfacePage * surfacePer, surfacePage * surfacePer + surfacePer);

  const closeMenu = () => {
    setIsMenuOpen(false);
    setOpenPanel(null);
  };

  return (
    <main className="landing-page">
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <a className="landing-brand" href="#top" aria-label="ADVO home">
            <img src="/advo-logo-black.png" alt="ADVO" />
          </a>
          <nav className={isMenuOpen ? "landing-nav-link is-open" : "landing-nav-link"} aria-label="Main navigation">
            {navItem.map((item) => (
              <div
                className="landing-nav-item"
                key={item.label}
                onMouseEnter={() => item.panel && setOpenPanel(item.label)}
                onMouseLeave={() => setOpenPanel(null)}
              >
                <a href={item.href} onClick={closeMenu}>
                  {item.label}
                  {item.panel ? (
                    <ChevronDown className={openPanel === item.label ? "is-open" : ""} size={14} />
                  ) : null}
                </a>
                {item.panel && openPanel === item.label ? (
                  <div className="landing-nav-panel">
                    {item.panel.map((link) =>
                      link.href.startsWith("/") ? (
                        <Link key={link.label} to={link.href} onClick={closeMenu}>
                          {link.label}
                        </Link>
                      ) : (
                        <a key={link.label} href={link.href} onClick={closeMenu}>
                          {link.label}
                        </a>
                      ),
                    )}
                  </div>
                ) : null}
              </div>
            ))}
          </nav>
          <div className="landing-nav-action">
            <Link className="landing-login landing-login-wide" to="/team">
              Team
            </Link>
            <Link className="landing-login" to="/login">
              Log in
            </Link>
            <Link className="landing-button landing-button-primary landing-button-small" to="/start">
              Start a project
            </Link>
            <button
              className="landing-menu"
              onClick={() => setIsMenuOpen((value) => !value)}
              aria-label="Toggle navigation"
              aria-expanded={isMenuOpen}
            >
              {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      <section className="landing-hero" id="top">
        <div className="landing-hero-frame">
          <img src="/landing/rw/hero.jpg" alt="" />
          <div className="landing-hero-shade" />
          <div className="landing-hero-copy">
            <h1>
              Build together.
              <br />
              Ship with clarity.
            </h1>
            <div className="landing-hero-action">
              <Link className="landing-button landing-button-light" to="/start">
                Get Started
                <ChevronRight size={14} />
              </Link>
            </div>
            <p>Philippine software agency and client workspace. One shared place from brief to launch.</p>
          </div>
        </div>
      </section>

      <section className="landing-piece" id="piece">
        <div className="landing-piece-inner">
          <img src="/landing/icon/missing-piece.png" alt="" />
          <div>
            <p className="landing-kicker">The gap</p>
            <h3>Three pieces already exist. The system is the fourth.</h3>
            <p>
              Paper, Viber, tally sheets. We drop in the missing piece — software plus the
              tablet, printer, and TV already on the counter.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-capability" id="service">
        <h3>Every surface you need to run the work.</h3>
        <p>
          Strategy, design, development, and support live in one studio. The client workspace
          keeps the same truth on both sides of the table.
        </p>
        <div className="landing-capability-grid">
          {capability.map(({ title, copy, icon }) => (
            <div className="landing-capability-item" key={title}>
              <img src={icon} alt="" />
              <div>
                <strong>{title}</strong>
                <small>{copy}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-floor" id="floor">
        <p className="landing-kicker">Built for the floor</p>
        <h3>Clinic, café, shop. The counter on a Saturday night.</h3>
        <p>
          We sit with paper, Viber, and tally sheets. Then we ship software plus the
          tablet, printer, and TV already there.
        </p>
        <div className="landing-floor-grid">
          {floor.map((item) => (
            <article className="landing-floor-card" key={item.title}>
              <img src={item.icon} alt="" />
              <h4>{item.title}</h4>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
        <div className="landing-floor-cta">
          <Link className="landing-button landing-button-primary" to="/start">
            Start a project
          </Link>
        </div>
      </section>

      <section className="landing-manifesto">
        <h2>
          A new kind of studio toolkit: website, client hub, admin, and the hardware
          on the floor, so Philippine teams can ship with clarity.
        </h2>
      </section>

      <section className="landing-showcase" id="showcase" aria-label="ADVO workspace preview">
        <div className="landing-app-shell">
          <aside className="landing-app-side">
            <img src="/advo-logo-black.png" alt="ADVO" />
            <div className="landing-search">Search anything...</div>
            {["Overview", "Projects", "Tasks", "Clients", "Team", "Invoices", "Approvals"].map((label, index) => (
              <div className={index === 0 ? "landing-app-nav active" : "landing-app-nav"} key={label}>
                {label}
              </div>
            ))}
          </aside>
          <div className="landing-app-main">
            <div className="landing-app-top">
              <span>Workspace overview</span>
              <div className="landing-avatar">AM</div>
            </div>
            <div className="landing-app-heading">
              <div>
                <small>Your projects, workload, approvals, and financials at a glance.</small>
                <h3>Overview</h3>
              </div>
              <button type="button">+ New project</button>
            </div>
            <div className="landing-app-stat">
              <div><small>Active projects</small><strong>24</strong></div>
              <div><small>Total tasks</small><strong>1,284</strong></div>
              <div><small>Pending approvals</small><strong>32</strong></div>
              <div><small>Outstanding invoices</small><strong>₱48,291</strong></div>
            </div>
            <div className="landing-app-grid">
              <div className="landing-chart-card">
                <div><strong>Workload</strong><span>May 5–11</span></div>
                <ResponsiveContainer width="100%" height={145}>
                  <AreaChart data={chartPoint}>
                    <defs>
                      <linearGradient id="velocity" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0c0c0c" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="#0c0c0c" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip contentStyle={{ fontSize: 10, borderRadius: 8 }} />
                    <Area type="monotone" dataKey="value" stroke="#0c0c0c" strokeWidth={1.5} fill="url(#velocity)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="landing-approval">
                <div><strong>Client approval queue</strong><span>View all</span></div>
                {["Makati Health Dept.", "Lattan Logistics", "Duluy PH"].map((item) => (
                  <p key={item}><span>{item}</span></p>
                ))}
              </div>
              <div className="landing-activity">
                <div><strong>Recent activity</strong><span>View all</span></div>
                {["Brand direction approved", "Client notes received", "Homepage build shipped", "Invoice marked paid"].map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-tool" id="work">
        <h3>The surfaces we ship with</h3>
        <div className={reduceMotion ? "landing-tool-rail is-static" : "landing-tool-rail"}>
          {toolCard.map((card, index) => (
            <article key={card.title}>
              {card.href.startsWith("http") ? (
                <a href={card.href} target="_blank" rel="noopener noreferrer">
                  <div className="landing-tool-media">
                    <img src={card.image} alt="" />
                    {index === 0 ? (
                      <span>
                        Try now <ChevronRight size={12} />
                      </span>
                    ) : null}
                  </div>
                  <h4>{card.title}</h4>
                  <p>{card.desc}</p>
                  <div className="landing-tool-cta">
                    <span className="landing-chip-dark">{card.cta}</span>
                    {card.more ? <span className="landing-chip-line">Learn more</span> : null}
                  </div>
                </a>
              ) : card.href.startsWith("/") ? (
                <Link to={card.href}>
                  <div className="landing-tool-media">
                    <img src={card.image} alt="" />
                    {index === 0 ? (
                      <span>
                        Try now <ChevronRight size={12} />
                      </span>
                    ) : null}
                  </div>
                  <h4>{card.title}</h4>
                  <p>{card.desc}</p>
                  <div className="landing-tool-cta">
                    <span className="landing-chip-dark">{card.cta}</span>
                    {card.more ? <span className="landing-chip-line">Learn more</span> : null}
                  </div>
                </Link>
              ) : (
                <a href={card.href}>
                  <div className="landing-tool-media">
                    <img src={card.image} alt="" />
                  </div>
                  <h4>{card.title}</h4>
                  <p>{card.desc}</p>
                  <div className="landing-tool-cta">
                    <span className="landing-chip-dark">{card.cta}</span>
                    {card.more ? <span className="landing-chip-line">Learn more</span> : null}
                  </div>
                </a>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="landing-usecase" id="process">
        <div className="landing-usecase-tab">
          {useCase.map((item, index) => (
            <button
              type="button"
              key={item.title}
              className={index === useCaseIndex ? "is-active" : ""}
              onClick={() => setUseCaseIndex(index)}
            >
              {item.title}
            </button>
          ))}
        </div>
        <div className="landing-usecase-body">
          <div>
            <h3>{current.heading}</h3>
            <p>{current.desc}</p>
            <div className="landing-usecase-chip">
              {current.chip.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          </div>
          <div className="landing-before-after">
            <figure>
              <img src="/landing/rw/before.jpg" alt="Before" />
              <figcaption>Before</figcaption>
            </figure>
            <figure>
              <img src="/landing/rw/after.jpg" alt="After" />
              <figcaption>After</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="landing-marquee" aria-label="Integrations">
        <div className={reduceMotion ? "landing-marquee-track is-static" : "landing-marquee-track"}>
          {[...partner, ...partner, ...partner].map((item, index) => (
            <span className="landing-marquee-item" key={`${item.name}-${index}`}>
              <img src={item.asset} alt="" />
              {item.name}
            </span>
          ))}
        </div>
      </section>

      <section className="landing-story">
        <p className="landing-kicker">Customer Stories</p>
        <div className="landing-story-grid">
          <article>
            <div className="landing-story-media">
              <img src="/landing/rw/story.jpg" alt="" />
            </div>
            <p className="landing-kicker">Customer Stories</p>
            <h4>Fourlinq is live at fourlinq.ph. Shipped June 19, 2026. The only named public client on this page.</h4>
            <a href="https://fourlinq.ph" target="_blank" rel="noopener noreferrer">
              Read More
            </a>
          </article>
          <article>
            <div className="landing-story-media">
              <img src="/landing/rw/hero.jpg" alt="" />
            </div>
            <p className="landing-kicker">Floor</p>
            <h4>Software plus the tablet, printer, and TV already on the counter, not a seat in the cloud.</h4>
            <Link to="/start">Start a project</Link>
          </article>
          <article>
            <div className="landing-story-media">
              <img src="/team/group.jpg" alt="The ADVO team" />
            </div>
            <p className="landing-kicker">Studio</p>
            <h4>A Philippine product-engineering team. Faces, not stock. The people who show up on the floor.</h4>
            <Link to="/team">Meet the team</Link>
          </article>
        </div>
      </section>

      <section className="landing-surface">
        <h3>Apps for Everything</h3>
        <p>Use-case surfaces designed so a client, an operator, and the studio share one system.</p>
        <div className="landing-surface-grid">
          {visibleSurface.map((item) =>
            item.href.startsWith("http") ? (
              <a className="landing-surface-card" key={item.title} href={item.href} target="_blank" rel="noopener noreferrer">
                <img className="landing-surface-icon" src={item.icon} alt="" />
                <h4>{item.title}</h4>
                <p>{item.desc}</p>
                <img className="landing-surface-thumb" src={item.thumb} alt="" />
              </a>
            ) : item.href.startsWith("/") ? (
              <Link className="landing-surface-card" key={item.title} to={item.href}>
                <img className="landing-surface-icon" src={item.icon} alt="" />
                <h4>{item.title}</h4>
                <p>{item.desc}</p>
                <img className="landing-surface-thumb" src={item.thumb} alt="" />
              </Link>
            ) : (
              <a className="landing-surface-card" key={item.title} href={item.href}>
                <img className="landing-surface-icon" src={item.icon} alt="" />
                <h4>{item.title}</h4>
                <p>{item.desc}</p>
                <img className="landing-surface-thumb" src={item.thumb} alt="" />
              </a>
            ),
          )}
        </div>
        <div className="landing-surface-pager">
          <button type="button" aria-label="Previous" onClick={() => setSurfacePage((page) => (page - 1 + surfacePageCount) % surfacePageCount)}>
            <ChevronLeft size={18} />
          </button>
          <span>
            {surfacePage + 1} / {surfacePageCount}
          </span>
          <button type="button" aria-label="Next" onClick={() => setSurfacePage((page) => (page + 1) % surfacePageCount)}>
            <ChevronRight size={18} />
          </button>
        </div>
      </section>

      <section className="landing-workflow-section" id="workflow">
        <h3>
          From inquiry
          <br />
          to the floor.
        </h3>
        <p>Inquiry to launch, chained as one sequence: brief, scope, build, review, live.</p>
        <Link className="landing-chip-line" to="/start">
          Start a project
        </Link>
        <div className="landing-node-row">
          <article className="landing-node">
            <header>Inquiry</header>
            <p>Tell us what the floor needs to do on a Saturday night.</p>
          </article>
          <article className="landing-node">
            <header>Scope</header>
            <img src="/landing/rw/plan.jpg" alt="" />
          </article>
          <article className="landing-node">
            <header>Build</header>
            <img src="/landing/rw/create.jpg" alt="" />
            <footer>
              <span>workspace</span>
              <span className="landing-node-run">Run</span>
            </footer>
          </article>
          <article className="landing-node">
            <header>Review</header>
            <img src="/landing/rw/approve.jpg" alt="" />
          </article>
          <article className="landing-node">
            <header>Launch</header>
            <img src="/landing/rw/deliver.jpg" alt="" />
            <footer>
              <span>live</span>
              <span className="landing-node-run">Run</span>
            </footer>
          </article>
        </div>
      </section>

      <section className="landing-engagement" id="engagement">
        <img className="landing-engagement-mark" src="/landing/icon/pricing.png" alt="" />
        <h3>Flexible ways to work together.</h3>
        <div className="landing-engagement-grid">
          {engagement.map((item) => (
            <article key={item.title}>
              <h4>{item.title}</h4>
              <p>{item.copy}</p>
              <small>{item.suffix}</small>
              <strong>{item.price}</strong>
              <Link to="/start">{item.action}</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-faq" id="faq">
        <h3>Got questions?</h3>
        <div className="landing-faq-list">
          {faq.map(({ question, answer }, index) => (
            <div className={faqOpen === index ? "is-open" : ""} key={question}>
              <button type="button" onClick={() => setFaqOpen(faqOpen === index ? -1 : index)} aria-expanded={faqOpen === index}>
                <span>{question}</span>
                <ChevronDown size={16} />
              </button>
              <p>{answer}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="landing-footer" id="footer">
        <div className="landing-footer-grid">
          {footerCol.map((col) => (
            <div key={col.title}>
              <h3>{col.title}</h3>
              {col.link.map((item) =>
                item.href.startsWith("http") ? (
                  <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer">
                    {item.label}
                    {item.ext ? <span> ↗</span> : null}
                  </a>
                ) : item.href.startsWith("/") ? (
                  <Link key={item.label} to={item.href}>
                    {item.label}
                  </Link>
                ) : (
                  <a key={item.label} href={item.href}>
                    {item.label}
                  </a>
                ),
              )}
            </div>
          ))}
        </div>
        <div className="landing-footer-bar">
          <div>
            <img src="/advo-logo-black.png" alt="ADVO" />
            <p>
              © 2026 ADVO /{" "}
              <Link to="/start">Contact</Link> / Built with care in the Philippines.
            </p>
          </div>
          <div className="landing-social">
            {socialLink.map((link) => {
              const Icon = socialIcon[link.icon] || IconWorld;
              return (
                <a
                  key={link.label}
                  href={link.href}
                  target={link.href.startsWith("mailto:") ? undefined : "_blank"}
                  rel={link.href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
                  aria-label={link.label}
                >
                  <Icon size={16} stroke={1.4} />
                </a>
              );
            })}
          </div>
        </div>
      </footer>
    </main>
  );
};

export default LandingPage;
