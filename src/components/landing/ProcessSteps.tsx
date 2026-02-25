import { motion } from "framer-motion";
import { Search, Palette, Code, Rocket } from "lucide-react";

const steps = [
  {
    icon: Search,
    title: "Discovery",
    description: "Understanding your needs, goals, and vision for the project.",
  },
  {
    icon: Palette,
    title: "Design",
    description: "Crafting intuitive interfaces and user experiences.",
  },
  {
    icon: Code,
    title: "Build",
    description: "Developing with modern tech and iterating based on feedback.",
  },
  {
    icon: Rocket,
    title: "Launch",
    description: "Deploying your product and providing ongoing support.",
  },
];

const ProcessSteps = () => {
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="text-xs font-medium text-accent uppercase tracking-wider mb-2 block">
            Our Process
          </span>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            How We Work
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            A streamlined approach to bring your ideas to life.
          </p>
        </motion.div>

        {/* Process Timeline */}
        <div className="relative">
          {/* Connection Line - behind circles with z-0 */}
          <div className="hidden md:block absolute top-10 left-[12%] right-[12%] h-px bg-border z-0" />
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative z-10">
            {steps.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15, duration: 0.5 }}
                className="text-center group"
              >
                {/* Icon Circle - z-10 to appear above line */}
                <div className="flex justify-center mb-4">
                  <div className="w-20 h-20 rounded-full bg-card border border-border flex items-center justify-center group-hover:border-accent/50 transition-colors shadow-card relative z-10">
                    <step.icon className="w-8 h-8 text-accent" />
                  </div>
                </div>

                {/* Content */}
                <h3 className="font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProcessSteps;
