import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Rocket } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface ContactContent {
  heading: string;
  subtext: string;
  cta_label: string;
  cta_url: string;
}

const DEFAULTS: ContactContent = {
  heading: "Ready to Digitalize?",
  subtext: "Prepare your business for the future. Let's work together.",
  cta_label: "Start a Project",
  cta_url: "/start",
};

const ContactCTA = () => {
  const [content, setContent] = useState<ContactContent>(DEFAULTS);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("site_content")
        .select("content")
        .eq("section_id", "contact")
        .maybeSingle();

      if (data?.content) {
        const c = data.content as unknown as Partial<ContactContent>;
        setContent({ ...DEFAULTS, ...c });
      }
    })();
  }, []);

  return (
    <section id="contact" className="py-24 px-6 relative overflow-hidden">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-accent/10" />
      
      <div className="max-w-4xl mx-auto text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, type: "spring", damping: 20 }}
        >
          <span className="text-xs font-medium text-accent uppercase tracking-wider mb-4 block">Let's Build</span>
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            {content.heading}
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-lg mx-auto">
            {content.subtext}
          </p>
          
          <Button 
            size="lg" 
            className="group btn-press gradient-accent hover:opacity-90 border-0 text-white" 
            asChild
          >
            <Link to={content.cta_url}>
              <Rocket className="mr-2 h-4 w-4" />
              {content.cta_label}
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
};

export default ContactCTA;
