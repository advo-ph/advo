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
 * page. This row is compliance, not navigation, so it sits on its own line.
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

const footerLink: FooterLink[] = [
  { label: "Work", href: "#work" },
  { label: "What we do", href: "#services" },
  { label: "Team", href: "/team" },
  { label: "Log in", href: "/login" },
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
      <div className="landing-footer-field">
        <AdvoDotField />
      </div>

      <div className="landing-footer-bar">
        <div className="landing-footer-id">
          <img src="/advo-logo-black.png" alt="ADVO" />
          <p>© 2026 ADVO. All rights reserved.</p>
        </div>

        <nav className="landing-footer-link" aria-label="Footer">
          {footerLink.map(renderLink)}
        </nav>

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

      <nav className="landing-footer-legal" aria-label="Legal">
        {legalLink.map((link) => (
          <Link key={link.href} to={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
};

export default LandingFooter;
