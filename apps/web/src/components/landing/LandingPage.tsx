import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useDrawerLock } from "@/hooks/useDrawerLock";
import LandingFooter from "./landing-footer";
import WorkShowcase from "./WorkShowcase";
import "./landing-page.css";

/**
 * Prince, 09-02: "just showcases what we've done and what we can do, what we
 * offer". So the page is four things — a name, the work, the offer, the way
 * out. The process tabs, the pricing tiers, the FAQ, the stock-clipart service
 * cards, and the fake dashboard mockup are gone: none of them were about a
 * client, and the clipart's orange broke a black-and-white brand.
 */

const navItem: { label: string; href: string }[] = [
  { label: "What we do", href: "#services" },
  { label: "Team", href: "/team" },
];

/** No icons. The old ones were stock isometric clipart in a colour the brand does not use. */
const service = [
  { title: "Strategy", copy: "What to build, and why it earns." },
  { title: "Design", copy: "Brand, interface, and the words on it." },
  { title: "Development", copy: "Web, mobile, and the systems behind them." },
  { title: "Support", copy: "We stay on after launch. Uptime is the product." },
];

const LandingPage = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Prince, 08-21: "keep only the section for the websites that we've already
  // created". Real rows or nothing — an empty table renders no work section.
  const { project: shippedProject } = usePortfolio();

  const closeMenu = () => setIsMenuOpen(false);

  // WorkShowcase renders nothing on an empty portfolio, so #work would not
  // exist — and a nav link that scrolls nowhere reads as a broken site.
  const link = shippedProject.length > 0 ? [{ label: "Work", href: "#work" }, ...navItem] : navItem;

  // Escape closes the drawer, neither scroll container scrolls behind it, and
  // focus stays inside until it closes.
  useDrawerLock(isMenuOpen, closeMenu, "mobile-navigation-drawer");

  // Navigating closes it. The nav mixes in-page anchors with real routes, so a
  // client-side navigation would otherwise leave the drawer covering the page
  // it just opened.
  const { pathname } = useLocation();
  useEffect(() => {
    closeMenu();
  }, [pathname]);

  return (
    <main className="landing-page">
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <a className="landing-brand" href="#top" aria-label="ADVO home">
            <img src="/advo-logo-black.png" alt="ADVO" />
          </a>
          <nav
            id="mobile-navigation-drawer"
            className={isMenuOpen ? "landing-nav-link is-open" : "landing-nav-link"}
            aria-label="Main navigation"
          >
            {link.map((item) =>
              item.href.startsWith("/") ? (
                <Link key={item.label} to={item.href} onClick={closeMenu}>
                  {item.label}
                </Link>
              ) : (
                <a key={item.label} href={item.href} onClick={closeMenu}>
                  {item.label}
                </a>
              ),
            )}
          </nav>
          <div className="landing-nav-action">
            <Link className="landing-login" to="/login">
              Log in
            </Link>
            <Link className="landing-button landing-button-primary landing-button-small" to="/start">
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

      {/* Type only. The old hero photo was a dim, yellowed counter — it made the
          first screen look like the thing we replace, not the thing we build.
          White here also makes the first work panel land as a full-bleed cut. */}
      <section className="landing-hero" id="top">
        <h1>We digitalize it for you.</h1>
        <p>
          A software studio in the Philippines. We build the websites and systems
          businesses actually run on.
        </p>
        <div className="landing-hero-action">
          <Link className="landing-button landing-button-primary" to="/start">
            Start a project
          </Link>
          <a className="landing-text-link" href="#work">
            See our work
          </a>
        </div>
      </section>

      <WorkShowcase project={shippedProject} />

      <section className="landing-service" id="services">
        <h2>What we do</h2>
        <ol className="landing-service-list">
          {service.map((item, index) => (
            <li key={item.title}>
              <span className="landing-service-index">{String(index + 1).padStart(2, "0")}</span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-closing">
        <h2>
          We are building the technological infrastructure for industries across
          the Philippines.
        </h2>
        <Link className="landing-button landing-button-primary" to="/start">
          Start a project
        </Link>
      </section>

      <LandingFooter />
    </main>
  );
};

export default LandingPage;
