import LandingPage from "@/components/landing/LandingPage";

/**
 * "/" is always the public marketing page. Authentication is intentionally handled
 * by the protected /hub and /admin routes, so an existing session never takes a visitor
 * away from the landing page when they open the main site URL.
 */
const Index = () => <LandingPage />;

export default Index;
