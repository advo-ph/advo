import { motion } from "framer-motion";
import { ArrowRight, Rocket } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const ContactCTA = () => {
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
            Ready to Digitalize?
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-lg mx-auto">
            Prepare your business for the future. Let's work together.
          </p>
          
          <Button 
            size="lg" 
            className="group btn-press gradient-accent hover:opacity-90 border-0 text-white" 
            asChild
          >
            <Link to="/start">
              <Rocket className="mr-2 h-4 w-4" />
              Start a Project
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
};

export default ContactCTA;
