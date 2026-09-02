import type { ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import LandingNav from "@/components/LandingNav";
import LandingScrollbar from "@/components/LandingScrollbar";
import LandingFooter from "./landing-footer";
import "./landing-page.css";

interface LandingShellProps {
  children: ReactNode;
}

/**
 * The frame every non-landing public route sits in: /start /login /team
 * /project/:slug /work/:slug and the legal pages. Same nav and footer as `/`,
 * from the same components, so the drawer behaviours and the system story
 * cannot drift between the two.
 */
const LandingShell = ({ children }: LandingShellProps) => {
  const reduceMotion = useReducedMotion();

  return (
    <div className={reduceMotion ? "landing-page landing-shell is-reduce-motion" : "landing-page landing-shell"}>
      <LandingNav anchorPrefix="/" />
      <LandingScrollbar />
      <div className="landing-shell-body">{children}</div>
      <LandingFooter anchorPrefix="/" />
    </div>
  );
};

export default LandingShell;
