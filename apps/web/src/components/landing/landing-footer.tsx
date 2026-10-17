import { useEffect, useRef, useState, type CSSProperties } from "react";
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
import { get } from "@/lib/api";
import { identityValue } from "@/lib/legal-identity";
import { landingNavLinks } from "@/lib/public-navigation";

interface SocialLink {
  icon: string;
  href: string;
  label: string;
}

interface FooterLink {
  label: string;
  href: string;
}

interface LandingFooterProps {
  /**
   * Prefix put in front of every in-page anchor. `/` mounts the footer on a
   * sub-route (the anchor has to route home first); `""` mounts it on the
   * landing itself, where a bare `#hash` keeps the native in-page scroll.
   */
  anchorPrefix?: string;
}

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

/** Four links per column keep the footer balanced without filler. */
const footerCol: { title: string; link: FooterLink[] }[] = [
  {
    title: "Explore",
    link: landingNavLinks.filter(link => link.label !== "Team"),
  },
  {
    title: "ADVO",
    link: [
      ...landingNavLinks.filter(link => link.label === "Team"),
      { label: "About us", href: "/about" },
      { label: "Client guide", href: "/client-guide" },
      { label: "Behind the scenes", href: "/behind-the-scenes" },
    ],
  },
  {
    title: "Connect",
    link: [
      { label: "Start a project", href: "#start" },
      { label: "Client Hub", href: "/clients" },
      { label: "Members Hub", href: "/members" },
      { label: "Email us", href: `mailto:${identityValue("support_email") || "contact@advo.ph"}` },
    ],
  },
  {
    title: "Policies",
    link: [
      { label: "Terms & conditions", href: "/terms" },
      { label: "Privacy policy", href: "/privacy" },
      { label: "Refund policy", href: "/refund" },
      { label: "Dispute resolution", href: "/dispute" },
    ],
  },
];

/** The ADVO mark, from the brand file "ADVO White.svg" (757 × 174). */
const advoMarkPath = [
  "M31.5 171.5H0L89.5 2.49988H104.5L193.5 171.5H163.5L97 41.4999L31.5 171.5Z",
  "M222 171V2H297.966C316.723 2 332.771 5.39656 346.109 12.1897C359.656 18.8171 369.972 28.427 377.058 41.0191C384.353 53.6113 388 68.7716 388 86.5C388 104.063 384.353 119.223 377.058 131.981C369.972 144.573 359.656 154.266 346.109 161.059C332.771 167.686 316.723 171 297.966 171H222ZM248.009 148.106H297.966C318.39 148.106 328.078 144.273 341.797 133.636C355.515 123 360.991 107.376 360.991 86.5C360.991 65.6235 354.015 51 343.515 41.0191C333.015 31.0382 318.39 25.8941 297.966 25.8941H248.009V148.106Z",
  "M424 2.49988H393L480.5 171.5H499.5L585 2.49988H555L489 134.5L424 2.49988Z",
  "M668.5 0C717.377 0 757 38.9512 757 87C757 135.049 717.377 174 668.5 174C619.623 174 580 135.049 580 87C580 38.9512 619.623 0 668.5 0ZM668.5 24C633.982 24 606 52.4299 606 87.5C606 122.57 633.982 151 668.5 151C703.018 151 731 122.57 731 87.5C731 52.4299 703.018 24 668.5 24Z",
].join(" ");

/** The same shapes as a CSS mask, so the glass and the light inside it share one outline. */
const advoMarkMask = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 757 174"><path fill-rule="evenodd" d="${advoMarkPath}"/></svg>`,
)}")`;

type GradientStop = [offset: number, alpha: number];

/** One crest from its peak to its rim. CSS sets each row's strength. */
const crestStop: GradientStop[] = [[0, 1], [0.18, 0.69], [0.36, 0.38], [0.55, 0.18], [0.75, 0.054], [1, 0]];
/** The steady light: a rise from the bottom edge and a pool at its center. */
const riseStop: GradientStop[] = [[0, 0.28], [0.1, 0.16], [0.22, 0.07], [0.36, 0.02], [0.55, 0]];
const poolStop: GradientStop[] = [[0, 0.14], [0.72, 0]];

