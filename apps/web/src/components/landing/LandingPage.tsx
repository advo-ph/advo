import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { ArrowRight, Menu, X } from "lucide-react";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useDrawerLock } from "@/hooks/useDrawerLock";
import LandingFooter from "./landing-footer";
import WorkShowcase from "./WorkShowcase";
import "./landing-page.css";

/**
 * Prince, 09-02: "just showcases what we've done and what we can do, what we
 * offer". So the page is four things — a name, the offer, the work, the way
 * out. The process tabs, the pricing tiers, the FAQ, the stock-clipart service
 * cards, and the fake dashboard mockup are gone: none of them were about a
 * client, and the clipart's orange broke a black-and-white brand.
 */

const navItem: { label: string; href: string }[] = [
  { label: "What we build", href: "#services" },
  { label: "Team", href: "/team" },
];

interface Offer {
  name: string;
  copy: string;
  /** The feature's own photograph. Absent files, and files that 404, fall back
   *  to a plate named for the offer, so a slot can ship before its shot is
   *  taken and never renders a broken-image glyph. */
  image?: string;
}

interface Industry {
  key: string;
  title: string;
  copy: string;
  offer: Offer[];
}

/**
 * Prince, 09-03: the seven industries, each with the products we actually sell
 * into it. This replaced "Strategy / Design / Development / Support" — four
 * words every agency in the country has on its homepage, and none of which
 * tell a restaurant owner whether we have built the thing they need.
 *
 * No brand names in the copy. The Food lines used to end on "the Starbucks
 * pattern" and two more like it; they were cut on 09-03. A brand we have not
 * worked with reads as a client claim no matter how the sentence is framed.
 *
 * Prince, 09-03: the per-industry clips are gone. Eight `video` paths were
 * declared and not one of the files was ever shot, so every row on the live
 * page was rendering the striped fallback plate. The section now carries a
 * photograph per feature instead, cross-faded as the row is scrolled, which
 * is a thing a camera can produce in an afternoon. Offers without a shot yet
 * keep the plate, now named for the offer rather than the industry.
 *
 * Prince, 09-03, rejected: the first build of that cross-fade pinned each row
 * with position:sticky and bought the fade a scroll budget, which took the
 * section from 5.8 screens to 16.5 and meant seven rows in a row held the
 * reader in place. "I told u do NOT limit my scroll or stop it, u will not be
 * affecting the scroll or anything. u will just change the image shown based
 * on scroll position." So the pin, the track, and the step dots are gone and
 * the section is a plain vertical list again at its original length. The fade
 * now reads the row's own position in the viewport: it is a function of where
 * the row already is, and it steers nothing.
 *
 * Flood: the live map runs on PAGASA gauge data and NOAH hazard maps. We do
 * not own a sensor network; we read what the government publishes.
 *
 * The "first in the Philippines" line is Prince's call, made on 09-03 after
 * being shown the exposure. It is a superlative on a public, checkable fact,
 * and the product line under it says depth is what the water is "likely to
 * be" rather than measured. If anyone ever disputes it, that pair of
 * sentences is where the argument lands.
 *
 * Parking: domain and kiosk flow are built and working. The real hardware
 * drivers are not connected yet. This is pre-pilot, not live.
 *
 * Camping: copy taken from advo-ph/campPH, read on 09-03. Search, PayMongo
 * checkout, host console, and the gear shop are all implemented, and 209 real
 * campsites are seeded. Two things are not: there is no availability calendar
 * and no date-overlap check, so the app will currently take two bookings for
 * the same nights. The site is also still behind a password gate. Nothing on
 * this page claims otherwise, but do not demo a double booking.
 */
