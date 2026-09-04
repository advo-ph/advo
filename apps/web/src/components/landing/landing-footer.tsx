import { useEffect, useState } from "react";
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
import { ChevronRight } from "lucide-react";
import { get } from "@/lib/api";
import { identityValue } from "@/lib/legal-identity";
import AdvoDotField from "./AdvoDotField";

interface SocialLink {
  icon: string;
  href: string;
  label: string;
}

/**
 * The four PayMongo merchant-review disclosures. They sit on their own row
 * rather than inside `footerCol`, whose grid is fixed at four columns — and a
 * reviewer needs them from every page, not buried in a service menu.
 */
const legalLink: { label: string; href: string }[] = [
  { label: "Terms and Conditions", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Return and Refund Policy", href: "/refund" },
  { label: "Dispute Resolution Policy", href: "/dispute" },
];

interface FooterLink {
  label: string;
  href: string;
  ext?: boolean;
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

/**
 * Columns follow the system, not a service menu: the four surfaces we ship,
 * what keeps them running, and who stands behind them.
 */
const footerCol: { title: string; link: FooterLink[] }[] = [
  {
    title: "The system",
    link: [
      { label: "Public site", href: "#showcase" },
      { label: "Client Hub", href: "/login" },
      { label: "Admin Console", href: "/login" },
      { label: "Hardware floor", href: "/start" },
    ],
  },
  {
    title: "How it ships",
    link: [
      { label: "Discovery", href: "#process" },
      { label: "The build", href: "#process" },
      { label: "Review and sign-off", href: "#process" },
      { label: "VPS handoff", href: "#workflow" },
    ],
  },
  {
    title: "Keep it running",
    link: [
      { label: "The work we shipped", href: "#work" },
      { label: "How it ships", href: "#process" },
      { label: "Request a quotation", href: "/start" },
    ],
  },
  {
    title: "Studio",
    link: [
      { label: "Team", href: "/team" },
      { label: "Work", href: "#work" },
      { label: "Fourlinq", href: "https://fourlinq.ph", ext: true },
      { label: "Start a project", href: "/start" },
    ],
  },
];

const LandingFooter = ({ anchorPrefix = "" }: LandingFooterProps) => {
  const [socialLink, setSocialLink] = useState<SocialLink[]>(socialDefault);
  const isSamePage = anchorPrefix === "";

  useEffect(() => {
    (async () => {
      const { data } = await get<{ key: string; value: unknown }[]>("/api/settings/public");
      if (!data) return;
      const setting = data.find((row) => row.key === "social_links");
      if (setting?.value && Array.isArray(setting.value) && setting.value.length > 0) {
        setSocialLink(setting.value as SocialLink[]);
      }
    })();
  }, []);

  const renderLink = (item: FooterLink) => {
    if (item.href.startsWith("http")) {
      return (
        <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer">
          {item.label}
          {item.ext ? <span> ↗</span> : null}
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
    <footer className="landing-footer" id="footer">
      <div className="landing-footer-lede">
        <div>
          <p className="landing-kicker">The whole system</p>
          <h3>Websites with client systems behind them.</h3>
        </div>
        <div>
          <p>
            The public site your customers land on, the Client Hub they sign into, the Admin
            Console your studio runs on, and the hardware on the floor — built as one system, not
            four vendors. When it is done, the VPS handoff leaves the whole stack in your name.
          </p>
          <Link className="landing-footer-cta" to="/start">
            Start the system
            <ChevronRight size={14} strokeWidth={1} absoluteStrokeWidth />
          </Link>
        </div>
      </div>

      <div className="landing-footer-grid">
        {footerCol.map((col) => (
          <div key={col.title}>
            <h3>{col.title}</h3>
            {col.link.map(renderLink)}
          </div>
        ))}
      </div>

      {/* The wordmark as an interactive pixel field — the ADVO letterforms
          rendered as dots that react to the cursor and settle on their own.
          The canvas is aria-hidden, so the name is set as text for a reader,
          and the tagline sits under it at the wordmark's measure. */}
      <div className="landing-footer-lockup" data-viewport-check="footer-wordmark">
        <h2 className="landing-sr-only">ADVO</h2>
        <div className="landing-footer-field">
          <AdvoDotField />
        </div>
        <p className="landing-footer-tagline">We digitalize it for you</p>
      </div>

      <nav className="landing-footer-legal" aria-label="Legal">
        {legalLink.map((link) => (
          <Link key={link.href} to={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>

      {/* The registered-business disclosure a DTI merchant is expected to publish.
          Every field is read from data/legal-identity.json through identityValue,
          which returns null for a "TBD" field — so address, registration number,
          and phone appear the moment the paperwork is transcribed, and never as a
          placeholder before then. Same source as bench:paymongo. */}
      <div className="landing-footer-identity" data-viewport-check="footer-identity">
        <p>
          {identityValue("legal_name")}
          {identityValue("registration_body") ? ` · Registered with the ${identityValue("registration_body")}` : ""}
          {identityValue("registration_number") ? ` · Reg. No. ${identityValue("registration_number")}` : ""}
        </p>
        <p>
          {identityValue("business_address") ? `${identityValue("business_address")} · ` : ""}
          <a href={`mailto:${identityValue("support_email") ?? "contact@advo.ph"}`}>
            {identityValue("support_email") ?? "contact@advo.ph"}
          </a>
          {identityValue("support_phone") ? ` · ${identityValue("support_phone")}` : ""}
        </p>
      </div>

      <div className="landing-footer-bar">
        <p className="landing-footer-fine">© 2026 ADVO. All rights reserved.</p>
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
    </footer>
  );
};

export default LandingFooter;
