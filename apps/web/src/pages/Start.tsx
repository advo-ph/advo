import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Send,
  Loader2,
  Check,
  Mail,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as db from "@/lib/db";
import { useToast } from "@/hooks/use-toast";
import LandingShell from "@/components/landing/landing-shell";

const BUDGET_RANGES = [
  { value: "under-50k", label: "Under ₱50,000" },
  { value: "50k-100k", label: "₱50,000 – ₱100,000" },
  { value: "100k-250k", label: "₱100,000 – ₱250,000" },
  { value: "250k-500k", label: "₱250,000 – ₱500,000" },
  { value: "500k-plus", label: "₱500,000+" },
  { value: "not-sure", label: "Not sure yet" },
];

const PROJECT_TYPES = [
  "Web Application",
  "Mobile App",
  "E-commerce",
  "SaaS Platform",
  "Landing Page",
  "Custom Software",
  "Other",
];

const PERKS = [
  "Scope, timeline, and price in 24h",
  "Optional 30-min discovery call",
  "No commitment. No pressure.",
];

const Start = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    projectType: "",
    budget: "",
    description: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.description) {
      toast({
        title: "Missing information",
        description: "Please fill in your name, email, and project description.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await db.createLead({
        name: formData.name,
        email: formData.email,
        company: formData.company || null,
        project_type: formData.projectType || null,
        budget: formData.budget || null,
        description: formData.description,
      });

      if (error) throw new Error(error);

      setIsSubmitted(true);
      toast({
        title: "Inquiry sent!",
        description: "We'll be in touch within 24 hours.",
      });
    } catch (error) {
      console.error("Error submitting inquiry:", error);
      toast({
        title: "Something went wrong",
        description: "Please try again or email us at contact@advo.ph",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <LandingShell>
        <div className="landing-shell-auth">
          <div className="max-w-md text-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8"
              style={{ backgroundColor: "hsl(16 92% 60% / 0.15)" }}
            >
              <Check className="h-9 w-9 text-accent" strokeWidth={2.5} />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mb-3">
              Got it.
            </h1>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              Thanks, {formData.name.split(" ")[0]}. We'll review your project
              and get back to you within 24 hours.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                onClick={() => navigate("/")}
                className="btn-press bg-foreground text-background hover:bg-foreground/90"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
              <a
                href="mailto:contact@advo.ph"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Mail className="h-4 w-4" />
                Or email us directly
              </a>
            </div>
          </div>
        </div>
      </LandingShell>
    );
  }

  return (
    <LandingShell>
      <main className="landing-shell-main">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-20">
            {/* Left — Info */}
            <div className="lg:col-span-2">
              <div className="flex items-baseline gap-6 mb-4">
                <span className="text-[48px] md:text-[64px] font-mono font-light text-muted-foreground/30 leading-none tracking-tighter">
                  06
                </span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-[0.18em]">
                  Start a Project
                </span>
              </div>

              <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05] mb-6 text-balance">
                Tell us what you're building.
              </h1>

              <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
                Sketch, napkin, bullet points — all welcome.
              </p>

              {/* What you get */}
              <div className="space-y-3 mb-10">
                {PERKS.map((perk) => (
                  <div key={perk} className="flex items-start gap-3">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center shrink-0">
                      <Check className="h-3 w-3 text-accent" strokeWidth={3} />
                    </div>
                    <p className="text-sm text-foreground/85 leading-relaxed">
                      {perk}
                    </p>
                  </div>
                ))}
              </div>

              {/* Quick contact */}
              <div className="pt-8 border-t border-border space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary border border-border flex items-center justify-center shrink-0">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5">
                      Prefer email?
                    </p>
                    <a
                      href="mailto:contact@advo.ph"
                      className="text-sm font-medium hover:text-accent transition-colors"
                    >
                      contact@advo.ph
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary border border-border flex items-center justify-center shrink-0">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5">
                      Response time
                    </p>
                    <p className="text-sm font-medium">
                      Within 24 hours, every time
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right — Form */}
            <div className="lg:col-span-3">
              <form
                onSubmit={handleSubmit}
                className="p-6 md:p-8 bg-card border border-border rounded-2xl space-y-6"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Your Name <span className="text-accent">*</span>
                    </label>
                    <Input
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="Juan dela Cruz"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Email <span className="text-accent">*</span>
                    </label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      placeholder="juan@company.ph"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Company
                  </label>
                  <Input
                    value={formData.company}
                    onChange={(e) =>
                      setFormData({ ...formData, company: e.target.value })
                    }
                    placeholder="Optional"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Project Type
                    </label>
                    <Select
                      value={formData.projectType}
                      onValueChange={(v) =>
                        setFormData({ ...formData, projectType: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {PROJECT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Budget
                    </label>
                    <Select
                      value={formData.budget}
                      onValueChange={(v) =>
                        setFormData({ ...formData, budget: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select range" />
                      </SelectTrigger>
                      <SelectContent>
                        {BUDGET_RANGES.map((range) => (
                          <SelectItem key={range.value} value={range.value}>
                            {range.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Tell us about your project <span className="text-accent">*</span>
                  </label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="What are you building? What problem does it solve?"
                    rows={6}
                    className="min-h-[160px] resize-none"
                    required
                  />
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full btn-press h-12 rounded-full text-base font-medium text-white"
                    style={{
                      backgroundColor: "hsl(16 92% 60%)",
                    }}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Inquiry
                      </>
                    )}
                  </Button>

                </div>
              </form>
            </div>
          </div>
        </div>
      </main>
    </LandingShell>
  );
};

export default Start;
