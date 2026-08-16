import { useState, useEffect } from "react";
import { Mail, ArrowRight, Loader2, Lock, Eye, EyeOff } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import LandingShell from "@/components/landing/landing-shell";
import { destinationFor } from "@/lib/destination";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [mode, setMode] = useState<"magic" | "password">("magic");
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const explicitRedirect = searchParams.get("redirectTo");
  const { user, isLoading: authLoading, login, loginWithMagicLink, verifyMagicLink } = useAuth();

  useEffect(() => {
    if (!authLoading && user) {
      navigate(destinationFor(user.role, explicitRedirect), { replace: true });
    }
  }, [authLoading, user, navigate, explicitRedirect]);

  // Handle magic link token from URL on mount
  useState(() => {
    const token = searchParams.get("token");
    if (token) {
      (async () => {
        setIsLoading(true);
        const { error, user } = await verifyMagicLink(token);
        setIsLoading(false);
        if (error) {
          toast({ variant: "destructive", title: "Error", description: error });
        } else {
          navigate(destinationFor(user?.role, explicitRedirect));
        }
      })();
    }
  });

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await loginWithMagicLink(email);

    setIsLoading(false);

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error,
      });
    } else {
      setIsSent(true);
      toast({
        title: "Check your email",
        description: "We've sent you a magic link to sign in.",
      });
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error, user } = await login(email, password);

    setIsLoading(false);

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error,
      });
    } else {
      navigate(destinationFor(user?.role, explicitRedirect));
    }
  };

  return (
    <LandingShell>
      <div className="landing-shell-auth">
        <div className="relative z-10 w-full max-w-sm">
          <div className="p-8 bg-card border border-border rounded-xl shadow-card">
            <div className="text-center mb-8">
              <div className="w-12 h-12 rounded-full bg-secondary border border-border flex items-center justify-center mx-auto mb-4">
                <Lock className="h-6 w-6 text-foreground" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight mb-2">Client Hub</h1>
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
            ) : mode === "magic" ? (
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
                  className="w-full group btn-press bg-foreground text-background hover:bg-foreground/90"
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

                <button
                  type="button"
                  onClick={() => setMode("password")}
                  className="w-full text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
                >
                  Sign in with password instead
                </button>
              </form>
            ) : (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-pw" className="text-sm">
                    Email address
                  </Label>
                  <Input
                    id="email-pw"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="bg-background pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full group btn-press bg-foreground text-background hover:bg-foreground/90"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>

                <button
                  type="button"
                  onClick={() => setMode("magic")}
                  className="w-full text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
                >
                  Use magic link instead
                </button>
              </form>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            {mode === "magic" ? "No password needed. We'll email you a secure link." : "Enter your credentials to sign in."}
          </p>
        </div>
      </div>
    </LandingShell>
  );
};

export default Login;
