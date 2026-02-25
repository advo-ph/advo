import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, ArrowRight, Loader2, ArrowLeft, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import FloatingNav from "@/components/landing/FloatingNav";

const Login = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const { toast } = useToast();

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + "/hub",
      },
    });

    setIsLoading(false);

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } else {
      setIsSent(true);
      toast({
        title: "Check your email",
        description: "We've sent you a magic link to sign in.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <FloatingNav />
      
      <div className="min-h-screen flex items-center justify-center px-6 pt-16">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--border))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, type: "spring", damping: 20 }}
          className="relative z-10 w-full max-w-sm"
        >
          <div className="p-8 bg-card border border-border rounded-xl glass-strong shadow-card">
            <div className="text-center mb-8">
              <div className="w-12 h-12 rounded-full gradient-accent flex items-center justify-center mx-auto mb-4">
                <Lock className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Client Hub</h1>
              <p className="text-sm text-muted-foreground">
                Sign in to access your project dashboard
              </p>
            </div>

            {isSent ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                  <Mail className="h-6 w-6 text-accent" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Check your email for the magic link.
                </p>
                <Button
                  variant="ghost"
                  className="mt-4"
                  onClick={() => setIsSent(false)}
                >
                  Try another email
                </Button>
              </div>
            ) : (
              <form onSubmit={handleMagicLink} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm">
                    Email address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-background"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full group btn-press gradient-accent text-white border-0"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Send Magic Link
                      <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            No password needed—we'll email you a secure link.
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
