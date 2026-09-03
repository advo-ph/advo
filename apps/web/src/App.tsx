import { useLayoutEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ScrollProgress from "@/components/ui/ScrollProgress";
import ProtectedRoute from "@/components/ProtectedRoute";
import ErrorBoundary from "@/components/ErrorBoundary";
import InstallPrompt from "@/components/InstallPrompt";
import { JobProgressWidget } from "@/components/admin/shared/JobProgressWidget";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Hub from "./pages/Hub";
import Admin from "./pages/Admin";
import Start from "./pages/Start";
import Team from "./pages/Team";
import ProjectDetail from "./pages/ProjectDetail";
import PreviewLink from "./pages/PreviewLink";
import NotFound from "./pages/NotFound";
import Terms from "./pages/legal/Terms";
import Privacy from "./pages/legal/Privacy";
import Refund from "./pages/legal/Refund";
import Dispute from "./pages/legal/Dispute";

/** Preserves query string (token=, redirectTo=, …) when aliasing /login → /clients */
const LoginAlias = () => {
  const { search } = useLocation();
  return <Navigate to={{ pathname: "/clients", search }} replace />;
};

/**
 * The app scrolls inside #root (html/body are overflow-hidden), so a route
 * change kept the previous page's scroll offset — "Start a project" opened
 * /start already scrolled down. Reset the scroller to the top on every path
 * change. In-page anchors (/#work, /#services) carry a hash, so they are left
 * alone and keep scrolling to their section.
 */
const ScrollToTop = () => {
  const { pathname, hash } = useLocation();
  useLayoutEffect(() => {
    if (hash) return;
    document.getElementById("root")?.scrollTo({ top: 0, left: 0 });
    window.scrollTo({ top: 0, left: 0 });
  }, [pathname, hash]);
  return null;
};

// Last line of defence. Narrower boundaries inside the app (see pages/Admin.tsx)
// should catch first, so this one only fires for a crash in the shell itself.
const App = () => (
  <ErrorBoundary fullScreen hint="Reload the page to start over.">
    <AuthProvider>
      <TooltipProvider>
        <ScrollProgress />
        <Toaster />
        <Sonner />
        {/* Outside the router on purpose: the ask is about the app, not a page,
            and it gates itself on being signed in. */}
        <InstallPrompt />
        {/* Fixed bottom-right widget — survives navigation and refresh */}
        <JobProgressWidget />
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<LoginAlias />} />
            <Route path="/members" element={<Login variant="members" />} />
            <Route path="/clients" element={<Login variant="clients" />} />
            <Route path="/start" element={<Start />} />
            <Route path="/team" element={<Team />} />
            <Route path="/project/:slug" element={<ProjectDetail />} />
            <Route path="/p/:token" element={<PreviewLink />} />

            {/* PayMongo merchant-review disclosures. Public on purpose — a
                reviewer reads them signed out, so they stay outside every
                ProtectedRoute block below. */}
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/refund" element={<Refund />} />
            <Route path="/dispute" element={<Dispute />} />

            {/* Protected: requires auth */}
            <Route element={<ProtectedRoute requireAuth redirectAdminTo="/admin" />}>
              <Route path="/hub" element={<Hub />} />
            </Route>

            {/* Protected: requires admin. The console section is a path
                segment, so every page has its own address and browser back
                moves between them. Bare /admin settles on the dashboard. */}
            <Route element={<ProtectedRoute requireAdmin />}>
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/:section" element={<Admin />} />
            </Route>

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </ErrorBoundary>
);

export default App;
