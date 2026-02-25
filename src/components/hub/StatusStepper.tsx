import { motion } from "framer-motion";

type Status = "discovery" | "architecture" | "development" | "testing" | "shipped";

interface StatusStepperProps {
  currentStatus: Status;
}

const steps: { key: Status; label: string }[] = [
  { key: "discovery", label: "Discovery" },
  { key: "architecture", label: "Architecture" },
  { key: "development", label: "Development" },
  { key: "testing", label: "Testing" },
  { key: "shipped", label: "Shipped" },
];

const StatusStepper = ({ currentStatus }: StatusStepperProps) => {
  const currentIndex = steps.findIndex((s) => s.key === currentStatus);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isPending = index > currentIndex;

          return (
            <div key={step.key} className="flex items-center flex-1">
              {/* Step circle */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: index * 0.1, duration: 0.3 }}
                className="relative flex flex-col items-center"
              >
                <div
                  className={`
                    w-8 h-8 rounded-full border-2 flex items-center justify-center font-mono text-xs
                    ${isCompleted ? "bg-accent border-accent text-accent-foreground" : ""}
                    ${isCurrent ? "border-accent text-accent glow-accent" : ""}
                    ${isPending ? "border-border text-muted-foreground" : ""}
                  `}
                >
                  {isCompleted ? "✓" : index + 1}
                </div>
                <span
                  className={`
                    mt-2 text-xs font-mono whitespace-nowrap
                    ${isCurrent ? "text-accent" : "text-muted-foreground"}
                  `}
                >
                  {step.label}
                </span>
              </motion.div>

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="flex-1 h-[2px] mx-2 mt-[-1.5rem]">
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: index * 0.1 + 0.2, duration: 0.3 }}
                    className={`
                      h-full origin-left
                      ${isCompleted ? "bg-accent" : "bg-border"}
                    `}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StatusStepper;