const addWhiteStop = (gradient: CanvasGradient, stop: GradientStop[]) => {
  stop.forEach(([offset, alpha]) => gradient.addColorStop(offset, `rgba(255, 255, 255, ${alpha})`));
};

/** Fills a half ellipse that sits on the bottom edge, centered at x. */
const fillHalfEllipse = (ctx: CanvasRenderingContext2D, x: number, radiusX: number, radiusY: number, stop: GradientStop[]) => {
  ctx.setTransform(radiusX, 0, 0, radiusY, x, ctx.canvas.height);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  addWhiteStop(gradient, stop);
  ctx.fillStyle = gradient;
  ctx.fillRect(-1, -1, 2, 1);
};

/** The light is painted once into small canvases. CSS stretches each canvas
    over its box and the GPU scales it up. A soft glow loses nothing at low
    resolution, and a full-size gradient layer per row was too much for
    low-end devices: they painted the light late, and in pieces. */
const startCanvas = (canvas: HTMLCanvasElement | null) => {
  const ctx = canvas?.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  return ctx;
};

const paintWave = (canvas: HTMLCanvasElement | null, tileCount: number) => {
  const ctx = startCanvas(canvas);
  if (!ctx) return;
  const { width, height } = ctx.canvas;
  const tileWidth = width / tileCount;
  for (let tile = 0; tile < tileCount; tile++) {
    fillHalfEllipse(ctx, tileWidth * (tile + 0.5), tileWidth / 2, height, crestStop);
  }
};

const paintGlow = (canvas: HTMLCanvasElement | null) => {
  const ctx = startCanvas(canvas);
  if (!ctx) return;
  const { width, height } = ctx.canvas;
  // The rise and the pool add up, the way two lights do.
  ctx.globalCompositeOperation = "lighter";
  const rise = ctx.createLinearGradient(0, height, 0, 0);
  addWhiteStop(rise, riseStop);
  ctx.fillStyle = rise;
  ctx.fillRect(0, 0, width, height);
  fillHalfEllipse(ctx, width / 2, width * 0.62, height * 0.58, poolStop);
};

/** Three wave rows at different widths and speeds over the steady glow.
    Their sum is the aurora. Each strip is twice the row's width, so the
    crest count stays even. Canvases stay above 256 × 256 pixels in area, so
    browsers composite them straight from the bitmap. */
const waveRow = [
  { row: 1, paint: (canvas: HTMLCanvasElement | null) => paintWave(canvas, 4) },
  { row: 2, paint: (canvas: HTMLCanvasElement | null) => paintWave(canvas, 6) },
  { row: 3, paint: (canvas: HTMLCanvasElement | null) => paintWave(canvas, 10) },
];

const auroraLight = [
  <canvas key="glow" className="landing-footer-glow" width={512} height={256} ref={paintGlow} />,
  ...waveRow.map(({ row, paint }) => (
    <span key={row} className={`landing-footer-wave is-row-${row}`}>
      <canvas width={960} height={120} ref={paint} />
    </span>
  )),
];

