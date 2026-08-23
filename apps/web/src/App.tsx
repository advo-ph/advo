import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ScrollProgress from "@/components/ui/ScrollProgress";
import ProtectedRoute from "@/components/ProtectedRoute";
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

const App = () => (
  <AuthProvider>
    <TooltipProvider>
      <ScrollProgress />
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
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

          {/* Protected: requires admin */}
          <Route element={<ProtectedRoute requireAdmin />}>
            <Route path="/admin" element={<Admin />} />
          </Route>

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </AuthProvider>
);

export default App;
