import { useState, useEffect, useRef } from "react";
import { Mail, ArrowRight, Loader2, Eye, EyeOff } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import LandingShell from "@/components/landing/landing-shell";
import { destinationFor } from "@/lib/destination";
import type { SavedAccount } from "@/lib/saved-accounts";
import DotField from "@/components/DotField";

interface LoginProps {
  variant: "members" | "clients";
}

/**
 * Backdrop for both render paths of this page. It lived inline in each of them and the two
 * copies immediately drifted apart, so it is one component now.
 */
const LoginBackdrop = () => (
  <div className="login-dot-field" aria-hidden="true">
    <DotField
      dotRadius={1.5}
      dotSpacing={14}
      cursorRadius={500}
      cursorForce={0.1}
      bulgeOnly
      bulgeStrength={45}
      glowRadius={0}
      sparkle={false}
      waveAmplitude={0}
      gradientFrom="#d4d4d8"
      gradientTo="#e4e4e7"
      glowColor="transparent"
    />
  </div>
);

const Login = ({ variant }: LoginProps) => {
  // The wordmark carries "ADVO", so the label is only what comes after it. The <h1> still
  // reads as "ADVO Members" because the image keeps its alt text.
  const label = variant === "members" ? "Members" : "Client Hub";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  // Password, not magic link. This is an internal tool with a shared default
  // password, and the mail transport is not configured in every environment, so
  // a magic link can be silently dropped and leave someone unable to get in.
  // The link is still one tap away for anyone who wants it.
  const [mode, setMode] = useState<"magic" | "password">("password");
  /** userId of the saved account currently being signed in, for a per-button spinner. */
  const [pendingAccountId, setPendingAccountId] = useState<number | null>(null);
  const [useAnotherAccount, setUseAnotherAccount] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const explicitRedirect = searchParams.get("redirectTo");
  const {
    user,
    isLoading: authLoading,
    login,
    loginWithMagicLink,
    verifyMagicLink,
    savedAccounts,
    loginWithSavedAccount,
  } = useAuth();

  const showSavedAccounts = !isSent && savedAccounts.length > 0 && !useAnotherAccount;

  useEffect(() => {
    if (!authLoading && user) {
      navigate(destinationFor(user.role, explicitRedirect), { replace: true });
    }
  }, [authLoading, user, navigate, explicitRedirect]);

  /**
   * Magic link arriving in the URL.
   *
   * This used to run inside useState's lazy initialiser, which is a render-phase call. It
   * happened to work, but a side effect during render is the kind of thing StrictMode or a
   * future concurrent render breaks silently. The ref is what the initialiser was providing
   * for free: run once, even though the effect can be re-entered.
   */
  const magicLinkToken = searchParams.get("token");
  const magicLinkHandled = useRef(false);

  useEffect(() => {
    if (!magicLinkToken || magicLinkHandled.current) return;
    magicLinkHandled.current = true;

    (async () => {
      setIsLoading(true);
      const { error, user: verified } = await verifyMagicLink(magicLinkToken);
      setIsLoading(false);
      if (error) {
        toast({ variant: "destructive", title: "Error", description: error });
      } else {
        navigate(destinationFor(verified?.role, explicitRedirect));
      }
    })();
  }, [magicLinkToken, verifyMagicLink, toast, navigate, explicitRedirect]);

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

  const handleSavedAccountLogin = async (account: SavedAccount) => {
    setPendingAccountId(account.userId);
    const { error, user: signedIn } = await loginWithSavedAccount(account);
    setPendingAccountId(null);

    if (error) {
      toast({ variant: "destructive", title: "Error", description: error });
      return;
    }
    navigate(destinationFor(signedIn?.role, explicitRedirect));
  };

  /**
   * Render gate.
   *
   * The form used to render unconditionally, so a signed-in user reloading the app saw the
   * login screen flash before the redirect effect fired. ProtectedRoute already gates on
   * authLoading the same way.
   */
  if (authLoading || user) {
    return (
      <LandingShell>
        <div className="landing-shell-auth">
          <LoginBackdrop />
          <div className="relative z-10 flex w-full max-w-sm justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </div>
      </LandingShell>
    );
  }

  return (
    <LandingShell>
      <div className="landing-shell-auth">
        <LoginBackdrop />
        <div className="relative z-10 w-full max-w-sm">
          <div className="p-8 bg-card rounded-xl shadow-card">
            <h1 className="mb-8 flex items-center justify-center gap-2.5">
              {/* The wordmark ships as a black PNG, so it needs inverting wherever the
                  card goes dark. */}
              <img
                src="/advo-logo-black.png"
                alt="ADVO"
                className="h-5 w-auto dark:invert"
              />
              <span aria-hidden="true" className="h-5 w-px bg-border" />
              <span className="text-lg font-medium tracking-tight">{label}</span>
            </h1>

            {/* Saved accounts. Present whether or not anyone is signed out, because signing
                out is supposed to leave the account here as a one-tap target. */}
            {showSavedAccounts && (
              <div className="mb-6 space-y-2">
                {savedAccounts.map((account) => (
                  <button
                    key={account.userId}
                    type="button"
                    onClick={() => handleSavedAccountLogin(account)}
                    disabled={pendingAccountId !== null}
                    // Named explicitly, because the avatar and the email underneath would
                    // otherwise both fold into the accessible name and an account with no
                    // avatar picture would announce as "F Log in as FourLinq".
                    aria-label={`Log in as ${account.displayName}`}
                    className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-colors hover:bg-secondary disabled:opacity-60"
                  >
                    {account.avatarUrl ? (
                      <img
                        src={account.avatarUrl}
                        alt=""
                        aria-hidden="true"
                        className="h-8 w-8 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-muted-foreground"
                      >
                        {account.displayName.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        Log in as {account.displayName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {account.email}
                      </span>
                    </span>
                    {pendingAccountId === account.userId && (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    )}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setUseAnotherAccount(true)}
                  disabled={pendingAccountId !== null}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-60"
                >
                  Log in to another account
                </button>
              </div>
            )}

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
            ) : !showSavedAccounts && mode === "magic" ? (
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

                {useAnotherAccount && savedAccounts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setUseAnotherAccount(false)}
                    className="w-full text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
                  >
                    Back to saved accounts
                  </button>
                )}
              </form>
            ) : !showSavedAccounts ? (
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

                {useAnotherAccount && savedAccounts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setUseAnotherAccount(false)}
                    className="w-full text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
                  >
                    Back to saved accounts
                  </button>
                )}
              </form>
            ) : null}
          </div>
        </div>
      </div>
    </LandingShell>
  );
};

export default Login;
