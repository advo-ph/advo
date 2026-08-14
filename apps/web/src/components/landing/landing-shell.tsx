import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  IconArrowRight,
  IconBrandFacebook,
  IconBrandGithub,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandX,
  IconBrandYoutube,
  IconCheck,
  IconHeartFilled,
  IconMail,
  IconWorld,
} from "@tabler/icons-react";
import { ArrowRight, Menu, X } from "lucide-react";
import { get } from "@/lib/api";
import "./landing-page.css";

interface LandingShellProps {
  children: ReactNode;
}

interface SocialLink {
  icon: string;
  href: string;
  label: string;
}

const navLink = [
  { label: "Services", href: "/#service" },
  { label: "Process", href: "/#process" },
  { label: "Work", href: "/#work" },
  { label: "Pricing", href: "/#engagement" },
];

const socialDefault: SocialLink[] = [
  { icon: "Facebook", href: "https://www.facebook.com/share/1DDt8dVJUd/?mibextid=wwXIfr", label: "Facebook" },
  { icon: "Instagram", href: "https://www.instagram.com/advo_ph/", label: "Instagram" },
  { icon: "Linkedin", href: "https://www.linkedin.com/company/advocompany/", label: "LinkedIn" },
  { icon: "Mail", href: "mailto:contact@advo.ph", label: "Email" },
];

const socialIcon: Record<string, typeof IconMail> = {
  Facebook: IconBrandFacebook,
  Instagram: IconBrandInstagram,
  Linkedin: IconBrandLinkedin,
  Mail: IconMail,
  Twitter: IconBrandX,
  X: IconBrandX,
  Youtube: IconBrandYoutube,
  Github: IconBrandGithub,
  Globe: IconWorld,
};

const LandingShell = ({ children }: LandingShellProps) => {
  const reduceMotion = useReducedMotion();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [socialLink, setSocialLink] = useState<SocialLink[]>(socialDefault);
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [isNewsletterSent, setIsNewsletterSent] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await get<{ key: string; value: unknown }[]>("/api/settings/public");
      if (!data) return;
      const setting = data.find((row) => row.key === "social_links");
      if (setting?.value && Array.isArray(setting.value) && setting.value.length > 0) {
        setSocialLink(setting.value as SocialLink[]);
      }
    })();
  }, []);

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <div className={reduceMotion ? "landing-page landing-shell is-reduce-motion" : "landing-page landing-shell"}>
      <header className="landing-nav">
        <Link className="landing-brand" to="/" aria-label="ADVO home" onClick={closeMenu}>
          <img src="/advo-logo-black.png" alt="ADVO" />
        </Link>
        <nav className={isMenuOpen ? "landing-nav-link is-open" : "landing-nav-link"} aria-label="Main navigation">
          {navLink.map((link) => (
            <Link key={link.label} to={link.href} onClick={closeMenu}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="landing-nav-action">
          <Link className="landing-login" to="/login" onClick={closeMenu}>
            Log in <IconArrowRight size={14} stroke={1.6} />
          </Link>
          <Link
            className="landing-button landing-button-primary landing-button-small"
            to="/start"
            onClick={closeMenu}
          >
            <img className="landing-button-mark" src="/favicon.ico" alt="" aria-hidden="true" />
            Start a project <IconArrowRight size={14} stroke={1.6} />
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
      </header>

      <div className="landing-shell-body">{children}</div>

      <footer className="landing-footer">
        <div className="landing-cta">
          <div>
            <span className="landing-eyebrow">Ready to start?</span>
            <h2>
              Let’s build something
              <br />
              <em>amazing</em> together.
            </h2>
            <p>Tell us about your project and we'll get back to you within one business day.</p>
          </div>
          <img className="landing-cta-visual" src="/landing/cta-workflow.png" alt="A connected project checklist" />
          <div className="landing-cta-action">
            <Link className="landing-button landing-button-primary" to="/start">
              <img className="landing-button-mark" src="/favicon.ico" alt="" aria-hidden="true" />
              Start a project <IconArrowRight size={15} stroke={1.5} />
            </Link>
            <Link className="landing-button landing-button-secondary" to="/#showcase">
              <img className="landing-button-mark" src="/favicon.ico" alt="" aria-hidden="true" />
              See the workspace
            </Link>
          </div>
        </div>
        <div className="landing-footer-content">
          <div className="landing-footer-brand">
            <img src="/advo-logo-black.png" alt="ADVO" />
            <p>Philippine software agency helping teams build better digital products with clarity and care.</p>
            <div className="landing-social">
              {socialLink.map((link) => {
                const Icon = socialIcon[link.icon] ?? IconWorld;
                const isMail = link.href.startsWith("mailto:");
                return (
                  <a
                    key={link.label}
                    href={link.href}
                    aria-label={link.label}
                    target={isMail ? undefined : "_blank"}
                    rel={isMail ? undefined : "noopener noreferrer"}
                  >
                    <Icon size={15} stroke={1.4} />
                  </a>
                );
              })}
            </div>
          </div>
          <div>
            <h3>Services</h3>
            <Link to="/#service">Web development</Link>
            <Link to="/#service">Mobile development</Link>
            <Link to="/#service">UI / UX design</Link>
            <Link to="/#service">Systems integration</Link>
          </div>
          <div>
            <h3>Company</h3>
            <Link to="/#process">How we work</Link>
            <Link to="/#work">Work</Link>
            <Link to="/team">Team</Link>
            <Link to="/start">Contact</Link>
          </div>
          <div>
            <h3>Resources</h3>
            <Link to="/login">Client Hub</Link>
            <Link to="/#workflow">Guides</Link>
            <Link to="/#faq">FAQs</Link>
          </div>
          <div className="landing-newsletter">
            <h3>
              <IconMail size={12} stroke={1.5} />
              Subscribe to our newsletter
            </h3>
            <p>Get updates about our work, tips, and industry insights.</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setIsNewsletterSent(true);
              }}
            >
              <input
                type="email"
                value={newsletterEmail}
                onChange={(event) => {
                  setNewsletterEmail(event.target.value);
                  setIsNewsletterSent(false);
                }}
                required
                aria-label="Email address"
                placeholder="Enter your email"
              />
              <button type="submit" aria-label={isNewsletterSent ? "Subscribed" : "Subscribe"}>
                {isNewsletterSent ? <IconCheck size={17} stroke={1.7} /> : <ArrowRight size={16} />}
              </button>
            </form>
            {isNewsletterSent && <span className="landing-newsletter-success">You're on the list.</span>}
          </div>
        </div>
        <div className="landing-footer-meta">
          <span>© 2026 ADVO. All rights reserved.</span>
          <span>
            <IconHeartFilled size={10} /> Built with care in the Philippines.
          </span>
        </div>
        <img
          className="landing-landscape"
          src="/landing/philippine-landscape.png"
          alt="Illustrated Philippine rice terraces, mountains, and town"
        />
      </footer>
    </div>
  );
};

export default LandingShell;
