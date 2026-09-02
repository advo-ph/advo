import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useDrawerLock } from "@/hooks/useDrawerLock";
import LandingFooter from "./landing-footer";
import "./landing-page.css";

interface LandingShellProps {
  children: ReactNode;
}

/**
 * Same three destinations as the landing nav. The dropdown panels this
 * replaced pointed at #showcase, #service, #process, and #engagement, all of
 * which were deleted with the sections they named.
 */
const navItem: { label: string; href: string }[] = [
  { label: "Work", href: "/#work" },
  { label: "What we do", href: "/#services" },
  { label: "Team", href: "/team" },
];

const LandingShell = ({ children }: LandingShellProps) => {
  const reduceMotion = useReducedMotion();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const closeMenu = () => setIsMenuOpen(false);

  // The shell routes (/start /login /team /project/:slug …) mount the same nav
  // drawer as the landing, so they carry the same behaviours — Escape, scroll
  // lock on both scroll containers, focus trap — from the same hook.
  useDrawerLock(isMenuOpen, closeMenu, "mobile-navigation-drawer");

  // Navigating closes it, same as the landing nav.
  const { pathname } = useLocation();
  useEffect(() => {
    closeMenu();
  }, [pathname]);

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
              <Link key={item.label} to={item.href} onClick={closeMenu}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="landing-nav-action">
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
