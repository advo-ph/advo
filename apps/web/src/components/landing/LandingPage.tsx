import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  IconArrowRight,
  IconBrandGithub,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandX,
  IconBriefcase,
  IconBuilding,
  IconCalendarCheck,
  IconChevronDown,
  IconCheck,
  IconCheckbox,
  IconCode,
  IconCompass,
  IconFileDescription,
  IconFileInvoice,
  IconGridDots,
  IconHeartFilled,
  IconLayoutDashboard,
  IconListCheck,
  IconMail,
  IconMessageCircle,
  IconReceipt,
  IconRocket,
  IconUsers,
} from "@tabler/icons-react";
import {
  ArrowRight,
  Lightbulb,
  Menu,
  Search,
  X,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import "./landing-page.css";

const feature = [
  { title: "Plan", copy: "Capture briefs, set timelines, and align on scope and milestones.", asset: "/landing/feature-plan.png" },
  { title: "Create", copy: "Design, develop, and collaborate in one clear, shared place.", asset: "/landing/feature-create.png" },
  { title: "Approve", copy: "Share work, gather feedback, and get client sign-off faster.", asset: "/landing/feature-approve.png" },
  { title: "Deliver", copy: "Handoff, launch, and bill without the back-and-forth.", asset: "/landing/feature-deliver.png" },
];

const service = [
  { title: "Strategy", copy: "We align goals, research markets, and define the right plan.", asset: "/landing/service-strategy.png" },
  { title: "Design", copy: "We craft brands, UI/UX, and content that connect and convert.", asset: "/landing/service-design.png" },
  { title: "Development", copy: "We build fast, scalable, secure digital experiences.", asset: "/landing/service-development.png" },
  { title: "Support", copy: "We stay with you to maintain, improve, and help you grow.", asset: "/landing/service-support.png" },
];

const phase = [
  { number: "Step 1", title: "Discover & Plan", copy: "We learn your goals, analyze your market, and plan the right solution.", Icon: IconCompass },
  { number: "Step 2", title: "Design & Build", copy: "We design, develop, and integrate everything with quality and speed.", Icon: IconBriefcase },
  { number: "Step 3", title: "Review & Launch", copy: "We test, refine, launch with you, and keep improving.", Icon: IconRocket },
];

const workflow = [
  { title: "Inquiry", copy: "Tell us what you need to achieve.", Icon: IconMessageCircle },
  { title: "Scope", copy: "We define the plan, timeline, and budget.", Icon: IconFileDescription },
  { title: "Build", copy: "We design, develop, and bring it to life.", Icon: IconCode },
  { title: "Review", copy: "You review, we refine, and finalize.", Icon: IconCheck },
  { title: "Launch", copy: "We launch and support your growth.", Icon: IconRocket },
];

const metric = [
  { value: "50+", label: "Projects delivered" },
  { value: "98%", label: "Client satisfaction" },
  { value: "7+", label: "Disciplines connected" },
  { value: "24h", label: "Average response time" },
];

const integration = [
  { name: "Gmail", asset: "/landing/integration/gmail.svg", copy: "Turn important emails into actionable items without leaving your workspace." },
  { name: "Google Calendar", asset: "/landing/integration/google-calendar.svg", copy: "Sync meetings, events, and schedules so your workflow always reflects real-time availability." },
  { name: "Notion", asset: "/landing/integration/notion.svg", copy: "Keep projects, tasks, and documentation aligned with your workflow structure." },
  { name: "Slack", asset: "/landing/integration/slack.svg", copy: "Bring conversations and updates directly into your system without switching context." },
  { name: "Trello", asset: "/landing/integration/trello.svg", copy: "Connect boards and tasks to ensure your planning stays consistent across tools." },
  { name: "Google Drive", asset: "/landing/integration/google-drive.svg", copy: "Access files, documents, and shared resources exactly where your work happens." },
  { name: "Zoom", asset: "/landing/integration/zoom.svg", copy: "Automatically connect meetings, calls, and scheduled events to your workflow." },
  { name: "Asana", asset: "/landing/integration/asana.svg", copy: "Keep tasks, deadlines, and team projects synchronized from planning to execution." },
  { name: "Microsoft Teams", asset: "/landing/integration/microsoft-teams.svg", copy: "Coordinate communication, meetings, and collaboration from a single connected workspace." },
];

const engagement = [
  { title: "Project", copy: "Fixed scope, timeline, and deliverables.", price: "₱60,000", suffix: "Starting at", priceSuffix: "", action: "Get a quote", asset: "/landing/engagement-project-card.png" },
  { title: "Retainer", copy: "Dedicated team for ongoing work.", price: "₱80,000", suffix: "Starting at", priceSuffix: "/mo", action: "Book a call", asset: "/landing/engagement-retainer-card.png" },
  { title: "Hourly Support", copy: "On-demand help when you need it.", price: "₱800", suffix: "Starting at", priceSuffix: "/hr", action: "Request access", asset: "/landing/engagement-hourly-card.png" },
  { title: "Enterprise", copy: "Custom solutions for large teams.", price: "Custom", suffix: "", priceSuffix: "", action: "Contact us", asset: "/landing/engagement-enterprise-card.png" },
];

const faq = [
  { question: "How does the ADVO workspace work?", answer: "Every project has one shared workspace for scope, files, milestones, feedback, approvals, and delivery—so your team and ours always see the same truth." },
  { question: "Can I invite my team and client to the workspace?", answer: "Yes. Invite collaborators by role and control what internal teams, partners, and clients can view or update." },
  { question: "What's included in the project fee?", answer: "Your proposal defines the agreed strategy, design, development, project management, revisions, and launch support before work begins." },
  { question: "How do payments and invoicing work?", answer: "Projects use clear milestone billing. Retainers and support plans are invoiced on a recurring schedule with transparent activity records." },
  { question: "Do you provide ongoing support after launch?", answer: "Yes. Choose a retainer or hourly support plan for continuous optimization, fixes, reporting, and new feature work." },
];

const chartPoint = [
  { name: "Jan", value: 24 }, { name: "Feb", value: 30 }, { name: "Mar", value: 28 },
  { name: "Apr", value: 44 }, { name: "May", value: 40 }, { name: "Jun", value: 58 },
  { name: "Jul", value: 52 }, { name: "Aug", value: 71 }, { name: "Sep", value: 82 },
];

const floatCard = [
  { className: "task", label: "Tasks completed", value: "1,284", change: "+18% from last month", Icon: IconCheckbox, delay: 0 },
  { className: "approval", label: "Pending approvals", value: "32", change: "+4% from last week", Icon: IconCalendarCheck, delay: .45 },
  { className: "member", label: "Team members", value: "32", change: "+4% from last month", Icon: IconUsers, delay: .9 },
  { className: "invoice", label: "Outstanding invoices", value: "₱48,291", change: "+23% from last month", Icon: IconReceipt, delay: 1.35 },
];

const SectionLabel = ({ children }: { children: React.ReactNode }) => <span className="landing-eyebrow">{children}</span>;

const LandingPage = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(0);
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterSent, setNewsletterSent] = useState(false);
  const reduceMotion = useReducedMotion();

  const reveal = reduceMotion
    ? { initial: false as const, animate: {} }
    : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 } };

  return (
    <main className="landing-page">
      <motion.header className="landing-nav" initial={reduceMotion ? false : { opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45, ease: [0.22, 1, 0.36, 1] }}>
        <a className="landing-brand" href="#top" aria-label="ADVO home">
          <img src="/advo-logo-black.png" alt="ADVO" />
        </a>
        <nav className={menuOpen ? "landing-nav-link is-open" : "landing-nav-link"} aria-label="Main navigation">
          <a href="#service" onClick={() => setMenuOpen(false)}>Services</a>
          <a href="#process" onClick={() => setMenuOpen(false)}>Process</a>
          <a href="#work" onClick={() => setMenuOpen(false)}>Work</a>
          <a href="#engagement" onClick={() => setMenuOpen(false)}>Pricing</a>
        </nav>
        <div className="landing-nav-action">
          <Link className="landing-login" to="/login">Log in <IconArrowRight size={14} stroke={1.6} /></Link>
          <Link className="landing-button landing-button-primary landing-button-small" to="/start"><img className="landing-button-mark" src="/favicon.ico" alt="" aria-hidden="true" />Start a project <IconArrowRight size={14} stroke={1.6} /></Link>
          <button className="landing-menu" onClick={() => setMenuOpen((value) => !value)} aria-label="Toggle navigation" aria-expanded={menuOpen}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </motion.header>

      <motion.section className="landing-hero" id="top" initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: reduceMotion ? 0 : .09, delayChildren: .12 } } }}>
        <motion.div className="landing-hero-kicker" variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: .42 } } }}>PH software agency &amp; client workspace</motion.div>
        <motion.h1 variants={{ hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0, transition: { duration: .55, ease: [0.22, 1, 0.36, 1] } } }}>Build together.<br />Ship with <em>clarity.</em></motion.h1>
        <motion.p variants={{ hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: .48 } } }}>ADVO helps teams plan, build, and deliver digital products<br className="landing-desktop-break" /> inside one connected workspace.</motion.p>
        <motion.div className="landing-hero-action" variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: .45 } } }}>
          <Link className="landing-button landing-button-primary" to="/start"><img className="landing-button-mark" src="/favicon.ico" alt="" aria-hidden="true" />Start a project <IconArrowRight size={16} stroke={1.6} /></Link>
          <a className="landing-button landing-button-secondary" href="#work"><img className="landing-button-mark" src="/favicon.ico" alt="" aria-hidden="true" />See the workspace</a>
        </motion.div>
      </motion.section>

      <motion.section className="landing-showcase" id="showcase" aria-label="ADVO workspace preview" {...reveal} transition={{ duration: .7, delay: reduceMotion ? 0 : .28, ease: [0.22, 1, 0.36, 1] }}>
        <motion.img className="landing-showcase-texture" src="/landing/showcase-texture.png" alt="" animate={reduceMotion ? undefined : { scale: [1.01, 1.035, 1.01], x: [-5, 5, -5] }} transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }} />
        {floatCard.map(({ className, label, value, change, Icon, delay }) => (
          <motion.div
            className={`landing-float-card ${className}`}
            key={label}
            initial={reduceMotion ? false : { opacity: 0, y: 16, scale: .96 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: [0, -7, 0], scale: 1 }}
            transition={{ opacity: { duration: .4, delay: .55 + delay }, scale: { duration: .4, delay: .55 + delay }, y: { duration: 4.5 + delay, delay: .9 + delay, repeat: Infinity, ease: "easeInOut" } }}
          >
            <div><Icon size={15} /><span>{label}</span></div><strong>{value}</strong><small>{change}</small>
          </motion.div>
        ))}
        <motion.div className="landing-app-shell" initial={reduceMotion ? false : { opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, delay: reduceMotion ? 0 : .35, ease: [0.22, 1, 0.36, 1] }}>
          <aside className="landing-app-side">
            <img src="/advo-logo-black.png" alt="ADVO" />
            <div className="landing-search"><Search size={12} /> Search anything...</div>
            {[
              ["Overview", IconLayoutDashboard], ["Projects", IconBriefcase], ["Tasks", IconListCheck],
              ["Clients", IconBuilding], ["Team", IconUsers], ["Invoices", IconFileInvoice], ["Approvals", IconCheckbox],
            ].map(([label, Icon], index) => {
              const TypedIcon = Icon as typeof IconLayoutDashboard;
              return <div className={index === 0 ? "landing-app-nav active" : "landing-app-nav"} key={label as string}><TypedIcon size={13} stroke={1.55} />{label as string}</div>;
            })}
          </aside>
          <div className="landing-app-main">
            <div className="landing-app-top"><span>Workspace overview</span><div className="landing-avatar">AM</div></div>
            <div className="landing-app-heading"><div><small>Your projects, workload, approvals, and financials at a glance.</small><h3>Overview</h3></div><button>+ New project</button></div>
            <div className="landing-app-stat">
              <div><small>Active projects</small><strong>24</strong><span>+2 new</span></div>
              <div><small>Total tasks</small><strong>1,284</strong><span>+18% this week</span></div>
              <div><small>Pending approvals</small><strong>32</strong><span>+4% this week</span></div>
              <div><small>Outstanding invoices</small><strong>₱48,291</strong><span>+23% over due</span></div>
            </div>
            <div className="landing-app-grid">
              <div className="landing-chart-card">
                <div><strong>Workload</strong><span>May 5–11</span></div>
                <ResponsiveContainer width="100%" height={145}>
                  <AreaChart data={chartPoint}><defs><linearGradient id="velocity" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff5b22" stopOpacity={0.28}/><stop offset="100%" stopColor="#ff5b22" stopOpacity={0}/></linearGradient></defs><Tooltip contentStyle={{ fontSize: 10, borderRadius: 0 }} /><Area type="monotone" dataKey="value" stroke="#ff5b22" strokeWidth={2} fill="url(#velocity)" /></AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="landing-approval"><div><strong>Client approval queue</strong><span>View all</span></div>{["Makati Health Dept.", "Lattan Logistics", "Duluy PH"].map((item, index) => <p key={item}><i className={`tone-${index}`} /><span>{item}<small>{index + 1} item{index ? "s" : ""}</small></span><IconArrowRight size={10} stroke={1.5} /></p>)}</div>
              <div className="landing-activity"><div><strong>Recent activity</strong><span>View all</span></div>{["Brand direction approved", "Client notes received", "Homepage build shipped", "Invoice marked paid"].map((item, index) => <p key={item}><i className={`tone-${index}`} />{item}<small>{index + 1}h</small></p>)}</div>
            </div>
          </div>
        </motion.div>
      </motion.section>

      <section className="landing-section" id="work">
        <motion.div className="landing-section-head" initial={reduceMotion ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .6 }} transition={{ duration: .5, ease: [0.22, 1, 0.36, 1] }}><div><SectionLabel>Features</SectionLabel><h2>Everything your agency needs<br />in one workspace</h2><p>Built to support every stage of your workflow and every member of your team.</p></div></motion.div>
        <div className="landing-feature-grid">{feature.map(({ title, copy, asset }, index) => (
          <motion.article
            className="landing-feature-card"
            key={title}
            initial={reduceMotion ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            whileHover={reduceMotion ? undefined : { y: -5 }}
            viewport={{ once: true, amount: .35 }}
            transition={{ duration: .5, delay: reduceMotion ? 0 : index * .07, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="landing-illustration-stage">
              <motion.img
                src={asset}
                alt={`${title} workflow illustration`}
                animate={reduceMotion ? undefined : { y: [0, -4, 0] }}
                transition={{ duration: 4.6 + index * .45, delay: index * .35, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
            <h3>{title}</h3><p>{copy}</p>
          </motion.article>
        ))}</div>
      </section>

      <section className="landing-section landing-service" id="service">
        <motion.div className="landing-service-row" initial={reduceMotion ? false : { opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .3 }} transition={{ duration: .55, ease: [0.22, 1, 0.36, 1] }}><div className="landing-side-copy"><SectionLabel>Services</SectionLabel><h2>Everything you need,<br />built in-house.</h2><p>A full-service team that works together to deliver results.</p></div><div className="landing-service-grid">{service.map(({ title, copy, asset }, index) => (
          <motion.article className="landing-compact-card" key={title} initial={reduceMotion ? false : { opacity: 0, x: 18 }} whileInView={{ opacity: 1, x: 0 }} whileHover={reduceMotion ? undefined : { y: -4 }} viewport={{ once: true, amount: .45 }} transition={{ duration: .45, delay: reduceMotion ? 0 : index * .07, ease: [0.22, 1, 0.36, 1] }}>
            <div className="landing-service-art"><motion.img src={asset} alt={`${title} service illustration`} animate={reduceMotion ? undefined : { y: [0, -3, 0] }} transition={{ duration: 4.8 + index * .4, delay: index * .3, repeat: Infinity, ease: "easeInOut" }} /></div><h3>{title}</h3><p>{copy}</p>
          </motion.article>
        ))}</div></motion.div>
        <motion.div className="landing-service-row landing-process-row" id="process" initial={reduceMotion ? false : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .35 }} transition={{ duration: .55, ease: [0.22, 1, 0.36, 1] }}><div className="landing-side-copy"><SectionLabel>Process</SectionLabel><h2>A clear process<br />from start to launch.</h2><p>Simple steps. Transparent updates. Better outcomes.</p></div><div className="landing-phase-grid">{phase.map(({ number, title, copy, Icon }, index) => (
          <motion.article className="landing-phase-card" key={title} initial={reduceMotion ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} whileHover={reduceMotion ? undefined : { y: -3 }} viewport={{ once: true, amount: .5 }} transition={{ duration: .42, delay: reduceMotion ? 0 : index * .08 }}><div><Icon size={24} stroke={1.45} /><span>{number}</span></div><h3>{title}</h3><p>{copy}</p></motion.article>
        ))}</div></motion.div>
      </section>

      <section className="landing-section landing-workflow-section" id="workflow">
        <motion.div className="landing-workflow-row" initial={reduceMotion ? false : { opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .4 }} transition={{ duration: .55, ease: [0.22, 1, 0.36, 1] }}>
          <div className="landing-side-copy"><SectionLabel>Our process</SectionLabel><h2>From inquiry<br />to launch.</h2><p>A proven workflow that keeps your project moving and your team aligned.</p></div>
          <motion.div className="landing-workflow" initial={reduceMotion ? false : "hidden"} whileInView="visible" viewport={{ once: true, amount: .55 }} variants={{ hidden: {}, visible: { transition: { staggerChildren: .1 } } }}>{workflow.map(({ title, copy, Icon }, index) => (
            <motion.article key={title} variants={{ hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: .42, ease: [0.22, 1, 0.36, 1] } } }} whileHover={reduceMotion ? undefined : { y: -3 }}>
              <motion.div className={index === workflow.length - 1 ? "landing-workflow-icon final" : "landing-workflow-icon"} animate={reduceMotion ? undefined : { y: [0, -2, 0] }} transition={{ duration: 3.8, delay: index * .32, repeat: Infinity, ease: "easeInOut" }}><Icon size={28} stroke={1.35} /></motion.div>
              <h3>{title}</h3><p>{copy}</p>{index < workflow.length - 1 && <motion.span className="landing-workflow-arrow" variants={{ hidden: { opacity: 0, x: -7 }, visible: { opacity: 1, x: 0, transition: { duration: .3 } } }}><IconArrowRight size={18} stroke={1.25} /></motion.span>}
            </motion.article>
          ))}</motion.div>
        </motion.div>
      </section>

      <motion.section className="landing-metric" id="metric" initial={reduceMotion ? false : "hidden"} whileInView="visible" viewport={{ once: true, amount: .65 }} variants={{ hidden: {}, visible: { transition: { staggerChildren: .09 } } }}>{metric.map(({ value, label }) => <motion.div key={label} variants={{ hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: .42, ease: [0.22, 1, 0.36, 1] } } }}><strong>{value}</strong><span>{label}</span></motion.div>)}</motion.section>

      <section className="landing-section landing-integration" id="integration">
        <motion.div className="landing-integration-intro" initial={reduceMotion ? false : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .45 }} transition={{ duration: .55, ease: [0.22, 1, 0.36, 1] }}><div className="landing-integration-art"><motion.img src="/landing/showcase-texture.png" alt="Warm ADVO integration artwork" animate={reduceMotion ? undefined : { scale: [1, 1.025, 1], x: [0, 4, 0] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} /><div><IconGridDots size={30} stroke={1.35} /><span>Integrations</span></div></div><div><SectionLabel>Integrations</SectionLabel><h2>Connect your entire<br />workflow in one place</h2><p>Bring messages, files, meetings, code, and payments into one shared view. ADVO keeps every contributor connected.</p></div></motion.div>
        <motion.div className="landing-integration-grid" initial={reduceMotion ? false : "hidden"} whileInView="visible" viewport={{ once: true, amount: .35 }} variants={{ hidden: {}, visible: { transition: { staggerChildren: .055 } } }}>{integration.map(({ name, asset, copy }) => <motion.article key={name} variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: .38 } } }} whileHover={reduceMotion ? undefined : { y: -3 }}><img src={asset} alt="" aria-hidden="true" /><span>{name}</span><small>{copy}</small></motion.article>)}</motion.div>
        <motion.div className="landing-integration-action" initial={reduceMotion ? false : { opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .8 }}><Link to="/start">View all integrations <IconArrowRight size={14} stroke={1.5} /></Link></motion.div>
      </section>

      <section className="landing-section landing-proof">
        <div className="landing-section-head"><div><SectionLabel>Testimonials</SectionLabel><h2>Trusted by teams<br />that value good work</h2><p>Clear communication, visible progress, and a team that feels like yours.</p></div></div>
        <div className="landing-proof-grid">
          <blockquote><span>“</span><p>ADVO helped us turn a scattered idea into a product our team could actually use. Every decision was visible and the launch felt calm.</p><footer><div>MC</div><cite><strong>Maria Cruz</strong><small>Operations Lead, Northstar</small></cite></footer></blockquote>
          <blockquote><span>“</span><p>The workspace changed the relationship completely. Feedback stopped getting lost and we always knew what was next.</p><footer><div>JL</div><cite><strong>Joshua Lim</strong><small>Founder, Common Ground</small></cite></footer></blockquote>
          <blockquote><span>“</span><p>It feels like having a senior product team beside us—thoughtful, fast, and honest about the tradeoffs that matter.</p><footer><div>AR</div><cite><strong>Andrea Reyes</strong><small>Marketing Director, Fieldwork</small></cite></footer></blockquote>
        </div>
      </section>

      <section className="landing-section landing-engagement" id="engagement">
        <div className="landing-engagement-row">
          <div className="landing-inline-head"><SectionLabel>Engagement options</SectionLabel><h2>Flexible ways to work together.</h2><p>Choose the setup that fits your goals and budget.</p></div>
          <div className="landing-engagement-grid">{engagement.map(({ title, copy, price, suffix, priceSuffix, action, asset }, index) => <article key={title} data-accent={index === 0 ? "muted" : index === 1 ? "orange" : "ink"}><h3>{title}</h3><p>{copy}</p><img className="landing-engagement-icon" src={asset} alt="" aria-hidden="true" /><small>{suffix}</small><strong>{price}{priceSuffix && <em>{priceSuffix}</em>}</strong><Link to="/start">{action}</Link></article>)}</div>
        </div>
      </section>

      <section className="landing-section landing-faq" id="faq">
        <div className="landing-faq-intro"><SectionLabel>FAQ</SectionLabel><h2>Got questions?<br />We've got answers.</h2><motion.img className="landing-faq-illustration" src="/landing/faq-answer.png" alt="Illustrated answer card" animate={reduceMotion ? undefined : { y: [0, -4, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} /></div>
        <div className="landing-faq-list">{faq.map(({ question, answer }, index) => <div className={faqOpen === index ? "is-open" : ""} key={question}><button onClick={() => setFaqOpen(faqOpen === index ? -1 : index)} aria-expanded={faqOpen === index}><span>{question}</span><IconChevronDown size={17} stroke={1.5} /></button><p>{answer}</p></div>)}</div>
      </section>

      <footer className="landing-footer" id="footer">
        <motion.div className="landing-cta" initial={reduceMotion ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .5 }} transition={{ duration: .55, ease: [0.22, 1, 0.36, 1] }}><div><SectionLabel>Ready to start?</SectionLabel><h2>Let’s build something<br /><em>amazing</em> together.</h2><p>Tell us about your project and we'll get back to you within one business day.</p></div><motion.img className="landing-cta-visual" src="/landing/cta-workflow.png" alt="A connected project checklist" animate={reduceMotion ? undefined : { y: [0, -3, 0] }} transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut" }} /><div className="landing-cta-action"><Link className="landing-button landing-button-primary" to="/start"><img className="landing-button-mark" src="/favicon.ico" alt="" aria-hidden="true" />Start a project <IconArrowRight size={15} stroke={1.5} /></Link><a className="landing-button landing-button-secondary" href="#showcase"><img className="landing-button-mark" src="/favicon.ico" alt="" aria-hidden="true" />See the workspace</a></div></motion.div>
        <motion.div className="landing-footer-content" initial={reduceMotion ? false : "hidden"} whileInView="visible" viewport={{ once: true, amount: .25 }} variants={{ hidden: {}, visible: { transition: { staggerChildren: .08 } } }}>
          <motion.div className="landing-footer-brand" variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}><img src="/advo-logo-black.png" alt="ADVO" /><p>Philippine software agency helping teams build better digital products with clarity and care.</p><div className="landing-social"><a href="#" aria-label="ADVO on X"><IconBrandX size={15} stroke={1.4} /></a><a href="#" aria-label="ADVO on LinkedIn"><IconBrandLinkedin size={15} stroke={1.4} /></a><a href="#" aria-label="ADVO on Instagram"><IconBrandInstagram size={15} stroke={1.4} /></a><a href="#" aria-label="ADVO on GitHub"><IconBrandGithub size={15} stroke={1.4} /></a></div></motion.div>
          <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}><h3>Services</h3><a href="#service">Web development</a><a href="#service">Mobile development</a><a href="#service">UI / UX design</a><a href="#service">Systems integration</a></motion.div>
          <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}><h3>Company</h3><a href="#process">How we work</a><a href="#work">Work</a><a href="#engagement">Pricing</a><Link to="/start">Contact</Link></motion.div>
          <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}><h3>Resources</h3><a href="#showcase">Client Hub</a><a href="#workflow">Guides</a><a href="#faq">FAQs</a><a href="#">Status</a></motion.div>
          <motion.div className="landing-newsletter" variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}><h3><IconMail size={12} stroke={1.5} />Subscribe to our newsletter</h3><p>Get updates about our work, tips, and industry insights.</p><form onSubmit={(event) => { event.preventDefault(); setNewsletterSent(true); }}><input type="email" value={newsletterEmail} onChange={(event) => { setNewsletterEmail(event.target.value); setNewsletterSent(false); }} required aria-label="Email address" placeholder="Enter your email" /><button aria-label={newsletterSent ? "Subscribed" : "Subscribe"}>{newsletterSent ? <IconCheck size={17} stroke={1.7} /> : <ArrowRight size={16} />}</button></form>{newsletterSent && <span className="landing-newsletter-success">You're on the list.</span>}</motion.div>
        </motion.div>
        <div className="landing-footer-meta"><span>© 2026 ADVO. All rights reserved.</span><span><IconHeartFilled size={10} /> Built with care in the Philippines.</span></div>
        <img className="landing-landscape" src="/landing/philippine-landscape.png" alt="Illustrated Philippine rice terraces, mountains, and town" />
      </footer>
    </main>
  );
};

export default LandingPage;