const industry: Industry[] = [
  {
    key: "food",
    title: "Food",
    copy: "Ordering, seating, and the kitchen behind both.",
    offer: [
      {
        name: "QR code ordering",
        copy: "Guests scan the code on the table and order from their own phone.",
        image: "/landing/industry/food-qr-ordering.jpg",
      },
      {
        name: "Kiosk ordering",
        copy: "Self-serve terminals that take the order and the payment.",
        image: "/landing/industry/food-kiosk-ordering.jpg",
      },
      {
        name: "Table management",
        copy: "A live floor plan with seating, waitlist, and turn times.",
        image: "/landing/industry/food-table-management.jpg",
      },
    ],
  },
  {
    key: "medical",
    title: "Medical",
    copy: "Clinics, hospitals, and the records that move between them.",
    offer: [
      {
        name: "Clinic management",
        copy: "Appointments, queueing, billing, and stock in one system.",
        image: "/landing/industry/medical-clinic-management.jpg",
      },
      {
        name: "EMR for doctors",
        copy: "Patient records a doctor can read and update between consults.",
      },
      {
        name: "Hospital integration",
        copy: "Your clinic data moving to and from hospital systems without a fax machine.",
      },
    ],
  },
  {
    key: "education",
    title: "Education",
    copy: "Campus security, grading, and the school's own portal.",
    offer: [
      {
        name: "ID authentication",
        copy: "Student IDs that tap in at the gate and log who is on campus.",
      },
      {
        name: "Automated monitoring",
        copy: "Attendance and movement tracked without a teacher counting heads.",
      },
      {
        name: "Grading system",
        copy: "Marks entered once, then computed to the school's own rules.",
      },
      {
        name: "School website",
        copy: "Public site and student portal in one, built on Ranger360 rather than Canvas.",
      },
    ],
  },
  {
    key: "parking",
    title: "Parking",
    copy: "Fully automated parking system for the convenience of drivers, managers, and building owners.",
    offer: [
      {
        name: "Plate recognition",
        copy: "A camera reads the plate at the gate and the barrier opens. Nothing to lose, nothing to hand back.",
      },
      {
        name: "Self-service payment",
        copy: "The driver types their plate at a kiosk and pays in cash, with coin change and a printed receipt.",
      },
      {
        name: "QR and e-wallet",
        copy: "GCash, Maya, card, or QR Ph on the driver's own phone.",
      },
      {
        name: "Runs offline",
        copy: "The internet goes down and the car park keeps working. The lane never waits on the cloud.",
      },
    ],
  },
  {
    key: "business",
    title: "Businesses",
    copy: "If the work runs on spreadsheets and group chats today, it can run on software instead.",
    offer: [
      {
        name: "Construction",
        copy: "Site progress, manpower logs, deliveries, and progress billing for contractors and project owners.",
      },
      {
        name: "Retail and services",
        copy: "Inventory, point of sale, scheduling, and customer records in one system.",
      },
      {
        name: "Logistics",
        copy: "Fleet tracking, dispatch, and proof of delivery without the paperwork.",
      },
      {
        name: "Property",
        copy: "Listings, tenant management, and collections for landlords and brokers.",
      },
    ],
  },
];

/**
 * One offer's photograph, or a plate carrying that offer's name. Nothing in
 * between: an `<img>` pointed at a file that is not there yet renders a broken
 * glyph, and a plate that named the industry instead of the feature read as
 * "no photo of Food" rather than "this feature's shot is not taken yet".
 *
 * No `opacity` prop. The first slide is opaque and the rest are transparent by
 * stylesheet, and from there opacity is written straight to `style` by the
 * scroll reader below. Passing it through React would put a re-render between
 * every scroll frame and the pixel it is supposed to produce.
 */
