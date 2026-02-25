import Hero from "@/components/landing/Hero";
import WhyDigital from "@/components/landing/WhyDigital";
import ProcessSteps from "@/components/landing/ProcessSteps";
import PortfolioGrid from "@/components/landing/PortfolioGrid";
import ServiceTiers from "@/components/landing/ServiceTiers";
import FAQ from "@/components/landing/FAQ";
import ContactCTA from "@/components/landing/ContactCTA";
import Footer from "@/components/landing/Footer";
import FloatingNav from "@/components/landing/FloatingNav";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <FloatingNav />
      <Hero />
      <WhyDigital />
      <ProcessSteps />
      <PortfolioGrid />
      <ServiceTiers />
      <FAQ />
      <ContactCTA />
      <Footer />
    </div>
  );
};

export default Index;


