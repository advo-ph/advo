import { useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { ChevronDown, Menu, X } from "lucide-react";
import LandingFooter from "./landing-footer";
import "./landing-page.css";

interface LandingShellProps {
  children: ReactNode;
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

const LandingShell = ({ children }: LandingShellProps) => {
  const reduceMotion = useReducedMotion();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openPanel, setOpenPanel] = useState<string | null>(null);

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

      <LandingFooter anchorPrefix="/" />
    </div>
  );
};

export default LandingShell;
