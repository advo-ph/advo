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
import { get } from "@/lib/api";
import AdvoDotField from "./AdvoDotField";

/**
 * Prince, 09-02: the dot field on top, one bar underneath.
 *
 * The four link columns this replaced pointed at sections that no longer
 * exist (#process, #engagement, #faq), and the marketing lede above them was
 * the paragraph nobody scrolls a footer to read.
 */

interface SocialLink {
  icon: string;
  href: string;
  label: string;
}

/**
 * The four PayMongo merchant-review disclosures. Full names on purpose — a
 * reviewer looks for the policy by title, and has to find all four from any
 * page. They now sit in the same footer bar as the links above, so there is
 * one band, not a compliance row bolted under it.
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
}

/**
 * Prince, 09-04: Work, What we build, and Team were dropped — the header
 * already carries them, so the footer only kept the two the header does not
 * lead with, and Log in became Client Hub to match the header label.
 */
const footerLink: FooterLink[] = [
  { label: "Client Hub", href: "/login" },
  { label: "Start a project", href: "/start" },
];

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
      {/* The canvas is aria-hidden, so the wordmark is named here. The line
          under it is set as HTML, not painted into the grid: dotted, at the
          size the wordmark's measure forces, it came out as dashes. */}
      <div className="landing-footer-lockup">
        <h2 className="landing-sr-only">ADVO</h2>
        <div className="landing-footer-field">
          <AdvoDotField />
        </div>
        <p className="landing-footer-tagline">We digitalize it for you</p>
      </div>

      {/* One band, not two. Prince, 09-04: "i want them all together rather
          than u having 2 footers". The legal links used to sit in their own
          row below, which read as a second footer. Now the nav links and the
          four policies share one link group; social sits opposite; only the
          copyright line follows, as fine print. */}
      <div className="landing-footer-bar">
        <div className="landing-footer-links">
          <nav className="landing-footer-link" aria-label="Footer">
            {footerLink.map(renderLink)}
          </nav>
          <nav className="landing-footer-link" aria-label="Legal">
            {legalLink.map((link) => (
              <Link key={link.href} to={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
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
                <Icon size={17} stroke={1.4} />
              </a>
            );
          })}
        </div>
      </div>

      <div className="landing-footer-fine">
        <p>© 2026 ADVO. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default LandingFooter;
