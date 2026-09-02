import { useEffect, useState, type MouseEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, Menu, X } from "lucide-react";
import { useDrawerLock } from "@/hooks/useDrawerLock";

interface NavLink {
  label: string;
  href: string;
}

interface NavItem extends NavLink {
  panel?: NavLink[];
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

const item: NavItem[] = [
  {
    label: "Product",
    href: "#showcase",
    panel: [
      { label: "Public site", href: "#showcase" },
      { label: "Client Hub", href: "/login" },
      { label: "Admin console", href: "/login" },
      { label: "Start a project", href: "/start" },
    ],
  },
  { label: "Work", href: "#work" },
  { label: "Process", href: "#process" },
  { label: "Quotation", href: "#engagement" },
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
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const { pathname } = useLocation();

  const closeMenu = () => {
    setIsMenuOpen(false);
    setOpenPanel(null);
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

  // Hover cannot happen on touch, and a keyboard Enter deserves the same menu
  // a mouse gets: the first activation of a panel parent opens the panel, the
  // second follows the link.
  const handlePanelNav = (entry: NavItem, event: MouseEvent<HTMLAnchorElement>) => {
    if (!entry.panel || openPanel === entry.label) {
      closeMenu();
      return;
    }
    event.preventDefault();
    setOpenPanel(entry.label);
  };

  const renderLink = (
    link: NavLink,
    extra: { className?: string; onClick?: (event: MouseEvent<HTMLAnchorElement>) => void; expanded?: boolean } = {},
  ) => {
    const { className, onClick, expanded } = extra;
    const isHash = link.href.startsWith("#");
    const chevron = "panel" in link && (link as NavItem).panel ? (
      <ChevronDown className={openPanel === link.label ? "is-open" : ""} size={14} />
    ) : null;

    if (isHash && anchorPrefix === "") {
      return (
        <a key={link.label} href={link.href} className={className} onClick={onClick} aria-expanded={expanded}>
          {link.label}
          {chevron}
        </a>
      );
    }
    return (
      <Link
        key={link.label}
        to={isHash ? `${anchorPrefix}${link.href}` : link.href}
        className={className}
        onClick={onClick}
        aria-expanded={expanded}
      >
        {link.label}
        {chevron}
      </Link>
    );
  };

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
          <img src="/advo-logo-black.png" alt="ADVO" />
        </Link>

        <nav
          id={DRAWER_ID}
          className={isMenuOpen ? "landing-nav-link is-open" : "landing-nav-link"}
          aria-label="Main navigation"
        >
          {item.map((entry) => (
            <div
              className="landing-nav-item"
              key={entry.label}
              onMouseEnter={() => entry.panel && setOpenPanel(entry.label)}
              onMouseLeave={() => setOpenPanel(null)}
            >
              {renderLink(entry, {
                onClick: entry.panel ? (event) => handlePanelNav(entry, event) : closeMenu,
                expanded: entry.panel ? openPanel === entry.label : undefined,
              })}
              {entry.panel ? (
                <div className={openPanel === entry.label ? "landing-nav-panel is-open" : "landing-nav-panel"}>
                  {entry.panel.map((link) => renderLink(link, { onClick: closeMenu }))}
                </div>
              ) : null}
            </div>
          ))}

          <div className="landing-nav-drawer-action">
            <Link className="landing-button landing-button-ghost" to="/login" onClick={closeMenu}>
              Log in
            </Link>
            <Link className="landing-button landing-button-ghost" to="/team" onClick={closeMenu}>
              Team
            </Link>
            <Link className="landing-button landing-button-primary" to="/start" onClick={closeMenu}>
              Start a project
            </Link>
          </div>
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
            type="button"
            className="landing-menu"
            onClick={() => setIsMenuOpen((value) => !value)}
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMenuOpen}
            aria-controls={DRAWER_ID}
          >
            {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
    </header>
  );
};

export default LandingNav;
