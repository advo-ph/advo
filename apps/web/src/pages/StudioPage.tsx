import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import LandingShell from "@/components/landing/landing-shell";
import "./studio-pages.css";

export default function StudioPage({ title, intro, note, children }: {
  title: string; intro: string; note?: ReactNode; children: ReactNode;
}) {
  return <LandingShell>
    <main className="landing-shell-main studio-page">
      <header className="studio-hero">
        <div><Link className="studio-home" to="/">ADVO /</Link><h1>{title}</h1><p>{intro}</p></div>
        {note && <div className="studio-hero-note">{note}</div>}
      </header>
      {children}
    </main>
  </LandingShell>;
}
