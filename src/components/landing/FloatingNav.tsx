import { useState, useEffect, useLayoutEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Use useLayoutEffect on client, useEffect on server
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const FloatingNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isLandingPage = location.pathname === "/";
  
  // All pages use scroll-based behavior: full at top, pill when scrolled
  const [isScrolled, setIsScrolled] = useState(() => {
    if (typeof window !== "undefined") {
      return window.scrollY > 80;
    }
    return false;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useIsomorphicLayoutEffect(() => {
    // All pages use scroll-based behavior
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 80);
    };
    
    handleScroll();
    
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [location.pathname]); // Re-run when route changes

  const handleAboutClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isLandingPage) {
      // Scroll to top of landing page
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      // Navigate to landing page
      navigate("/");
    }
  };

  const navLinks = [
    { label: "About", href: "/", onClick: handleAboutClick },
    { label: "Team", href: "/team" },
    { label: "Client Hub", href: "/hub" },
  ];

  // Use isScrolled directly since we initialize correctly
  const showScrolledStyle = isScrolled;


  return (
    <>
      <header
        className={`
          fixed top-0 left-0 right-0 z-50 
          transition-all duration-500 ease-out
          ${showScrolledStyle 
            ? "pt-3 px-4" 
            : "bg-background backdrop-blur-lg border-b border-border/50"
          }
        `}
        style={{ 
          // Prevent layout shift by reserving space
          minHeight: showScrolledStyle ? "auto" : "64px" 
        }}
      >
        <div
          className={`
            mx-auto flex items-center justify-between
            transition-all duration-500 ease-out
            ${showScrolledStyle 
              ? "max-w-xl h-14 rounded-full border border-border shadow-lg px-3 bg-background backdrop-blur-lg" 
              : "max-w-6xl h-16 px-6"
            }
          `}
        >
          {/* Logo */}
          <Link
            to="/"
            className="shrink-0"
          >
            <img 
              src="/advo-logo-black.png" 
              alt="ADVO" 
              className="h-6 w-auto dark:invert"
              width={72}
              height={24}
              loading="eager"
            />
          </Link>

          {/* Desktop Nav Links */}
          <nav 
            className={`
              hidden md:flex items-center
              transition-all duration-500 ease-out
              ${showScrolledStyle ? "gap-1" : "gap-6"}
            `}
          >
            {navLinks.map((link) => (
              <Link
                key={link.label}
                to={link.href}
                onClick={link.onClick}
                className={`
                  text-sm text-muted-foreground hover:text-foreground 
                  transition-all duration-300 rounded-full
                  ${showScrolledStyle ? "px-3 py-1.5 hover:bg-secondary/50" : "px-2 py-1"}
                `}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 shrink-0">
            <Link to="/start" className="hidden sm:block">
              <Button
                size="sm"
                className="rounded-full px-4 bg-foreground text-background hover:bg-foreground/90"
              >
                Get Started
              </Button>
            </Link>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Dropdown */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`fixed ${showScrolledStyle ? "top-20" : "top-16"} left-4 right-4 z-40 md:hidden`}
          >
            <div className="bg-card/95 backdrop-blur-xl border border-border rounded-2xl p-4 shadow-xl">
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
                className="block pt-3"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <Button className="w-full rounded-full bg-foreground text-background">
                  Get Started
                </Button>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default FloatingNav;
