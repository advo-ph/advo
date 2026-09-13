import { useEffect, useState } from "react";
import LegalDocument, { LegalSection } from "@/components/legal/LegalDocument";
import { legalIdentity } from "@/lib/legal-identity";
import {
  openConsentPrompt,
  readConsent,
  resetConsent,
  subscribeConsent,
  type ConsentStatus,
} from "@/components/ConsentGate";

/**
 * Privacy Policy — a PayMongo disclosure, and the Philippine Data Privacy Act
 * (RA 10173) notice for the data this platform actually collects: the project
 * form on /start, Client Hub and Admin Console accounts, uploaded project
 * files, expiring preview links, and — only with the visitor's consent — the
 * analytics recorded by apps/web/src/lib/track.ts.
 *
 * Every analytics statement here must stay true to that file, to
 * ConsentGate.tsx, and to RETENTION_DAY in apps/api/src/services/retention.service.ts.
 */

const STATUS_LABEL: Record<ConsentStatus, string> = {
  granted: "Allowed — analytics and device recognition are on.",
  denied: "Refused — analytics and device recognition are off.",
  unset: "Not chosen yet — no analytics are running.",
};

const Privacy = () => {
  const [status, setStatus] = useState<ConsentStatus>(() => readConsent().status);

  useEffect(() => subscribeConsent((record) => setStatus(record.status)), []);

  return (
    <LegalDocument
      kicker="Legal"
      title="Privacy Policy"
      summary={
        "What ADVO collects when you use this site or sign into the Client Hub, why we hold it, who it reaches, and how to have it corrected or deleted."
      }
    >
      <LegalSection heading="What we collect">
        <p>
          <strong>When you start a project.</strong> The form on /start collects
          your name, email address, company (optional), project type, budget range,
          and your description of the work.
        </p>
        <p>
          <strong>When you have an account.</strong> The Client Hub and Admin
          Console hold your email address, a hashed password, your role, and a
          session cookie. We never store a readable password.
        </p>
        <p>
          <strong>While an engagement runs.</strong> Project files, deliverables,
          approvals, invoices, and the messages you send us through the Hub. Anyone
          holding a preview link you share can see the deliverable that link points
          at until the link expires.
        </p>
        <p>
          <strong>Payments.</strong> Card and e-wallet details are collected and
          held by our payment provider, not by ADVO. We keep the reference, the
          amount, and the status of each payment.
        </p>
        <p>
          <strong>Analytics, only if you allow it.</strong> See the next section.
          Nothing described there runs until you choose yes.
        </p>
      </LegalSection>

      <LegalSection heading="Analytics and device recognition">
        <p>
          The first time you visit, we ask whether we may record analytics. The
          choice is yours, refusing is one click, and the site works the same
          either way. We ask again only after 180 days or if what we collect
          materially changes.
        </p>
        <p>
          <strong>If you say yes</strong>, while you browse the public site we
          record: the pages you view, which sections of the home page you
          actually read and for roughly how long (to the second), how far down
          the page you scrolled (25, 50, 75 or 100 percent), and clicks on the
          main &ldquo;Start a project&rdquo; button. We never record what you
          type, and we do not record your mouse movement.
        </p>
        <p>
          To tell a first visit from a return visit we store a random visitor id
          and a session id in your browser, and compute a{" "}
          <strong>device fingerprint</strong>: a hash of settings your browser
          exposes to every website — language, platform, screen size, colour
          depth and pixel density, time zone, number of processor cores,
          approximate device memory, and touch support. We do not draw to a
          canvas, probe WebGL, or list your fonts. The random id is what we send;
          the fingerprint is only sent in its place when your browser will not
          let us store the id. A fingerprint can recognise a device even after
          you clear site data, which is why it only runs with your permission.
        </p>
        <p>
          If you are signed in to the Client Hub or the Admin Console, analytics
          you allow are linked to your account, so ADVO can see whether a client
          has opened what we sent. Your IP address is used in memory to limit
          abuse of the analytics endpoint and is not stored with the analytics.
        </p>
        <p>
          <strong>Lawful basis:</strong> your consent (RA 10173 Sec. 12(a)).{" "}
          <strong>Where it goes:</strong> our own database on our own server; no
          analytics vendor, advertising network, or third-party script receives
          it. <strong>How long:</strong> individual analytics records are deleted
          ninety (90) days after we receive them. What remains afterwards is a
          daily count per page, with no visitor id, no session id, and no
          account attached.
        </p>
      </LegalSection>

      <LegalSection heading="Your analytics choice">
        <p className="text-foreground">{STATUS_LABEL[status]}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={openConsentPrompt}
            className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary/60 transition-colors"
          >
            Change my choice
          </button>
          <button
            type="button"
            onClick={resetConsent}
            className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary/60 transition-colors"
          >
            Withdraw and ask me again
          </button>
        </div>
        <p className="text-xs">
          Refusing or withdrawing stops analytics from that moment and deletes
          the visitor id, fingerprint and session id stored in your browser. It
          does not undo processing that already lawfully happened. Deleting
          analytics records already on our server is not self-service yet —
          write to us (below) and we will do it within the response time stated
          under &ldquo;Your rights&rdquo;.
        </p>
      </LegalSection>

      <LegalSection heading="Why we hold it">
        <p>
          To answer your enquiry, to run the engagement you signed for, to bill and
          collect, to keep the accounts and records Philippine law requires, and to
          keep the systems secure. We do not sell personal data, and we do not use
          it for advertising.
        </p>
      </LegalSection>

      <LegalSection heading="Who it reaches">
        <p>
          ADVO staff working on your engagement, and the processors the platform
          runs on — hosting and database infrastructure, our email sender, and our
          payment provider. Each receives only what its function needs. We disclose
          data to anyone else only with your instruction or where the law compels
          it.
        </p>
      </LegalSection>

      <LegalSection heading="How long we keep it">
        <p>
          Enquiries that do not become engagements are kept for two (2) years.
          Engagement records, invoices, and the accounting trail are kept for ten
          (10) years, as Philippine tax and corporate rules require. Account data is
          deleted on request once the engagement is closed and settled. Analytics
          records are kept for ninety (90) days, as described above.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          Under the Data Privacy Act of 2012 (RA 10173) you may ask to see the
          personal data we hold about you, have it corrected, object to how we use
          it, ask for a copy in a portable form, or have it erased or blocked where
          the law allows. Write to{" "}
          <a className="underline underline-offset-4" href={"mailto:" + legalIdentity.support_email}>
            {legalIdentity.support_email}
          </a>{" "}
          and we will answer within fifteen (15) working days. If our answer does
          not satisfy you, you may complain to the National Privacy Commission.
        </p>
      </LegalSection>

      <LegalSection heading="Cookies and browser storage">
        <p>
          This site sets a session cookie so a signed-in account stays signed in,
          and stores a small amount of data in your browser so the app works
          offline and so your analytics choice is remembered. If you allow
          analytics, it also stores the visitor and session ids described above.
          There are no advertising or cross-site tracking cookies.
        </p>
      </LegalSection>

      <LegalSection heading="Security and breaches">
        <p>
          Access is role-gated, passwords are hashed, preview links expire, and
          traffic is served over TLS. No system is perfect: if a breach is likely to
          put you at serious risk, we will notify you and the National Privacy
          Commission within seventy-two (72) hours of becoming aware of it.
        </p>
      </LegalSection>
    </LegalDocument>
  );
};

export default Privacy;