const IndustrySlide = ({
  offer,
  slideRef,
}: {
  offer: Offer;
  slideRef?: (node: HTMLDivElement | null) => void;
}) => {
  const [failed, setFailed] = useState(false);
  const plate = !offer.image || failed;

  return (
    <div className="landing-industry-slide" ref={slideRef}>
      {plate ? (
        <div className="landing-industry-plate">
          <span>{offer.name}</span>
        </div>
      ) : (
        <img
          src={offer.image}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
};

const CYCLE_MS = 3000;

/**
 * One industry: its photograph on one side, its offers on the other, in normal
 * document flow. The row has no scroll budget of its own and no sticky child,
 * so the reader passes it at whatever speed they are already going.
 */
const IndustryRow = ({
  item,
  index,
  still,
}: {
  item: Industry;
  index: number;
  still: boolean;
}) => {
  const rowRef = useRef<HTMLElement>(null);
  const slideRef = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);

  const total = item.offer.length;
  const cycles = total > 1 && !still;

  useEffect(() => {
    const row = rowRef.current;
    if (!cycles || !row) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (intervalId) return;
      intervalId = setInterval(() => {
        setActive((prev) => {
          const next = (prev + 1) % total;
          for (let i = 0; i < slideRef.current.length; i++) {
            const node = slideRef.current[i];
            if (node) node.style.opacity = i === next ? "1" : "0";
          }
          return next;
        });
      }, CYCLE_MS);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          start();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(row);

    return () => {
      observer.disconnect();
      if (intervalId) clearInterval(intervalId);
    };
  }, [cycles, total]);

  const stillOffer = item.offer.find((entry) => entry.image) ?? item.offer[0];

  return (
    <article className="landing-industry-row" ref={rowRef}>
      <div className="landing-industry-media" aria-hidden="true">
        {cycles ? (
          item.offer.map((entry, slide) => (
            <IndustrySlide
              key={entry.name}
              offer={entry}
              slideRef={(node) => {
                slideRef.current[slide] = node;
              }}
            />
          ))
        ) : stillOffer ? (
          <IndustrySlide offer={stillOffer} />
        ) : (
          <div className="landing-industry-plate">
            <span>{item.title}</span>
          </div>
        )}
      </div>

      <div className="landing-industry-body">
        <span className="landing-industry-index">{String(index + 1).padStart(2, "0")}</span>
        <h3>{item.title}</h3>
        <p className="landing-industry-copy">{item.copy}</p>

        {total > 0 ? (
          <ul className="landing-industry-offer">
            {item.offer.map((entry, slide) => (
              <li key={entry.name} className={cycles && slide === active ? "is-active" : undefined}>
                <h4>{entry.name}</h4>
                <p>{entry.copy}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
};

const IndustrySection = ({ still }: { still: boolean }) => (
  <section className="landing-industry" id="services">
    <h2>What we build</h2>
    <div className="landing-industry-list">
      {industry.map((item, index) => (
        <IndustryRow key={item.key} item={item} index={index} still={still} />
      ))}
    </div>
  </section>
);

const LandingPage = () => {
  const reduceMotion = useReducedMotion();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isPastHeroTop, setIsPastHeroTop] = useState(false);
  // The landscape clip is shot for a 16:9 window; a phone shows a quarter of it.
  // Swap in the portrait file at the same 680px break the CSS crops at. Read
  // matchMedia eagerly so a phone's first paint requests the mobile asset, not
  // the desktop one. The effect below still follows resize and rotate.
  const [isPortraitHero, setIsPortraitHero] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 680px)").matches,
  );
  // Prince, 08-21: "keep only the section for the websites that we've already
  // created". Real rows or nothing — an empty table renders no work section.
  const { project: shippedProject } = usePortfolio();

  const closeMenu = () => setIsMenuOpen(false);

  // The hero's own white wash already carries the logo and the links, so the
  // nav plate would only draw a seam across the photograph. It arrives once
  // the reader has scrolled off the hero and there is real content behind it.
  useEffect(() => {
    const readScroll = () => setIsPastHeroTop(window.scrollY > 64);
    readScroll();
    window.addEventListener("scroll", readScroll, { passive: true });
    return () => window.removeEventListener("scroll", readScroll);
  }, []);

  // Same 680px as the media query that crops the hero. Read it and follow it, so
  // a rotate or a resize past the break loads the frame the CSS is cutting for.
  useEffect(() => {
    const query = window.matchMedia("(max-width: 680px)");
    const readMatch = () => setIsPortraitHero(query.matches);
    readMatch();
    query.addEventListener("change", readMatch);
    return () => query.removeEventListener("change", readMatch);
  }, []);

  // WorkShowcase renders nothing on an empty portfolio, so #work would not
  // exist — and a link that scrolls nowhere reads as a broken site. Both the
  // nav anchor and the hero's second action are gated on the same row count.
  const hasShippedWork = shippedProject.length > 0;
  const link = hasShippedWork ? [{ label: "Our Projects", href: "#work" }, ...navItem] : navItem;

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
    <main className={reduceMotion ? "landing-page is-reduce-motion" : "landing-page"}>
      {/* The drawer drops out of a transparent strip, so the plate comes back
          with it — otherwise the logo sits on the photo beside opaque links. */}
      <header
        className={
          isPastHeroTop || isMenuOpen
            ? "landing-nav landing-nav-float is-solid"
            : "landing-nav landing-nav-float"
        }
      >
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
              Client Hub
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

      {/* A working tower under a blown-out sky: the headline claims we build
          infrastructure for industries, so the first screen is one. The JPG is
          painted by CSS and is up instantly; the video only fades over it once
          it can actually play, so a slow line never gets a black rectangle. */}
      <section className="landing-hero" id="top">
        <div className="landing-hero-media" aria-hidden="true">
          {/* Not paused — absent. Pausing still ships the download, and a loop
              under the headline is motion the reader asked us not to play. */}
          {reduceMotion ? null : (
            <video
              // Portrait file on a phone, landscape on the desktop it was framed
              // for. The key remounts the element on the swap so the browser
              // fetches the new source instead of holding the old decoded frame.
              key={isPortraitHero ? "portrait" : "landscape"}
              className={isVideoReady ? "landing-hero-video is-ready" : "landing-hero-video"}
              src={isPortraitHero ? "/landing/hero-building-mobile.mp4" : "/landing/hero-building.mp4"}
              poster={isPortraitHero ? "/landing/hero-building-mobile.jpg" : "/landing/hero-building.jpg"}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              tabIndex={-1}
              aria-hidden="true"
              onCanPlay={() => setIsVideoReady(true)}
              onPlaying={() => setIsVideoReady(true)}
              onError={() => setIsVideoReady(false)}
            />
          )}
          <div className="landing-hero-scrim" />
        </div>

        <div className="landing-hero-body">
          <h1>
            Building the technological infrastructure for industries across the
            Philippines.
          </h1>
          <p>
            We build reliable software, systems, and digital tools that help real
            businesses operate smarter and grow.
          </p>
          <div className="landing-hero-action">
            <Link className="landing-button landing-button-primary" to="/start">
              Start a project
            </Link>
            {hasShippedWork ? (
              <a className="landing-text-link landing-text-link-arrow" href="#work">
                <span>See our work</span>
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <IndustrySection still={Boolean(reduceMotion)} />

      <WorkShowcase project={shippedProject} />

      {/* The mission line moved up to the hero, so the last screen asks for the
          project instead of saying the same sentence twice. */}
      <section className="landing-closing">
        <h2>Tell us what you need built.</h2>
        <Link className="landing-button landing-button-primary" to="/start">
          Start a project
        </Link>
      </section>

      <LandingFooter />
    </main>
  );
};

export default LandingPage;
