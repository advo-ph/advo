import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import Hero from "@/components/landing/Hero";
import WhyDigital from "@/components/landing/WhyDigital";
import ProcessSteps from "@/components/landing/ProcessSteps";
import PortfolioGrid from "@/components/landing/PortfolioGrid";
import ServiceTiers from "@/components/landing/ServiceTiers";
import FAQ from "@/components/landing/FAQ";
import ContactCTA from "@/components/landing/ContactCTA";
import Footer from "@/components/landing/Footer";
import FloatingNav from "@/components/landing/FloatingNav";
import { supabase } from "@/integrations/supabase/client";

/* ─── Map site_content section_id → component ───────────── */

const SECTION_MAP: Record<string, React.ComponentType> = {
  hero: Hero,
  services: ServiceTiers,
  portfolio: PortfolioGrid,
  contact: ContactCTA,
};

/* Sections that always render (no toggle) */
const ALWAYS_VISIBLE = [
  { key: "why-digital", Component: WhyDigital },
  { key: "process", Component: ProcessSteps },
  { key: "faq", Component: FAQ },
];

interface Visibility {
  section_id: string;
  visible_public: boolean;
}

const Index = () => {
  const [visibility, setVisibility] = useState<Visibility[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("site_content")
        .select("section_id, visible_public");
      setVisibility((data as Visibility[]) || []);
      setLoaded(true);
    })();
  }, []);

  const isVisible = (sectionId: string) => {
    const entry = visibility.find((v) => v.section_id === sectionId);
    return entry ? entry.visible_public : true; // default visible if not in DB
  };

  if (!loaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <FloatingNav />

      {/* Toggleable sections */}
      {isVisible("hero") && <Hero />}
      <WhyDigital />
      <ProcessSteps />
      {isVisible("portfolio") && <PortfolioGrid />}
      {isVisible("services") && <ServiceTiers />}
      <FAQ />
      {isVisible("contact") && <ContactCTA />}

      <Footer />
    </div>
  );
};

export default Index;
