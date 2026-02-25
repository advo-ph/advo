import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

const Hero = () => {
  const scrollToContent = () => {
    window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
  };

  return (
    <section className="min-h-screen flex flex-col items-center justify-center px-6 relative">
      {/* Grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--border))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, type: "spring", damping: 20 }}
        className="relative z-10 text-center"
      >
        {/* Logo */}
        <motion.div 
          className="mb-8 flex justify-center"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.5, type: "spring", damping: 20 }}
        >
          <img 
            src="/advo-logo-black.png" 
            alt="ADVO" 
            className="h-16 md:h-24 w-auto dark:invert"
          />
        </motion.div>

        {/* Status Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="inline-flex items-center gap-3 px-4 py-2 border border-border rounded-full bg-card"
        >
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-accent" />
          </span>
          <span className="font-mono text-sm text-muted-foreground">
            Status: <span className="text-foreground">Accepting Clients</span>
          </span>
        </motion.div>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-8 text-lg md:text-xl text-muted-foreground max-w-md mx-auto"
        >
          We digitalize it for you.
        </motion.p>
      </motion.div>

      {/* Value Proposition Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.5 }}
        className="relative z-10 mt-16 text-center max-w-2xl mx-auto"
      >
        <p className="text-xl md:text-2xl text-foreground/80 font-medium">
          Does your business need a website? We'll handle everything for you.
        </p>
      </motion.div>

      {/* Scroll indicator - Clean arrow design */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.5 }}
        onClick={scrollToContent}
        className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 cursor-pointer group"
        aria-label="Scroll to content"
      >
        <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
          Scroll
        </span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          className="flex flex-col items-center"
        >
          <div className="w-px h-8 bg-gradient-to-b from-transparent via-muted-foreground to-muted-foreground" />
          <ChevronDown className="w-4 h-4 text-muted-foreground -mt-1" />
        </motion.div>
      </motion.button>
    </section>
  );
};

export default Hero;
