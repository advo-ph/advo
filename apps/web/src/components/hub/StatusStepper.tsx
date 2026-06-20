import { Check } from "lucide-react";

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

          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              {/* Step circle */}
              <div className="relative flex flex-col items-center">
                <div
                  className={`
                    h-6 w-6 rounded-full border flex items-center justify-center text-[11px] tabular-nums
                    ${isCompleted ? "bg-accent border-accent text-accent-foreground" : ""}
                    ${isCurrent ? "border-accent text-accent" : ""}
                    ${!isCompleted && !isCurrent ? "border-border text-muted-foreground" : ""}
                  `}
                >
                  {isCompleted ? <Check className="h-3 w-3" /> : index + 1}
                </div>
                <span
                  className={`mt-1.5 text-xs whitespace-nowrap ${
                    isCurrent ? "text-accent font-medium" : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="flex-1 h-px mx-2 mb-5">
                  <div className={`h-full ${isCompleted ? "bg-accent" : "bg-border"}`} />
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
