import StudioPage from "./StudioPage";
import { identityValue } from "@/lib/legal-identity";

export default function BehindTheScenes() {
  return <StudioPage title="Behind the scenes" intro="Our hosting. Our support. Our credentials.">
    <section className="studio-section"><h2>Our own server</h2><div><p>We run a managed server to keep your website online when ADVO hosting is part of your project.</p><p className="studio-footnote">A private virtual server, managed by our team.</p></div></section>
    <section className="studio-section"><h2>After launch</h2><p>Your proposal covers hosting costs, maintenance, and support. At handoff, we confirm your access and who handles domain renewals.</p></section>
    <section className="studio-section"><h2>Registered in<br />the Philippines</h2><dl className="studio-records">
      <div><dt>Business</dt><dd>{identityValue("legal_name") || "Available on request"}</dd></div>
      <div><dt>DTI registration</dt><dd>{identityValue("registration_number") || "Available on request"}</dd></div>
      <div><dt>BIR</dt><dd>{identityValue("bir_registration_status") || "Available on request"}</dd></div>
    </dl></section>
  </StudioPage>;
}
