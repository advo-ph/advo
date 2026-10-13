import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, Menu, X } from "lucide-react";

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
  { label: "Team", href: "/team" },
];

const DRAWER_ID = "mobile-navigation-drawer";

/**
 * One nav for `/` and for every shell route. The drawer contract the a11y
 * bench drives — `#mobile-navigation-drawer` carrying `is-open`, the toggle's
 * aria-controls, Escape, click outside, close on route change — lives here
 * once instead of twice. The page remains scrollable and focus is not moved
 * when the menu opens, so tapping the hamburger does not highlight a link.
 */
const LandingNav = ({ anchorPrefix = "", overlayHero = false }: LandingNavProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isAtFooter, setIsAtFooter] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const { pathname } = useLocation();
  const drawerRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  useEffect(() => {
    if (!isMenuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    const closeOnOutsideClick = (event: MouseEvent) => {
      const path = event.composedPath();
      if (
        (drawerRef.current && path.includes(drawerRef.current)) ||
        (menuButtonRef.current && path.includes(menuButtonRef.current))
      ) return;
      closeMenu();
    };

    window.addEventListener("keydown", closeOnEscape);
    document.addEventListener("click", closeOnOutsideClick);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("click", closeOnOutsideClick);
    };
  }, [isMenuOpen, closeMenu]);

  useEffect(() => {
    closeMenu();
    setIsHidden(false);
  }, [pathname, closeMenu]);

  useEffect(() => {
    const root = document.getElementById("root");
    const scrollPosition = () => Math.max(0, window.scrollY, root?.scrollTop ?? 0);
    let previousY = scrollPosition();
    let direction = 0;
    let distance = 0;
    const onScroll = () => {
      const y = scrollPosition();
      const delta = y - previousY;
      previousY = y;
      if (y <= 68) {
        distance = 0;
        setIsHidden(false);
      } else if (delta !== 0) {
        const nextDirection = Math.sign(delta);
        distance = nextDirection === direction ? distance + Math.abs(delta) : Math.abs(delta);
        direction = nextDirection;
        if (distance >= 8) setIsHidden(direction > 0);
      }
      read();
    };
    const read = () => {
      setIsScrolled(scrollPosition() > 8);

      // Use the bar's visible position even while it is translated off-screen.
      const navHeight = navRef.current?.offsetHeight ?? 68;
      const footerRect = document.getElementById("footer")?.getBoundingClientRect();
      const footerOverlapsNav = Boolean(
        footerRect && footerRect.top < navHeight && footerRect.bottom > 0,
      );
      setIsAtFooter((current) => current === footerOverlapsNav ? current : footerOverlapsNav);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    root?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", read);
    return () => {
      window.removeEventListener("scroll", onScroll);
      root?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", read);
    };
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

  // The full lockup belongs to the top of the landing page only.
  const isCompactBrand = isScrolled || pathname !== "/";
  const isOverlay = overlayHero && !isScrolled && !isMenuOpen;
  const className = [
    "landing-nav",
    isScrolled ? "is-scrolled" : "",
    isOverlay ? "is-overlay" : "",
    isAtFooter ? "is-at-footer" : "",
    isMenuOpen ? "is-menu-open" : "",
    isHidden && !isMenuOpen ? "is-hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className={className} ref={navRef} onFocusCapture={() => setIsHidden(false)}>
      <div className="landing-nav-inner">
        <Link className="landing-brand" to="/" aria-label="ADVO home" onClick={closeMenu}>
          {/* Both marks sit at the same height and left edge, so the ADVO in the
              lockup lands exactly on the standalone ADVO as they cross-fade. */}
          <img
            className={isCompactBrand ? "landing-brand-full" : "landing-brand-full is-visible"}
            src="/advo-technologies-logo.png"
            alt={isCompactBrand ? "" : "ADVO Technologies"}
          />
          <img
            className={isCompactBrand ? "landing-brand-mark is-visible" : "landing-brand-mark"}
            src="/advo-logo-black.png"
            alt={isCompactBrand ? "ADVO" : ""}
          />
        </Link>

        <nav
          id={DRAWER_ID}
          ref={drawerRef}
          className={isMenuOpen ? "landing-nav-link is-open" : "landing-nav-link"}
          aria-label="Main navigation"
        >
          {item.map((entry) => (
            <div className="landing-nav-item" key={entry.label}>
              {renderLink(entry)}
            </div>
          ))}
        </nav>

        <div className="landing-nav-action">
          {anchorPrefix === "" ? (
            <a className="landing-nav-cta" href="#start" onClick={closeMenu} aria-label="Start a project">
              <span className="landing-nav-cta-full">Start a project</span>
              <span className="landing-nav-cta-short">Start project</span>
              <ArrowUpRight size={16} strokeWidth={1.5} aria-hidden="true" />
            </a>
          ) : (
            <Link className="landing-nav-cta" to={`${anchorPrefix}#start`} onClick={closeMenu} aria-label="Start a project">
              <span className="landing-nav-cta-full">Start a project</span>
              <span className="landing-nav-cta-short">Start project</span>
              <ArrowUpRight size={16} strokeWidth={1.5} aria-hidden="true" />
            </Link>
          )}
          <button
            type="button"
            className="landing-menu"
            ref={menuButtonRef}
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
