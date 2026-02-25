import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Send,
  Loader2,
  CheckCircle,
  Briefcase,
  Mail,
  User,
  Building2,
  FileText,
  DollarSign,
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
import { Badge } from "@/components/ui/badge";
import * as db from "@/lib/db";
import { useToast } from "@/hooks/use-toast";
import FloatingNav from "@/components/landing/FloatingNav";
import Footer from "@/components/landing/Footer";

const BUDGET_RANGES = [
  { value: "under-50k", label: "Under ₱50,000" },
  { value: "50k-100k", label: "₱50,000 - ₱100,000" },
  { value: "100k-250k", label: "₱100,000 - ₱250,000" },
  { value: "250k-500k", label: "₱250,000 - ₱500,000" },
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
      // Insert lead via database abstraction layer
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
        description: "Please try again or email us directly at hello@advo.ph",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-background">
        <FloatingNav />
        <div className="flex items-center justify-center min-h-[80vh] p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md text-center"
          >
            <div className="w-16 h-16 rounded-full gradient-accent flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold mb-2">We got your inquiry!</h1>
            <p className="text-muted-foreground mb-6">
              Our team will review your project and get back to you within 24 hours.
            </p>
            <Button onClick={() => navigate("/")} className="btn-press">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </motion.div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <FloatingNav />
      
      <main className="pt-32 pb-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-12"
          >
            {/* Left Side - Info */}
            <div>
              <Badge variant="outline" className="font-mono text-xs mb-4">
                // Start a Project
              </Badge>
              <h1 className="text-3xl md:text-4xl font-bold mb-4">
                Let's build something great together
              </h1>
              <p className="text-muted-foreground mb-8">
                Tell us about your project and we'll get back to you within 24 hours 
                with a custom proposal.
              </p>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full gradient-accent flex items-center justify-center shrink-0">
                    <span className="text-white font-bold text-sm">1</span>
                  </div>
                  <div>
                    <h3 className="font-medium">Submit your inquiry</h3>
                    <p className="text-sm text-muted-foreground">
                      Share your project details and goals
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <span className="text-muted-foreground font-bold text-sm">2</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-muted-foreground">Get a proposal</h3>
                    <p className="text-sm text-muted-foreground">
                      We'll send you scope, timeline, and pricing
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <span className="text-muted-foreground font-bold text-sm">3</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-muted-foreground">Start building</h3>
                    <p className="text-sm text-muted-foreground">
                      Access your dashboard to track progress
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side - Form */}
            <div className="p-6 bg-card border border-border rounded-xl glass-strong">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      Your Name
                    </label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="John Doe"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      Email
                    </label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="john@company.com"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    Company (optional)
                  </label>
                  <Input
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    placeholder="Acme Corp"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                      Project Type
                    </label>
                    <Select
                      value={formData.projectType}
                      onValueChange={(v) => setFormData({ ...formData, projectType: v })}
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
                    <label className="text-sm font-medium flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      Budget Range
                    </label>
                    <Select
                      value={formData.budget}
                      onValueChange={(v) => setFormData({ ...formData, budget: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select budget" />
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
                  <label className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Project Description
                  </label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Tell us about your project goals, features you need, and any technical requirements..."
                    rows={8}
                    className="min-h-[180px]"
                    required
                  />
                </div>

                <Button type="submit" className="w-full btn-press gradient-accent text-white border-0" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  {isSubmitting ? "Sending..." : "Send Inquiry"}
                </Button>
                
                <p className="text-xs text-center text-muted-foreground">
                  We typically respond within 24 hours
                </p>
              </form>
            </div>
          </motion.div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default Start;
