import { useState, useEffect, useLayoutEffect, useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, LogIn, Menu, X } from "lucide-react";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const SPRING = { type: "spring" as const, stiffness: 380, damping: 38, mass: 0.8 };

const FloatingNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isLandingPage = location.pathname === "/";
  const shouldReduceMotion = useReducedMotion();

  const [isScrolled, setIsScrolled] = useState(() => {
    if (typeof window === "undefined") return false;
    const el = document.getElementById("root");
    return (el?.scrollTop ?? window.scrollY) > 80;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), []);

  useIsomorphicLayoutEffect(() => {
    const el = document.getElementById("root");
    const handleScroll = () =>
      setIsScrolled((el?.scrollTop ?? window.scrollY) > 80);
    handleScroll();
    const target: Window | HTMLElement = el ?? window;
    target.addEventListener("scroll", handleScroll, { passive: true } as AddEventListenerOptions);
    return () =>
      target.removeEventListener("scroll", handleScroll as EventListener);
  }, [location.pathname]);

  // Close drawer on route change so navigating from inside it doesn't leave it open.
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Escape closes the drawer + body scroll lock while open.
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobileMenu();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [isMobileMenuOpen, closeMobileMenu]);

  const handleAboutClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isLandingPage) {
      (document.getElementById("root") ?? document.scrollingElement)?.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } else {
      navigate("/");
    }
  };

  const navLinks = [
    { label: "About", href: "/", onClick: handleAboutClick },
    { label: "Team", href: "/team" },
    { label: "Client Hub", href: "/login" },
  ];

  const drawerMotion = shouldReduceMotion
    ? { initial: false, animate: { y: 0 }, exit: { y: 0 }, transition: { duration: 0 } }
    : { initial: { y: -12 }, animate: { y: 0 }, exit: { y: -12 }, transition: { duration: 0.2 } };

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
                onClick={() => setIsMobileMenuOpen((open) => !open)}
                className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground hover:bg-secondary/70 transition-colors"
                style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.6))" }}
                aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={isMobileMenuOpen}
                aria-controls="mobile-navigation-drawer"
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
            id="mobile-navigation-drawer"
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1 }}
            transition={{ duration: 0 }}
            className="fixed inset-0 z-40 min-h-svh bg-background pt-[5.5rem] md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
          >
            <motion.div
              {...drawerMotion}
              className="relative mx-4 flex min-h-[calc(100svh-6.5rem)] flex-col overflow-hidden rounded-2xl border border-border/75 bg-card shadow-lg"
            >
              <div className="border-b border-border/55 px-5 py-5">
                <p className="mb-2 inline-flex items-center gap-2 rounded-md border border-accent/20 bg-accent/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                  ADVO
                </p>
                <p className="max-w-[18rem] text-lg font-semibold leading-snug tracking-tight">
                  Websites with the system behind them.
                </p>
              </div>

              <nav className="flex-1 px-3 py-3">
                {navLinks.map((link, index) => (
                  <Link
                    key={link.label}
                    to={link.href}
                    onClick={(event) => {
                      link.onClick?.(event);
                      closeMobileMenu();
                    }}
                    className="group flex min-h-16 items-center justify-between rounded-xl px-3.5 py-3 text-left transition-colors hover:bg-secondary/70"
                  >
                    <span>
                      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        0{index + 1}
                      </span>
                      <span className="block text-2xl font-semibold tracking-tight text-foreground">
                        {link.label}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                  </Link>
                ))}
              </nav>

              <div className="mt-auto grid gap-px border-t border-border/60 bg-border/60 sm:grid-cols-2">
                <Link
                  to="/start"
                  className="group flex min-h-16 items-center justify-between bg-card px-5 py-4 text-sm font-medium transition-colors hover:bg-secondary/70"
                  onClick={closeMobileMenu}
                >
                  Start a Project
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                </Link>
                <Link
                  to="/login"
                  className="group flex min-h-16 items-center justify-between bg-card px-5 py-4 text-sm font-medium transition-colors hover:bg-secondary/70"
                  onClick={closeMobileMenu}
                >
                  <span className="inline-flex items-center gap-2">
                    <LogIn className="h-4 w-4 text-accent" />
                    Client Hub
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default FloatingNav;
