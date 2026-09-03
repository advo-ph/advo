import { useState } from "react";
import {
  Globe,
  Monitor,
  ChevronDown,
  ChevronUp,
  Save,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSiteContent, type SiteSection } from "@/hooks/useSiteContent";
import { PageHeader, Panel } from "./_ui";

/* ─── Content edit forms per section ──────────────────────── */

/**
 * Every form takes the same three things. `isSaving` is the one that was
 * missing: these buttons fired a mutation and then looked exactly as they had
 * a moment before, so the only way to tell a save from a no-op was to wait for
 * a toast. A slow save read as a dead button, and an impatient second click
 * sent the whole payload again.
 */
interface SectionFormProps {
  section: SiteSection;
  onSave: (c: Record<string, unknown>) => void;
  isSaving: boolean;
}

/** The one save affordance, so no form can quietly go back to having none. */
const SaveButton = ({
  isSaving,
  onClick,
  children,
}: {
  isSaving: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <Button size="sm" className="w-fit" onClick={onClick} disabled={isSaving}>
    {isSaving ? (
      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
    ) : (
      <Save className="h-3.5 w-3.5 mr-1.5" />
    )}
    {isSaving ? "Saving…" : children}
  </Button>
);

const HeroForm = ({ section, onSave, isSaving }: SectionFormProps) => {
  const c = (section.content || {}) as Record<string, unknown>;
  const [headline, setHeadline] = useState((c.headline as string) || "");
  const [subtext, setSubtext] = useState((c.subtext as string) || "");
  const [ctaLabel, setCtaLabel] = useState(
    (c.cta_primary_label as string) || ""
  );
  const [ctaUrl, setCtaUrl] = useState((c.cta_primary_url as string) || "");
  const [badgeText, setBadgeText] = useState(
    (c.status_badge_text as string) || ""
  );
  const [badgeVisible, setBadgeVisible] = useState(
    (c.status_badge_visible as boolean) ?? true
  );

  return (
    <div className="grid gap-3 pt-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Headline
        </label>
        <Input value={headline} onChange={(e) => setHeadline(e.target.value)} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Subtext
        </label>
        <Textarea
          value={subtext}
          onChange={(e) => setSubtext(e.target.value)}
          rows={2}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            CTA Label
          </label>
          <Input
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            CTA URL
          </label>
          <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Status Badge Text
          </label>
          <Input
            value={badgeText}
            onChange={(e) => setBadgeText(e.target.value)}
          />
        </div>
        <div className="flex items-end gap-2">
          <Button
            variant={badgeVisible ? "default" : "outline"}
            size="sm"
            onClick={() => setBadgeVisible(!badgeVisible)}
          >
            {badgeVisible ? "Badge Visible" : "Badge Hidden"}
          </Button>
        </div>
      </div>
      <SaveButton
        isSaving={isSaving}
        onClick={() =>
          onSave({
            headline,
            subtext,
            cta_primary_label: ctaLabel,
            cta_primary_url: ctaUrl,
            status_badge_text: badgeText,
            status_badge_visible: badgeVisible,
          })
        }
      >
        Save Hero
      </SaveButton>
    </div>
  );
};

const ContactForm = ({ section, onSave, isSaving }: SectionFormProps) => {
  const c = (section.content || {}) as Record<string, unknown>;
  const [email, setEmail] = useState((c.email as string) || "");
  const [calendlyUrl, setCalendlyUrl] = useState(
    (c.calendly_url as string) || ""
  );
  const [showForm, setShowForm] = useState((c.show_form as boolean) ?? true);

  return (
    <div className="grid gap-3 pt-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Contact Email
          </label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Calendly URL
          </label>
          <Input
            value={calendlyUrl}
            onChange={(e) => setCalendlyUrl(e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant={showForm ? "default" : "outline"}
          size="sm"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Contact Form Visible" : "Contact Form Hidden"}
        </Button>
      </div>
      <SaveButton
        isSaving={isSaving}
        onClick={() =>
          onSave({
            email,
            calendly_url: calendlyUrl || null,
            show_form: showForm,
          })
        }
      >
        Save Contact
      </SaveButton>
    </div>
  );
};

const ClientDashboardForm = ({ section, onSave, isSaving }: SectionFormProps) => {
  const c = (section.content || {}) as Record<string, unknown>;
  const [welcomeMessage, setWelcomeMessage] = useState(
    (c.welcome_message as string) || ""
  );

  return (
    <div className="grid gap-3 pt-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Welcome Message
        </label>
        <Textarea
          value={welcomeMessage}
          onChange={(e) => setWelcomeMessage(e.target.value)}
          rows={2}
        />
      </div>
      <SaveButton isSaving={isSaving} onClick={() => onSave({ welcome_message: welcomeMessage })}>
        Save
      </SaveButton>
    </div>
  );
};

const ServicesForm = ({ section, onSave, isSaving }: SectionFormProps) => {
  const c = (section.content || {}) as Record<string, unknown>;
  const initial = (c.items as Array<Record<string, string>>) || [];
  const [items, setItems] = useState(initial);

  const update = (idx: number, field: string, val: string) => {
    const next = items.map((item, i) =>
      i === idx ? { ...item, [field]: val } : item
    );
    setItems(next);
  };

  return (
    <div className="grid gap-3 pt-3">
      {items.map((item, idx) => (
        <div key={idx} className="grid grid-cols-3 gap-2">
          <Input
            placeholder="Title"
            value={item.title || ""}
            onChange={(e) => update(idx, "title", e.target.value)}
          />
          <Input
            placeholder="Description"
            value={item.description || ""}
            onChange={(e) => update(idx, "description", e.target.value)}
          />
          <Input
            placeholder="Icon name"
            value={item.icon || ""}
            onChange={(e) => update(idx, "icon", e.target.value)}
          />
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setItems([...items, { title: "", description: "", icon: "" }])
          }
        >
          + Add Service
        </Button>
        <SaveButton isSaving={isSaving} onClick={() => onSave({ items })}>
          Save Services
        </SaveButton>
      </div>
    </div>
  );
};

const PricingForm = ({ section, onSave, isSaving }: SectionFormProps) => {
  const c = (section.content || {}) as Record<string, unknown>;
  interface Plan {
    name: string;
    price_label: string;
    description: string;
    features: string[];
    is_featured: boolean;
  }
  const initial = (c.plans as Plan[]) || [];
  const [plans, setPlans] = useState<Plan[]>(initial);

  const updatePlan = (idx: number, field: string, val: unknown) => {
    const next = plans.map((p, i) =>
      i === idx ? { ...p, [field]: val } : p
    );
    setPlans(next);
  };

  return (
    <div className="grid gap-4 pt-3">
      {plans.map((plan, idx) => (
        <div
          key={idx}
          className="p-3 border border-border rounded-lg space-y-2"
        >
          <div className="grid grid-cols-3 gap-2">
            <Input
              placeholder="Plan name"
              value={plan.name}
              onChange={(e) => updatePlan(idx, "name", e.target.value)}
            />
            <Input
              placeholder="Price"
              value={plan.price_label}
              onChange={(e) => updatePlan(idx, "price_label", e.target.value)}
            />
            <Input
              placeholder="Description"
              value={plan.description}
              onChange={(e) => updatePlan(idx, "description", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Features (comma-separated)
            </label>
            <Input
              value={plan.features.join(", ")}
              onChange={(e) =>
                updatePlan(
                  idx,
                  "features",
                  e.target.value.split(",").map((s) => s.trim())
                )
              }
            />
          </div>
          <Button
            variant={plan.is_featured ? "default" : "outline"}
            size="sm"
            onClick={() => updatePlan(idx, "is_featured", !plan.is_featured)}
          >
            {plan.is_featured ? "★ Featured" : "Not Featured"}
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setPlans([
              ...plans,
              {
                name: "",
                price_label: "",
                description: "",
                features: [],
                is_featured: false,
              },
            ])
          }
        >
          + Add Plan
        </Button>
        <SaveButton isSaving={isSaving} onClick={() => onSave({ plans })}>
          Save Pricing
        </SaveButton>
      </div>
    </div>
  );
};

const TestimonialsForm = ({ section, onSave, isSaving }: SectionFormProps) => {
  const c = (section.content || {}) as Record<string, unknown>;
  interface Testimonial {
    quote: string;
    author: string;
    company: string;
    avatar_url: string | null;
  }
  const initial = (c.items as Testimonial[]) || [];
  const [items, setItems] = useState<Testimonial[]>(initial);

  const update = (idx: number, field: string, val: string) => {
    const next = items.map((item, i) =>
      i === idx ? { ...item, [field]: val } : item
    );
    setItems(next);
  };

  return (
    <div className="grid gap-3 pt-3">
      {items.map((item, idx) => (
        <div key={idx} className="grid grid-cols-3 gap-2">
          <Textarea
            placeholder="Quote"
            value={item.quote}
            onChange={(e) => update(idx, "quote", e.target.value)}
            rows={2}
          />
          <Input
            placeholder="Author"
            value={item.author}
            onChange={(e) => update(idx, "author", e.target.value)}
          />
          <Input
            placeholder="Company"
            value={item.company}
            onChange={(e) => update(idx, "company", e.target.value)}
          />
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setItems([
              ...items,
              { quote: "", author: "", company: "", avatar_url: null },
            ])
          }
        >
          + Add Testimonial
        </Button>
        <SaveButton isSaving={isSaving} onClick={() => onSave({ items })}>
          Save Testimonials
        </SaveButton>
      </div>
    </div>
  );
};

const FAQForm = ({ section, onSave, isSaving }: SectionFormProps) => {
  const c = (section.content || {}) as Record<string, unknown>;
  interface FAQ { question: string; answer: string }
  const initial = (c.items as FAQ[]) || [];
  const [items, setItems] = useState<FAQ[]>(initial);

  const update = (idx: number, field: string, val: string) => {
    setItems(items.map((item, i) => (i === idx ? { ...item, [field]: val } : item)));
  };

  return (
    <div className="grid gap-3 pt-3">
      {items.map((item, idx) => (
        <div key={idx} className="grid grid-cols-2 gap-2">
          <Input placeholder="Question" value={item.question} onChange={(e) => update(idx, "question", e.target.value)} />
          <Textarea placeholder="Answer" value={item.answer} onChange={(e) => update(idx, "answer", e.target.value)} rows={2} />
        </div>
      ))}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setItems([...items, { question: "", answer: "" }])}>
          + Add FAQ
        </Button>
        <SaveButton isSaving={isSaving} onClick={() => onSave({ items })}>
          Save FAQ
        </SaveButton>
      </div>
    </div>
  );
};

const ProcessForm = ({ section, onSave, isSaving }: SectionFormProps) => {
  const c = (section.content || {}) as Record<string, unknown>;
  interface Step { title: string; description: string }
  const initial = (c.steps as Step[]) || [];
  const [steps, setSteps] = useState<Step[]>(initial);

  const update = (idx: number, field: string, val: string) => {
    setSteps(steps.map((s, i) => (i === idx ? { ...s, [field]: val } : s)));
  };

  return (
    <div className="grid gap-3 pt-3">
      {steps.map((step, idx) => (
        <div key={idx} className="grid grid-cols-3 gap-2 items-center">
          <span className="text-xs text-muted-foreground text-center tabular-nums">Step {idx + 1}</span>
          <Input placeholder="Title" value={step.title} onChange={(e) => update(idx, "title", e.target.value)} />
          <Input placeholder="Description" value={step.description} onChange={(e) => update(idx, "description", e.target.value)} />
        </div>
      ))}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setSteps([...steps, { title: "", description: "" }])}>
          + Add Step
        </Button>
        <SaveButton isSaving={isSaving} onClick={() => onSave({ steps })}>
          Save Process
        </SaveButton>
      </div>
    </div>
  );
};

const WhyDigitalForm = ({ section, onSave, isSaving }: SectionFormProps) => {
  const c = (section.content || {}) as Record<string, unknown>;
  const [headline, setHeadline] = useState((c.headline as string) || "");
  const [subtext, setSubtext] = useState((c.subtext as string) || "");
  interface Feature { title: string; description: string }
  const initial = (c.features as Feature[]) || [];
  const [features, setFeatures] = useState<Feature[]>(initial);

  const update = (idx: number, field: string, val: string) => {
    setFeatures(features.map((f, i) => (i === idx ? { ...f, [field]: val } : f)));
  };

  return (
    <div className="grid gap-3 pt-3">
      <Input placeholder="Headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
      <Textarea placeholder="Subtext" value={subtext} onChange={(e) => setSubtext(e.target.value)} rows={2} />
      {features.map((f, idx) => (
        <div key={idx} className="grid grid-cols-2 gap-2">
          <Input placeholder="Feature title" value={f.title} onChange={(e) => update(idx, "title", e.target.value)} />
          <Input placeholder="Description" value={f.description} onChange={(e) => update(idx, "description", e.target.value)} />
        </div>
      ))}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setFeatures([...features, { title: "", description: "" }])}>
          + Add Feature
        </Button>
        <SaveButton isSaving={isSaving} onClick={() => onSave({ headline, subtext, features })}>
          Save
        </SaveButton>
      </div>
    </div>
  );
};

const TeamSectionForm = ({ section, onSave, isSaving }: SectionFormProps) => {
  const c = (section.content || {}) as Record<string, unknown>;
  const [headline, setHeadline] = useState((c.headline as string) || "");
  const [subtext, setSubtext] = useState((c.subtext as string) || "");

  return (
    <div className="grid gap-3 pt-3">
      <Input placeholder="Headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
      <Textarea placeholder="Subtext" value={subtext} onChange={(e) => setSubtext(e.target.value)} rows={2} />
      <p className="text-xs text-muted-foreground">Team members are managed in the Team section. This controls the heading text only.</p>
      <SaveButton isSaving={isSaving} onClick={() => onSave({ headline, subtext })}>
        Save
      </SaveButton>
    </div>
  );
};

const PortfolioSectionForm = ({ section, onSave, isSaving }: SectionFormProps) => {
  const c = (section.content || {}) as Record<string, unknown>;
  const [headline, setHeadline] = useState((c.headline as string) || "");
  const [subtext, setSubtext] = useState((c.subtext as string) || "");

  return (
    <div className="grid gap-3 pt-3">
      <Input placeholder="Headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
      <Textarea placeholder="Subtext" value={subtext} onChange={(e) => setSubtext(e.target.value)} rows={2} />
      <p className="text-xs text-muted-foreground">Portfolio items are managed in the Portfolio section. This controls the heading text only.</p>
      <SaveButton isSaving={isSaving} onClick={() => onSave({ headline, subtext })}>
        Save
      </SaveButton>
    </div>
  );
};

/* ─── Section → Form mapping ─────────────────────────────── */

const EDITABLE_SECTIONS: Record<string, React.ComponentType<SectionFormProps>> = {
  hero: HeroForm,
  services: ServicesForm,
  pricing: PricingForm,
  testimonials: TestimonialsForm,
  contact: ContactForm,
  client_dashboard: ClientDashboardForm,
  faq: FAQForm,
  process: ProcessForm,
  why_digital: WhyDigitalForm,
  team: TeamSectionForm,
  portfolio: PortfolioSectionForm,
};

/* ─── Sub-components ─────────────────────────────────────── */

const ToggleRow = ({
  icon: Icon,
  label,
  active,
  onToggle,
}: {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onToggle: () => void;
}) => (
  <button
    onClick={onToggle}
    className="flex items-center gap-2 group"
    title={`${active ? "Visible" : "Hidden"} on ${label}`}
  >
    <Icon
      className={`h-3.5 w-3.5 transition-colors ${
        active ? "text-foreground/80" : "text-muted-foreground"
      }`}
    />
    <span
      className={`text-[11px] uppercase tracking-wider hidden md:inline transition-colors ${
        active ? "text-foreground/80" : "text-muted-foreground"
      }`}
    >
      {label}
    </span>
    <div
      className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
        active ? "bg-accent" : "bg-secondary border border-border"
      }`}
    >
      <div
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-background transition-transform shadow-sm ${
          active ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </div>
  </button>
);

/* ─── Main Component ─────────────────────────────────────── */

const AdminContentStudio = () => {
  const { sections, isLoading, toggle, updateContent, isSavingContent } = useSiteContent();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-44 bg-secondary animate-pulse rounded" />
        <div className="h-72 bg-secondary animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Content"
        meta="Toggle visibility and edit content per section"
        action={
          <div className="flex items-center gap-4 text-[11px] uppercase tracking-wider text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              advo.ph
            </span>
            <span className="flex items-center gap-1.5">
              <Monitor className="h-3.5 w-3.5" />
              /hub
            </span>
          </div>
        }
      />

      <Panel title="Sections" meta={`${sections.length} total`}>
        <div className="divide-y divide-border">
          {sections.map((section) => {
            const FormComponent = EDITABLE_SECTIONS[section.section_id];
            const isExpanded = expanded === section.section_id;

            return (
              <div key={section.section_id}>
                <div className="flex items-center justify-between gap-4 flex-wrap px-4 py-3">
                  {/* Label + id */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{section.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {section.section_id}
                    </p>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-4 shrink-0">
                    <ToggleRow
                      icon={Globe}
                      label="Public"
                      active={section.visible_public}
                      onToggle={() =>
                        toggle(
                          section.section_id,
                          "visible_public",
                          !section.visible_public,
                        )
                      }
                    />
                    <ToggleRow
                      icon={Monitor}
                      label="Hub"
                      active={section.visible_client_portal}
                      onToggle={() =>
                        toggle(
                          section.section_id,
                          "visible_client_portal",
                          !section.visible_client_portal,
                        )
                      }
                    />

                    {FormComponent ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 rounded-md"
                        onClick={() =>
                          setExpanded(isExpanded ? null : section.section_id)
                        }
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    ) : (
                      <div className="w-8" />
                    )}
                  </div>
                </div>

                {isExpanded && FormComponent && (
                  <div className="px-4 pb-4 pt-1 bg-secondary/20 border-t border-border">
                    <FormComponent
                      section={section}
                      onSave={(c) => updateContent(section.section_id, c)}
                      isSaving={isSavingContent}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
};

export default AdminContentStudio;
