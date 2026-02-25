import { motion } from "framer-motion";
import { Facebook, Instagram, Linkedin, Mail } from "lucide-react";

const Footer = () => {
  const socials = [
    {
      icon: Facebook,
      href: "https://www.facebook.com/share/1DDt8dVJUd/?mibextid=wwXIfr",
      label: "Facebook",
    },
    {
      icon: Instagram,
      href: "https://www.instagram.com/advo_ph/",
      label: "Instagram",
    },
    {
      icon: Linkedin,
      href: "https://www.linkedin.com/company/advocompany/",
      label: "LinkedIn",
    },
    {
      icon: Mail,
      href: "mailto:contact@advo.ph",
      label: "Email",
    },
  ];

  return (
    <footer className="py-6 px-6 border-t border-border">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex flex-col md:flex-row items-center justify-between gap-6"
        >
          {/* Logo */}
          <img 
            src="/advo-logo-black.png" 
            alt="ADVO" 
            className="h-6 w-auto dark:invert"
          />

          {/* Social Links */}
          <nav className="flex items-center gap-4">
            {socials.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target={social.href.startsWith("mailto:") ? undefined : "_blank"}
                rel={social.href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={social.label}
              >
                <social.icon className="h-5 w-5" />
              </a>
            ))}
          </nav>

          {/* Copyright */}
          <span className="font-mono text-xs text-muted-foreground">
            © {new Date().getFullYear()} ADVO
          </span>
        </motion.div>
      </div>
    </footer>
  );
};

export default Footer;
