import { useState } from "react";
import { motion } from "framer-motion";
import {
  Eye,
  EyeOff,
  Globe,
  Monitor,
  Loader2,
  ChevronDown,
  ChevronUp,
  Save,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSiteContent, type SiteSection } from "@/hooks/useSiteContent";

/* ─── Content edit forms per section ──────────────────────── */

const HeroForm = ({
  section,
  onSave,
}: {
  section: SiteSection;
  onSave: (c: Record<string, unknown>) => void;
}) => {
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
      <Button
        size="sm"
        className="w-fit mt-1"
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
        <Save className="h-3.5 w-3.5 mr-1.5" />
        Save Hero
      </Button>
    </div>
  );
};

const ContactForm = ({
  section,
  onSave,
}: {
  section: SiteSection;
  onSave: (c: Record<string, unknown>) => void;
}) => {
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
      <Button
        size="sm"
        className="w-fit mt-1"
        onClick={() =>
          onSave({
            email,
            calendly_url: calendlyUrl || null,
            show_form: showForm,
          })
        }
      >
        <Save className="h-3.5 w-3.5 mr-1.5" />
        Save Contact
      </Button>
    </div>
  );
};

const ClientDashboardForm = ({
  section,
  onSave,
}: {
  section: SiteSection;
  onSave: (c: Record<string, unknown>) => void;
}) => {
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
      <Button
        size="sm"
        className="w-fit mt-1"
        onClick={() => onSave({ welcome_message: welcomeMessage })}
      >
        <Save className="h-3.5 w-3.5 mr-1.5" />
        Save
      </Button>
    </div>
  );
};

const ServicesForm = ({
  section,
  onSave,
}: {
  section: SiteSection;
  onSave: (c: Record<string, unknown>) => void;
}) => {
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
        <Button
          size="sm"
          className="w-fit"
          onClick={() => onSave({ items })}
        >
          <Save className="h-3.5 w-3.5 mr-1.5" />
          Save Services
        </Button>
      </div>
    </div>
  );
};

const PricingForm = ({
  section,
  onSave,
}: {
  section: SiteSection;
  onSave: (c: Record<string, unknown>) => void;
}) => {
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
        <Button
          size="sm"
          className="w-fit"
          onClick={() => onSave({ plans })}
        >
          <Save className="h-3.5 w-3.5 mr-1.5" />
          Save Pricing
        </Button>
      </div>
    </div>
  );
};

const TestimonialsForm = ({
  section,
  onSave,
}: {
  section: SiteSection;
  onSave: (c: Record<string, unknown>) => void;
}) => {
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
        <Button
          size="sm"
          className="w-fit"
          onClick={() => onSave({ items })}
        >
          <Save className="h-3.5 w-3.5 mr-1.5" />
          Save Testimonials
        </Button>
      </div>
    </div>
  );
};

/* ─── Section → Form mapping ─────────────────────────────── */

const EDITABLE_SECTIONS: Record<
  string,
  React.ComponentType<{
    section: SiteSection;
    onSave: (c: Record<string, unknown>) => void;
  }>
> = {
  hero: HeroForm,
  services: ServicesForm,
  pricing: PricingForm,
  testimonials: TestimonialsForm,
  contact: ContactForm,
  client_dashboard: ClientDashboardForm,
};

/* ─── Main Component ─────────────────────────────────────── */

const AdminContentStudio = () => {
  const { sections, isLoading, toggle, updateContent } = useSiteContent();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Content Studio</h1>
        <p className="text-muted-foreground">
          Control visibility and edit content for each section
        </p>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5" />
          Public Site (advo.ph)
        </span>
        <span className="flex items-center gap-1.5">
          <Monitor className="h-3.5 w-3.5" />
          Client Portal (/hub)
        </span>
      </div>

      <div className="space-y-3">
        {sections.map((section, index) => {
          const FormComponent = EDITABLE_SECTIONS[section.section_id];
          const isExpanded = expanded === section.section_id;

          return (
            <motion.div
              key={section.section_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className="p-4 bg-card border border-border rounded-xl shadow-card hover:border-accent/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                    <span className="text-accent font-bold text-sm">
                      {section.label.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-sm">{section.label}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {section.section_id}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Public site toggle */}
                  <button
                    onClick={() =>
                      toggle(
                        section.section_id,
                        "visible_public",
                        !section.visible_public
                      )
                    }
                    className="flex items-center gap-2"
                    title={
                      section.visible_public
                        ? "Visible on public site"
                        : "Hidden from public site"
                    }
                  >
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    <div
                      className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
                        section.visible_public ? "bg-accent" : "bg-secondary"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${
                          section.visible_public
                            ? "translate-x-4"
                            : "translate-x-0"
                        }`}
                      />
                    </div>
                  </button>

                  {/* Client portal toggle */}
                  <button
                    onClick={() =>
                      toggle(
                        section.section_id,
                        "visible_client_portal",
                        !section.visible_client_portal
                      )
                    }
                    className="flex items-center gap-2"
                    title={
                      section.visible_client_portal
                        ? "Visible in client portal"
                        : "Hidden from client portal"
                    }
                  >
                    <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                    <div
                      className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
                        section.visible_client_portal
                          ? "bg-blue-500"
                          : "bg-secondary"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${
                          section.visible_client_portal
                            ? "translate-x-4"
                            : "translate-x-0"
                        }`}
                      />
                    </div>
                  </button>

                  {/* Status badges */}
                  <div className="flex items-center gap-1.5 min-w-[120px] justify-end">
                    {section.visible_public ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-accent border-accent/30 gap-1"
                      >
                        <Eye className="h-2.5 w-2.5" />
                        Public
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-muted-foreground border-border gap-1"
                      >
                        <EyeOff className="h-2.5 w-2.5" />
                        Hidden
                      </Badge>
                    )}
                    {section.visible_client_portal && (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-blue-500 border-blue-500/30 gap-1"
                      >
                        <Monitor className="h-2.5 w-2.5" />
                        Portal
                      </Badge>
                    )}
                  </div>

                  {/* Expand button — only for editable sections */}
                  {FormComponent && (
                    <Button
                      variant="ghost"
                      size="sm"
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
                  )}
                </div>
              </div>

              {/* Expandable edit form */}
              {isExpanded && FormComponent && (
                <div className="mt-3 pt-3 border-t border-border">
                  <FormComponent
                    section={section}
                    onSave={(c) => updateContent(section.section_id, c)}
                  />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminContentStudio;
