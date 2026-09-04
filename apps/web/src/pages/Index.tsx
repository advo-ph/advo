import { Navigate } from "react-router-dom";

import LandingPage from "@/components/landing/LandingPage";
import { useAuth } from "@/hooks/useAuth";
import { destinationFor } from "@/lib/destination";

/**
 * "/" is two things at once: the public marketing page, and where the installed
 * app and any old bookmark land. A signed-in member gets sent to their console
 * instead of being shown the sales pitch for a product they already use.
 *
 * Deliberately no `isLoading` gate. AuthProvider seeds the user synchronously
 * from cache, so a signed-in member redirects on the first render and a signed-out
 * visitor gets the landing page with no spinner in front of it. If the cached
 * session turns out to be dead, ProtectedRoute bounces them on to /login.
 */
const Index = () => {
  const { user } = useAuth();

  if (user) return <Navigate to={destinationFor(user.role)} replace />;

  return <LandingPage />;
};

export default Index;
