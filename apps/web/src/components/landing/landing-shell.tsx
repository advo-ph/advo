import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { ChevronDown, Menu, X } from "lucide-react";
import { useDrawerLock } from "@/hooks/useDrawerLock";
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
  { label: "Quotation", href: "/#engagement" },
];

const LandingShell = ({ children }: LandingShellProps) => {
  const reduceMotion = useReducedMotion();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openPanel, setOpenPanel] = useState<string | null>(null);

  const closeMenu = () => {
    setIsMenuOpen(false);
    setOpenPanel(null);
  };

  // The shell routes (/start /login /team /project/:slug …) mount the same nav
  // drawer as the landing, so they carry the same behaviours — Escape, scroll
  // lock on both scroll containers, focus trap — from the same hook. These
  // routes never got the b401954 restoration because it landed only on
  // LandingPage.
  useDrawerLock(isMenuOpen, closeMenu, "mobile-navigation-drawer");

  // Navigating closes it, same as the landing nav.
  const { pathname } = useLocation();
  useEffect(() => {
    closeMenu();
  }, [pathname]);

  // Hover cannot happen on touch — first activation opens the panel instead of
  // navigating; the second follows the link. Mirrors LandingPage.
  const handlePanelNav = (item: NavItem, event: MouseEvent<HTMLAnchorElement>) => {
    if (!item.panel || openPanel === item.label) {
      closeMenu();
      return;
    }
    event.preventDefault();
    setOpenPanel(item.label);
  };

  return (
    <div className={reduceMotion ? "landing-page landing-shell is-reduce-motion" : "landing-page landing-shell"}>
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <Link className="landing-brand" to="/" aria-label="ADVO home" onClick={closeMenu}>
            <img src="/advo-logo-black.png" alt="ADVO" />
          </Link>
          <nav
            id="mobile-navigation-drawer"
            className={isMenuOpen ? "landing-nav-link is-open" : "landing-nav-link"}
            aria-label="Main navigation"
          >
            {navItem.map((item) => (
              <div
                className="landing-nav-item"
                key={item.label}
                onMouseEnter={() => item.panel && setOpenPanel(item.label)}
                onMouseLeave={() => setOpenPanel(null)}
              >
                <Link
                  to={item.href}
                  onClick={item.panel ? (event) => handlePanelNav(item, event) : closeMenu}
                  aria-expanded={item.panel ? openPanel === item.label : undefined}
                >
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
              aria-label={isMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMenuOpen}
              aria-controls="mobile-navigation-drawer"
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
