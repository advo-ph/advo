import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Softer action hierarchy shared by the finance page, project tab and dialogs. */
export const FinanceButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "default", className, ...props }, ref) => (
    <Button
      ref={ref}
      variant={variant === "default" ? "outline" : variant}
      className={cn(
        variant === "default" &&
          "border-accent/25 bg-accent/10 text-accent-ink shadow-sm hover:border-accent/40 hover:bg-accent/20 hover:text-accent-ink disabled:shadow-none",
        variant === "outline" &&
          "hover:border-foreground/20 hover:bg-secondary hover:text-foreground",
        variant === "ghost" && "hover:bg-secondary hover:text-foreground",
        className,
      )}
      {...props}
    />
  ),
);
FinanceButton.displayName = "FinanceButton";