const LandingFooter = ({ anchorPrefix = "" }: LandingFooterProps) => {
  const [socialLink, setSocialLink] = useState<SocialLink[]>(socialDefault);
  const [isStageLive, setIsStageLive] = useState(false);
  const footerRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const isSamePage = anchorPrefix === "";

  // Mobile Safari paints the strip under its toolbar and the overscroll past
  // the last pixel with the html background. Flag the page while the footer
  // is on screen, so that ground turns as dark as the footer.
  useEffect(() => {
    const footer = footerRef.current;
    if (!footer || typeof IntersectionObserver === "undefined") return;
    const root = document.documentElement;
    const observer = new IntersectionObserver(([entry]) => {
      root.classList.toggle("is-footer-in-view", entry.isIntersecting);
    });
    observer.observe(footer);
    return () => {
      observer.disconnect();
      root.classList.remove("is-footer-in-view");
    };
  }, []);

  // The waves only run while the footer is on screen.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (typeof IntersectionObserver === "undefined") {
      setIsStageLive(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setIsStageLive(entry.isIntersecting));
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const renderLink = (item: FooterLink) => {
    if (item.href.startsWith("mailto:")) {
      return <a key={item.label} href={item.href}>{item.label}</a>;
    }
    if (item.href.startsWith("http")) {
      return (
        <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer">
          {item.label}
        </a>
      );
    }
    if (item.href.startsWith("#")) {
      // On the landing itself a bare hash keeps the browser's in-page scroll.
      return isSamePage ? (
        <a key={item.label} href={item.href}>
          {item.label}
        </a>
      ) : (
        <Link key={item.label} to={`${anchorPrefix}${item.href}`}>
          {item.label}
        </Link>
      );
    }
    return (
      <Link key={item.label} to={item.href}>
        {item.label}
      </Link>
    );
  };

  return (
    <footer className="landing-footer" id="footer" data-nav-theme="dark" ref={footerRef}>
      <div className="landing-footer-grid landing-footer-grid-simplified">
        {footerCol.map((col) => (
          <div key={col.title}>
            <h3>{col.title}</h3>
            {col.title === "Policies" ? (
              <nav aria-label="Legal">{col.link.map(renderLink)}</nav>
            ) : col.link.map(renderLink)}
          </div>
        ))}
      </div>

      {/* Business registration and support details shown in the footer. */}
      <div className="landing-footer-bar">
        <div className="landing-footer-identity" data-viewport-check="footer-identity">
          <p>
            BIR Registered · DTI Registration No. 787550
          </p>
          <p className="landing-footer-fine">© 2026 ADVO. All rights reserved.</p>
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
                <Icon size={16} stroke={1} />
              </a>
            );
          })}
        </div>
      </div>

      {/* A dark gray ADVO mark with a faint aurora drifting along the bottom
          edge. A slightly widened reflection of the same waves is masked
          into the letters, so they softly catch the light. The waves are
          small canvases moved by transform-only CSS, and they stop while the
          footer is off screen. */}
      <div
        className="landing-footer-stage"
        ref={stageRef}
        data-viewport-check="footer-wordmark"
        data-live={isStageLive ? "" : undefined}
        role="img"
        aria-label="ADVO"
      >
        <div className="landing-footer-mark" style={{ "--advo-mark": advoMarkMask } as CSSProperties}>
          <div className="landing-footer-aurora" aria-hidden="true">{auroraLight}</div>
          <div className="landing-footer-glass" aria-hidden="true">
            <div className="landing-footer-aurora is-refracted">{auroraLight}</div>
          </div>
          {/* Vector edges, so they stay sharp at any size: a faint glow just
              inside each edge for the thickness of the glass, then a thin rim.
              Both are brightest at the bottom, where the light comes in. */}
          <svg className="landing-footer-edge" viewBox="0 0 757 174" aria-hidden="true">
            <defs>
              <linearGradient id="landing-footer-edge-light" x1="0" y1="174" x2="0" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
                <stop offset="0.5" stopColor="#fff" stopOpacity="0.4" />
                <stop offset="1" stopColor="#fff" stopOpacity="0.2" />
              </linearGradient>
              <linearGradient id="landing-footer-glass-tint" x1="0" y1="174" x2="0" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#fff" stopOpacity="0.035" />
                <stop offset="0.5" stopColor="#fff" stopOpacity="0.012" />
                <stop offset="1" stopColor="#fff" stopOpacity="0.005" />
              </linearGradient>
              <clipPath id="landing-footer-edge-clip">
                <path d={advoMarkPath} clipRule="evenodd" />
              </clipPath>
              <filter id="landing-footer-edge-blur" x="-5%" y="-20%" width="110%" height="140%">
                <feGaussianBlur stdDeviation="2.5" />
              </filter>
            </defs>
            {/* Smoked glass stays dark, with a little tint where the light
                enters. It lives here, not on the glass, so the glass needs
                no full-size layer of its own. */}
            <path d={advoMarkPath} fillRule="evenodd" fill="url(#landing-footer-glass-tint)" />
            <g opacity="0.08">
              <path
                d={advoMarkPath}
                fill="none"
                stroke="url(#landing-footer-edge-light)"
                strokeWidth="8"
                strokeOpacity="0.4"
                filter="url(#landing-footer-edge-blur)"
                clipPath="url(#landing-footer-edge-clip)"
              />
              <path
                d={advoMarkPath}
                fill="none"
                stroke="url(#landing-footer-edge-light)"
                strokeWidth="1.25"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          </svg>
        </div>
      </div>
    </footer>
  );
};

export default LandingFooter;
