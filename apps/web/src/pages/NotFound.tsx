import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import LandingShell from "@/components/landing/landing-shell";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <LandingShell>
      <div className="landing-shell-auth">
        <div className="text-center">
          <img className="landing-shell-mark" src="/landing/icon/empty.png" alt="" />
          <h1 className="mb-3 text-5xl font-normal tracking-tight">404</h1>
          <p className="mb-8 text-muted-foreground">This page is not on the map.</p>
          <Link to="/" className="landing-button landing-button-primary">
            Back home
          </Link>
        </div>
      </div>
    </LandingShell>
  );
};

export default NotFound;
