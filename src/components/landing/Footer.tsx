import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Facebook,
  Instagram,
  Linkedin,
  Mail,
  Twitter,
  Youtube,
  Globe,
  ArrowUpRight,
  MapPin,
} from "lucide-react";
import { get } from "@/lib/api";

const ICON_MAP: Record<string, React.ElementType> = {
  Facebook,
  Instagram,
  Linkedin,
  Mail,
  Twitter,
  Youtube,
  Globe,
};

interface SocialLink {
  icon: string;
  href: string;
  label: string;
}

const DEFAULTS: SocialLink[] = [
  { icon: "Facebook", href: "https://www.facebook.com/share/1DDt8dVJUd/?mibextid=wwXIfr", label: "Facebook" },
  { icon: "Instagram", href: "https://www.instagram.com/advo_ph/", label: "Instagram" },
  { icon: "Linkedin", href: "https://www.linkedin.com/company/advocompany/", label: "LinkedIn" },
  { icon: "Mail", href: "mailto:contact@advo.ph", label: "Email" },
];

const NAV_COMPANY = [
  { label: "About", href: "/" },
  { label: "Team", href: "/team" },
  { label: "Client Hub", href: "/login" },
  { label: "Start a Project", href: "/start" },
];

const NAV_SERVICES = [
  "Web Applications",
  "Mobile Apps",
  "Custom Software",
  "Cloud Architecture",
];

const Footer = () => {
  const [socials, setSocials] = useState<SocialLink[]>(DEFAULTS);

  useEffect(() => {
    (async () => {
      const { data } = await get<{ key: string; value: unknown }[]>("/api/settings");
      if (data) {
        const setting = data.find((s) => s.key === "social_links");
        if (setting?.value && Array.isArray(setting.value) && setting.value.length > 0) {
          setSocials(setting.value as SocialLink[]);
        }
      }
    })();
  }, []);

  return (
    <footer className="border-t border-border bg-background">
      <div className="max-w-6xl mx-auto px-6">
        {/* Top — 4 columns */}
        <div className="grid grid-cols-2 md:grid-cols-12 gap-10 py-16">
          {/* Brand */}
          <div className="col-span-2 md:col-span-5">
            <Link to="/" className="inline-block mb-4">
              <img
                src="/advo-logo-black.png"
                alt="ADVO"
                className="h-6 w-auto invert"
              />
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mb-5">
              We digitalize for you. Web apps, client portals, and digital systems for ambitious businesses.
            </p>
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground/70">
              <MapPin className="h-3.5 w-3.5" />
              Makati, Philippines
            </div>
          </div>

          {/* Company */}
          <div className="md:col-span-3">
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground/60 mb-5">
              Company
            </p>
            <nav className="flex flex-col gap-3">
              {NAV_COMPANY.map((link) => (
                <Link
                  key={link.label}
                  to={link.href}
                  className="text-sm text-foreground/80 hover:text-foreground transition-colors w-fit"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Services */}
          <div className="md:col-span-2">
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground/60 mb-5">
              Services
            </p>
            <ul className="flex flex-col gap-3">
              {NAV_SERVICES.map((service) => (
                <li key={service} className="text-sm text-muted-foreground">
                  {service}
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="md:col-span-2">
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground/60 mb-5">
              Contact
            </p>
            <a
              href="mailto:contact@advo.ph"
              className="group inline-flex items-center gap-1 text-sm text-foreground hover:text-accent transition-colors mb-5"
            >
              contact@advo.ph
              <ArrowUpRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
            </a>

            <nav className="flex items-center gap-1">
              {socials.map((social) => {
                const Icon = ICON_MAP[social.icon] || Globe;
                return (
                  <a
                    key={social.label}
                    href={social.href}
                    target={social.href.startsWith("mailto:") ? undefined : "_blank"}
                    rel={social.href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
                    className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={social.label}
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Bottom — copyright + meta */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-6 border-t border-border text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground/60">
          <span>© {new Date().getFullYear()} ADVO · All rights reserved</span>
          <div className="flex items-center gap-4">
            <span>Built with care in Manila</span>
            <span className="hidden sm:inline">·</span>
            <Link to="/start" className="hover:text-foreground transition-colors">
              Start a project →
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
