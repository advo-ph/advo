import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "./landing-nav.css";
import { landingNavLinks } from "@/lib/public-navigation";
import { isNativeApp } from "@/lib/platform";

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
  /** Use a dark glass surface over a full-bleed hero. */
  overlayHero?: boolean;
}



/** Page-aligned navigation that becomes a floating glass bar on scroll. */
const LandingNav = ({ anchorPrefix = "", overlayHero = false }: LandingNavProps) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isAtFooter, setIsAtFooter] = useState(false);
  const [isAtDarkSection, setIsAtDarkSection] = useState(false);
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = document.getElementById("root");
    const scrollPosition = () => Math.max(0, window.scrollY, root?.scrollTop ?? 0);
    const darkSections = [...document.querySelectorAll<HTMLElement>('[data-nav-theme="dark"]')];
    const read = () => {
      setIsScrolled(scrollPosition() > 0);

      const navRect = navRef.current?.getBoundingClientRect();
      const navTop = navRect?.top ?? 0;
      const navBottom = navRect?.bottom ?? 80;
      const overlaps = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return rect.top < navBottom && rect.bottom > navTop;
      };
      const footer = document.getElementById("footer");
      const footerOverlapsNav = Boolean(
        footer && overlaps(footer),
      );
      const darkSectionOverlapsNav = darkSections.some(overlaps);
      setIsAtFooter((current) => current === footerOverlapsNav ? current : footerOverlapsNav);
      setIsAtDarkSection((current) => current === darkSectionOverlapsNav ? current : darkSectionOverlapsNav);
    };
    read();
    window.addEventListener("scroll", read, { passive: true });
    root?.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    return () => {
      window.removeEventListener("scroll", read);
      root?.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
    };
  }, [pathname]);

  const renderLink = (
    link: NavLink,
    extra: { className?: string } = {},
  ) => {
    const { className } = extra;
    const isHash = link.href.startsWith("#");

    if (isHash && anchorPrefix === "") {
      return <a key={link.label} href={link.href} className={className}>{link.label}</a>;
    }
    return (
      <Link
        key={link.label}
        to={isHash ? `${anchorPrefix}${link.href}` : link.href}
        className={className}
      >
        {link.label}
      </Link>
    );
  };

  const isCompactBrand = pathname !== "/";
  const isOverlay = overlayHero && !isScrolled;
  const className = [
    "landing-nav",
    isScrolled ? "is-scrolled" : "",
    isOverlay ? "is-overlay" : "",
    isAtFooter ? "is-at-footer" : "",
    isAtDarkSection ? "is-at-dark-section" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className={className} ref={navRef}>
      <div className="landing-nav-inner">
        <Link className="landing-brand" to="/" aria-label="ADVO home">
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

        {/* Marketing nav links and the "Start a project" CTA are lead-gen/
            site-navigation affordances with no purpose inside the members-only
            native shell (the app's NativeGate allowlist can reach this header
            on /login and the legal pages). Hidden only when
            Capacitor.isNativePlatform() is true; web at advo.ph is unchanged. */}
        {!isNativeApp() && (
          <>
            <nav
              className="landing-nav-link"
              aria-label="Main navigation"
            >
              {landingNavLinks.map((entry) => (
                <div className="landing-nav-item" key={entry.label}>
                  {renderLink(entry)}
                </div>
              ))}
            </nav>

            <div className="landing-nav-action">
              {anchorPrefix === "" ? (
                <a className="landing-nav-cta" href="#start" aria-label="Start a project" title="Start a project">
                  <span className="landing-nav-cta-full">Start a project</span>
                  <span className="landing-nav-cta-short">Start project</span>
                </a>
              ) : (
                <Link className="landing-nav-cta" to={`${anchorPrefix}#start`} aria-label="Start a project" title="Start a project">
                  <span className="landing-nav-cta-full">Start a project</span>
                  <span className="landing-nav-cta-short">Start project</span>
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
};

export default LandingNav;
