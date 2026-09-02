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
      { label: "Retainer", href: "#engagement" },
      { label: "Hourly support", href: "#engagement" },
      { label: "Quotation", href: "#engagement" },
      { label: "FAQs", href: "#faq" },
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

      {/* The actual wordmark, not the name typed in the body face: the traced
          letterforms from the lockup, set to exactly the width of the rule
          above them. A CSS mask so it takes its colour from the footer, and
          aria-hidden because the bar below says the name once already. */}
      <div className="landing-footer-wordmark" data-viewport-check="footer-wordmark" aria-hidden="true" />

      <nav className="landing-footer-legal" aria-label="Legal">
        {legalLink.map((link) => (
          <Link key={link.href} to={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="landing-footer-bar">
        <div>
          <img src="/advo-wordmark.svg" alt="ADVO" />
          <p>
            © 2026 ADVO / <Link to="/start">Contact</Link> / Built with care in the Philippines.
          </p>
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
    </footer>
  );
};

export default LandingFooter;
