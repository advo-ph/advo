import { motion } from "framer-motion";
import { Globe, TrendingUp, Clock, Users } from "lucide-react";

const benefits = [
  {
    icon: Globe,
    title: "24/7 Online Presence",
    description: "Your business never sleeps. Reach customers anytime, anywhere in the world.",
  },
  {
    icon: TrendingUp,
    title: "Scale Effortlessly",
    description: "Digital systems grow with your business without the overhead of traditional expansion.",
  },
  {
    icon: Clock,
    title: "Save Time & Resources",
    description: "Automate repetitive tasks and focus on what matters—growing your business.",
  },
  {
    icon: Users,
    title: "Better Customer Experience",
    description: "Modern interfaces that your customers expect and love to use.",
  },
];

const WhyDigital = () => {
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
            Why Go Digital
          </span>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Invest in Your Digital Future
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            In today's world, having a digital presence isn't optional—it's essential for growth.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((benefit, index) => (
            <motion.div
              key={benefit.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              className="group p-6 bg-card border border-border rounded-xl hover:border-accent/50 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center mb-4 group-hover:bg-accent/10 transition-colors">
                <benefit.icon className="w-5 h-5 text-accent" />
              </div>
              <h3 className="font-semibold mb-2">{benefit.title}</h3>
              <p className="text-sm text-muted-foreground">{benefit.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyDigital;
