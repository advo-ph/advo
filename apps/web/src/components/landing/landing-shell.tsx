import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
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
import { ChevronDown, Menu, X } from "lucide-react";
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

interface NavItem {
  label: string;
  href: string;
  panel?: { label: string; href: string }[];
}

const navItem: NavItem[] = [
  {
    label: "Product",
    href: "/#showcase",
    panel: [
      { label: "Client Hub", href: "/login" },
      { label: "Admin", href: "/login" },
      { label: "Workspace", href: "/#showcase" },
      { label: "Start a project", href: "/start" },
    ],
  },
  {
    label: "Services",
    href: "/#service",
    panel: [
      { label: "Strategy", href: "/#service" },
      { label: "Design", href: "/#service" },
      { label: "Development", href: "/#service" },
      { label: "Support", href: "/#service" },
    ],
  },
  { label: "Work", href: "/#work" },
  { label: "Process", href: "/#process" },
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

const footerCol = [
  {
    title: "Product",
    link: [
      { label: "Client Hub", href: "/login" },
      { label: "Admin", href: "/login" },
      { label: "Workspace", href: "/#showcase" },
      { label: "Start a project", href: "/start" },
      { label: "Log in", href: "/login" },
    ],
  },
  {
    title: "Services",
    link: [
      { label: "Strategy", href: "/#service" },
      { label: "Design", href: "/#service" },
      { label: "Development", href: "/#service" },
      { label: "Support", href: "/#service" },
    ],
  },
  {
    title: "Company",
    link: [
      { label: "Team", href: "/team" },
      { label: "Process", href: "/#process" },
      { label: "Work", href: "/#work" },
      { label: "Pricing", href: "/#engagement" },
      { label: "Contact", href: "/start" },
    ],
  },
  {
    title: "Resources",
    link: [
      { label: "FAQs", href: "/#faq" },
      { label: "Fourlinq", href: "https://fourlinq.ph" },
      { label: "Client Hub", href: "/login" },
    ],
  },
];

const LandingShell = ({ children }: LandingShellProps) => {
  const reduceMotion = useReducedMotion();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const [socialLink, setSocialLink] = useState<SocialLink[]>(socialDefault);

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

  const closeMenu = () => {
    setIsMenuOpen(false);
    setOpenPanel(null);
  };

  return (
    <div className={reduceMotion ? "landing-page landing-shell is-reduce-motion" : "landing-page landing-shell"}>
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <Link className="landing-brand" to="/" aria-label="ADVO home" onClick={closeMenu}>
            <img src="/advo-logo-black.png" alt="ADVO" />
          </Link>
          <nav className={isMenuOpen ? "landing-nav-link is-open" : "landing-nav-link"} aria-label="Main navigation">
            {navItem.map((item) => (
              <div
                className="landing-nav-item"
                key={item.label}
                onMouseEnter={() => item.panel && setOpenPanel(item.label)}
                onMouseLeave={() => setOpenPanel(null)}
              >
                <Link to={item.href} onClick={closeMenu}>
                  {item.label}
                  {item.panel ? (
                    <ChevronDown className={openPanel === item.label ? "is-open" : ""} size={14} />
                  ) : null}
                </Link>
                {item.panel && openPanel === item.label ? (
                  <div className="landing-nav-panel">
                    {item.panel.map((link) => (
                      <Link key={link.label} to={link.href} onClick={closeMenu}>
                        {link.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </nav>
          <div className="landing-nav-action">
            <Link className="landing-login landing-login-wide" to="/team" onClick={closeMenu}>
              Team
            </Link>
            <Link className="landing-login" to="/login" onClick={closeMenu}>
              Log in
            </Link>
            <Link className="landing-button landing-button-primary landing-button-small" to="/start" onClick={closeMenu}>
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

      <div className="landing-shell-body">{children}</div>

      <footer className="landing-footer">
        <div className="landing-footer-grid">
          {footerCol.map((col) => (
            <div key={col.title}>
              <h3>{col.title}</h3>
              {col.link.map((item) =>
                item.href.startsWith("http") ? (
                  <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer">
                    {item.label}
                  </a>
                ) : (
                  <Link key={item.label} to={item.href}>
                    {item.label}
                  </Link>
                ),
              )}
            </div>
          ))}
        </div>
        <div className="landing-footer-bar">
          <div>
            <img src="/advo-logo-black.png" alt="ADVO" />
            <p>
              © 2026 ADVO / <Link to="/start">Contact</Link> / Built with care in the Philippines.
            </p>
          </div>
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
                  <Icon size={16} stroke={1.4} />
                </a>
              );
            })}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingShell;
