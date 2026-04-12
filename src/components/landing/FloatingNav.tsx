import { useState, useEffect, useLayoutEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const SPRING = { type: "spring" as const, stiffness: 380, damping: 38, mass: 0.8 };

const FloatingNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isLandingPage = location.pathname === "/";

  const [isScrolled, setIsScrolled] = useState(() =>
    typeof window !== "undefined" ? window.scrollY > 80 : false,
  );
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 80);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [location.pathname]);

  const handleAboutClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isLandingPage) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      navigate("/");
    }
  };

  const navLinks = [
    { label: "About", href: "/", onClick: handleAboutClick },
    { label: "Team", href: "/team" },
    { label: "Client Hub", href: "/login" },
  ];

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50">
        <motion.div
          initial={false}
          animate={{
            paddingTop: isScrolled ? 12 : 0,
            paddingLeft: isScrolled ? 16 : 0,
            paddingRight: isScrolled ? 16 : 0,
          }}
          transition={SPRING}
        >
          <motion.div
            initial={false}
            transition={SPRING}
            animate={{
              maxWidth: isScrolled ? 560 : 1152,
              height: isScrolled ? 52 : 72,
              borderRadius: 9999,
              backgroundColor: isScrolled
                ? "hsla(0, 0%, 10%, 0.55)"
                : "hsla(0, 0%, 10%, 0)",
              borderColor: isScrolled
                ? "hsla(0, 0%, 100%, 0.08)"
                : "hsla(0, 0%, 100%, 0)",
              boxShadow: isScrolled
                ? "inset 0 1px 0 hsla(0, 0%, 100%, 0.08), inset 0 -1px 0 hsla(0, 0%, 0%, 0.3), 0 12px 40px -8px hsla(0, 0%, 0%, 0.5)"
                : "inset 0 1px 0 hsla(0, 0%, 100%, 0), inset 0 -1px 0 hsla(0, 0%, 0%, 0), 0 12px 40px -8px hsla(0, 0%, 0%, 0)",
            }}
            style={{
              borderWidth: 1,
              borderStyle: "solid",
              backdropFilter: isScrolled
                ? "blur(24px) saturate(180%)"
                : "blur(0px) saturate(100%)",
              WebkitBackdropFilter: isScrolled
                ? "blur(24px) saturate(180%)"
                : "blur(0px) saturate(100%)",
              transition:
                "backdrop-filter 250ms ease-out, -webkit-backdrop-filter 250ms ease-out",
              willChange: "transform, max-width, height",
            }}
            className="mx-auto flex items-center justify-between px-6"
          >
            <Link to="/" className="shrink-0">
              <img
                src="/advo-logo-black.png"
                alt="ADVO"
                className="h-5 w-auto invert"
                width={72}
                height={20}
                loading="eager"
              />
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  to={link.href}
                  onClick={link.onClick}
                  className="text-sm text-foreground/75 hover:text-foreground hover:bg-secondary/60 transition-colors rounded-full px-3 py-1.5"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              <Link
                to="/start"
                className="hidden sm:inline-flex items-center px-4 py-1.5 rounded-full bg-foreground text-background text-sm font-medium hover:bg-foreground/90 btn-press"
              >
                Get Started
              </Link>

              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 text-foreground hover:text-foreground transition-colors"
                style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.6))" }}
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? (
                  <X className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      </header>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="fixed top-[5rem] left-4 right-4 z-40 md:hidden"
          >
            <div className="bg-card border border-border rounded-2xl p-4">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  to={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                to="/start"
                className="block mt-2 px-4 py-2.5 rounded-full bg-foreground text-background text-sm font-medium text-center"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Get Started
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default FloatingNav;
