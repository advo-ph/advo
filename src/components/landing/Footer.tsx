import { useState, useEffect } from "react";
import { Facebook, Instagram, Linkedin, Mail, Twitter, Youtube, Globe } from "lucide-react";
import { get } from "@/lib/api";

const ICON_MAP: Record<string, React.ElementType> = {
  Facebook, Instagram, Linkedin, Mail, Twitter, Youtube, Globe,
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
    <footer className="border-t border-border">
      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <img
          src="/advo-logo-black.png"
          alt="ADVO"
          className="h-5 w-auto dark:invert opacity-60"
        />

        <nav className="flex items-center gap-2">
          {socials.map((social) => {
            const Icon = ICON_MAP[social.icon] || Globe;
            return (
              <a
                key={social.label}
                href={social.href}
                target={social.href.startsWith("mailto:") ? undefined : "_blank"}
                rel={social.href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
                className="p-2 text-muted-foreground/60 hover:text-foreground transition-colors"
                aria-label={social.label}
              >
                <Icon className="h-4 w-4" />
              </a>
            );
          })}
        </nav>

        <span className="text-xs text-muted-foreground/50">
          © {new Date().getFullYear()} ADVO
        </span>
      </div>
    </footer>
  );
};

export default Footer;
