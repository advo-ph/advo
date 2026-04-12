import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus } from "lucide-react";
import { get } from "@/lib/api";
import { Section, SectionHeader } from "@/components/ui/section";

interface FAQItem {
  question: string;
  answer: string;
}

const DEFAULTS: { heading: string; subtitle: string; items: FAQItem[] } = {
  heading: "Common Questions",
  subtitle: "Everything you need to know about working with us.",
  items: [
    { question: "What services do you offer?", answer: "We specialize in web applications, mobile solutions, and cloud architecture. From MVPs to enterprise-scale systems, we handle the full development lifecycle." },
    { question: "How long does a typical project take?", answer: "Project timelines vary based on scope. A simple website might take 2-4 weeks, while a full web application could take 2-3 months. We'll provide a detailed timeline during discovery." },
    { question: "What's your pricing structure?", answer: "We offer flexible pricing based on project scope. We can work on fixed-price projects for well-defined requirements, or time & materials for ongoing development." },
    { question: "Do you offer ongoing support?", answer: "Yes! We provide maintenance packages and can continue as your development partner after launch. We believe in long-term relationships, not just one-off projects." },
    { question: "What technologies do you work with?", answer: "Our core stack includes React, Next.js, Node.js, Python, PostgreSQL, and modern cloud platforms. We choose the best tools for each project." },
  ],
};

const FAQ = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [content, setContent] = useState(DEFAULTS);

  useEffect(() => {
    (async () => {
      const { data } = await get<{ sectionId: string; content: Record<string, unknown> }[]>("/api/content/sections");
      if (data) {
        const section = data.find((s) => s.sectionId === "faq");
        if (section?.content) {
          const c = section.content as Partial<typeof DEFAULTS>;
          setContent({ ...DEFAULTS, ...c, items: c.items?.length ? c.items : DEFAULTS.items });
        }
      }
    })();
  }, []);

  return (
    <Section narrow divided>
      <SectionHeader
        number="05"
        eyebrow="FAQ"
        title={content.heading}
        subtitle={content.subtitle}
        align="center"
      />

      <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
        {content.items.map((faq, index) => (
          <div key={index} className="bg-card">
            <button
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              className="w-full flex items-center justify-between p-5 text-left hover:bg-secondary/50 transition-colors"
            >
              <span className="font-medium pr-4">{faq.question}</span>
              <span className="shrink-0 w-6 h-6 rounded-full border border-border flex items-center justify-center">
                {openIndex === index ? (
                  <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </span>
            </button>
            <AnimatePresence>
              {openIndex === index && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-5 text-muted-foreground text-sm leading-relaxed">
                    {faq.answer}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </Section>
  );
};

export default FAQ;
