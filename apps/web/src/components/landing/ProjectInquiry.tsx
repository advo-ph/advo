import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Loader2, Mail, Send } from "lucide-react";
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

const PROJECT_TYPES = [
  "Business Website",
  "Online Store",
  "Members App",
  "Queueing System",
  "Ordering System",
  "Software and Hardware",
];

const PERKS = [
  "Scope, timeline, and price in 24h",
  "Online or onsite meeting",
  "No commitment. No pressure.",
];

interface InquiryForm {
  name: string;
  email: string;
  projectType: string;
  description: string;
}

const emptyForm: InquiryForm = {
  name: "",
  email: "",
  projectType: "",
  description: "",
};

interface ProjectInquiryProps {
  /** Render the form as the final in-page section instead of a shell route. */
  embedded?: boolean;
}

const ProjectInquiry = ({ embedded = false }: ProjectInquiryProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState<InquiryForm>(emptyForm);

  const updateField = <K extends keyof InquiryForm>(field: K, value: InquiryForm[K]) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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
        project_type: formData.projectType || null,
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

  const formClass = embedded
    ? "landing-start-form space-y-3"
    : "p-6 md:p-8 bg-card border border-border rounded-2xl space-y-3";

  // Placeholders carry the visible labels so the form stays one screen tall on phones.
  const form = (
    <form onSubmit={handleSubmit} className={formClass}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="sr-only" htmlFor="inquiry-name">Your name</label>
        <Input
          id="inquiry-name"
          value={formData.name}
          onChange={(event) => updateField("name", event.target.value)}
          placeholder="Your name"
          autoComplete="name"
          required
        />
        <label className="sr-only" htmlFor="inquiry-email">Email</label>
        <Input
          id="inquiry-email"
          type="email"
          value={formData.email}
          onChange={(event) => updateField("email", event.target.value)}
          placeholder="Email"
          autoComplete="email"
          required
        />
      </div>

      <Select value={formData.projectType} onValueChange={(value) => updateField("projectType", value)}>
        <SelectTrigger aria-label="Project type">
          <SelectValue placeholder="Project type" />
        </SelectTrigger>
        <SelectContent className="landing-start-select-content">
          {PROJECT_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="sr-only" htmlFor="inquiry-description">What do you need?</label>
      <Textarea
        id="inquiry-description"
        value={formData.description}
        onChange={(event) => updateField("description", event.target.value)}
        placeholder="What do you need?"
        rows={4}
        className="min-h-[112px] resize-none"
        required
      />

      <Button
        type="submit"
        disabled={isSubmitting}
        className={
          embedded
            ? "landing-start-submit w-full btn-press h-12 rounded-md text-base font-medium bg-foreground text-background hover:bg-foreground/90"
            : "w-full btn-press h-12 rounded-md text-base font-medium bg-foreground text-background hover:bg-foreground/90"
        }
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" />
            Send inquiry
          </>
        )}
      </Button>

      {embedded && (
        <p className="landing-start-alt">
          Prefer email? <a href="mailto:contact@advo.ph">contact@advo.ph</a>
        </p>
      )}
    </form>
  );

  if (!embedded && isSubmitted) {
    return (
      <div className="landing-shell-auth">
        <div className="max-w-md text-center">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8"
            style={{ backgroundColor: "hsl(16 92% 60% / 0.15)" }}
          >
            <Check className="h-9 w-9 text-accent" strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mb-3">Got it.</h1>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            Thanks, {formData.name.split(" ")[0]}. We'll review your project and get back to you within 24 hours.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={() => navigate("/")}
              className="btn-press bg-foreground text-background hover:bg-foreground/90"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to home
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
    );
  }

  if (embedded) {
    return (
      <section className="landing-start" id="start" aria-labelledby="start-heading">
        <div className="landing-start-frame">
          <div className="landing-start-copy">
            <h2 id="start-heading">Tell us what you need to modernize.</h2>
            <p>Scope, timeline, and price within 24 hours.</p>
          </div>

          <div>
            {isSubmitted ? (
              <div className="landing-start-form landing-start-success">
                <div className="landing-start-success-mark">
                  <Check size={22} strokeWidth={2.5} aria-hidden="true" />
                </div>
                <p className="landing-kicker">Inquiry received</p>
                <h3>We’ll pick this up from here.</h3>
                <p>
                  Thanks, {formData.name.split(" ")[0]}. We’ll review the details and get back to
                  you within 24 hours.
                </p>
                <a href="mailto:contact@advo.ph">Or email us directly</a>
              </div>
            ) : (
              form
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <main className="landing-shell-main lg:min-h-[calc(100vh-64px)] lg:flex lg:items-center">
      <div className="max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-20">
          <div className="lg:col-span-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-[0.18em] mb-4 block">
              Start a project
            </span>

            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05] mb-6 text-balance">
              Tell us what you need to modernize.
            </h1>

            <div className="space-y-3 mb-10">
              {PERKS.map((perk) => (
                <div key={perk} className="flex items-start gap-3">
                  <div className="mt-0.5 w-5 h-5 rounded-full bg-foreground/5 border border-foreground/15 flex items-center justify-center shrink-0">
                    <Check className="h-3 w-3 text-foreground" strokeWidth={3} />
                  </div>
                  <p className="text-sm text-foreground/85 leading-relaxed">{perk}</p>
                </div>
              ))}
            </div>

            <div className="pt-8 border-t border-border space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary border border-border flex items-center justify-center shrink-0">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5">
                    Prefer email?
                  </p>
                  <a href="mailto:contact@advo.ph" className="text-sm font-medium hover:text-accent transition-colors">
                    contact@advo.ph
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-3">{form}</div>
        </div>
      </div>
    </main>
  );
};

export default ProjectInquiry;
