import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useDrawerLock } from "@/hooks/useDrawerLock";

interface NavLink {
  label: string;
  href: string;
}

interface LandingNavProps {
  /**
   * Put in front of every in-page anchor. `""` on the landing itself keeps the
   * native hash scroll; `/` on a shell route sends the anchor home first.
   */
  anchorPrefix?: string;
  /**
   * The landing hero runs full-bleed under the bar on phones. While the page
   * is at the top the bar is transparent with light text; the first scroll
   * (or an open drawer) brings the solid ground back.
   */
  overlayHero?: boolean;
}

const item: NavLink[] = [
  { label: "Home", href: "#top" },
  { label: "Solutions", href: "#solutions" },
  { label: "Services", href: "#services" },
  { label: "Portfolio", href: "#work" },
];

const DRAWER_ID = "mobile-navigation-drawer";

/**
 * One nav for `/` and for every shell route. The drawer contract the a11y
 * bench drives — `#mobile-navigation-drawer` carrying `is-open`, the toggle's
 * aria-controls, Escape, scroll lock on both containers, close on route
 * change — lives here once instead of twice.
 */
const LandingNav = ({ anchorPrefix = "", overlayHero = false }: LandingNavProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { pathname } = useLocation();

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  useDrawerLock(isMenuOpen, closeMenu, DRAWER_ID);

  useEffect(() => {
    closeMenu();
  }, [pathname]);

  useEffect(() => {
    const read = () => setIsScrolled(window.scrollY > 8);
    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => window.removeEventListener("scroll", read);
  }, []);

  const renderLink = (
    link: NavLink,
    extra: { className?: string } = {},
  ) => {
    const { className } = extra;
    const isHash = link.href.startsWith("#");

    if (isHash && anchorPrefix === "") {
      return <a key={link.label} href={link.href} className={className} onClick={closeMenu}>{link.label}</a>;
    }
    return (
      <Link
        key={link.label}
        to={isHash ? `${anchorPrefix}${link.href}` : link.href}
        className={className}
        onClick={closeMenu}
      >
        {link.label}
      </Link>
    );
  };

  const startLink = anchorPrefix === "" ? (
    <a className="landing-button landing-button-primary" href="#start" onClick={closeMenu}>
      Start a project
    </a>
  ) : (
    <Link className="landing-button landing-button-primary" to={`${anchorPrefix}#start`} onClick={closeMenu}>
      Start a project
    </Link>
  );

  const startLinkSmall = anchorPrefix === "" ? (
    <a className="landing-button landing-button-primary landing-button-small" href="#start" onClick={closeMenu}>
      Start a project
    </a>
  ) : (
    <Link className="landing-button landing-button-primary landing-button-small" to={`${anchorPrefix}#start`} onClick={closeMenu}>
      Start a project
    </Link>
  );

  const isOverlay = overlayHero && !isScrolled && !isMenuOpen;
  const className = [
    "landing-nav",
    isScrolled ? "is-scrolled" : "",
    isOverlay ? "is-overlay" : "",
    isMenuOpen ? "is-menu-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className={className}>
      <div className="landing-nav-inner">
        <Link className="landing-brand" to="/" aria-label="ADVO home" onClick={closeMenu}>
          <img src="/advo-wordmark.svg" alt="ADVO" />
        </Link>

        <nav
          id={DRAWER_ID}
          className={isMenuOpen ? "landing-nav-link is-open" : "landing-nav-link"}
          aria-label="Main navigation"
        >
          {item.map((entry) => (
            <div className="landing-nav-item" key={entry.label}>
              {renderLink(entry)}
            </div>
          ))}

          <div className="landing-nav-drawer-action">
            <Link className="landing-button landing-button-ghost" to="/login" onClick={closeMenu}>
              Log in
            </Link>
            <Link className="landing-button landing-button-ghost" to="/team" onClick={closeMenu}>
              Team
            </Link>
            {startLink}
          </div>
        </nav>

        <div className="landing-nav-action">
          <Link className="landing-login landing-login-wide" to="/team" onClick={closeMenu}>
            Team
          </Link>
          <Link className="landing-login" to="/login" onClick={closeMenu}>
            Log in
          </Link>
          {startLinkSmall}
          <button
            type="button"
            className="landing-menu"
            onClick={() => setIsMenuOpen((value) => !value)}
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMenuOpen}
            aria-controls={DRAWER_ID}
          >
            {isMenuOpen ? <X size={20} strokeWidth={1} absoluteStrokeWidth /> : <Menu size={20} strokeWidth={1} absoluteStrokeWidth />}
          </button>
        </div>
      </div>
    </header>
  );
};

export default LandingNav;
