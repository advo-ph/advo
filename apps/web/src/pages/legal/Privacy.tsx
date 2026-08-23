import LegalDocument, { LegalSection } from "@/components/legal/LegalDocument";
import { legalIdentity } from "@/lib/legal-identity";

/**
 * Privacy Policy — a PayMongo disclosure, and the Philippine Data Privacy Act
 * (RA 10173) notice for the data this platform actually collects: the project
 * form on /start, Client Hub and Admin Console accounts, uploaded project
 * files, and expiring preview links.
 */
const Privacy = () => (
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
        deleted on request once the engagement is closed and settled.
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

    <LegalSection heading="Cookies">
      <p>
        This site sets a session cookie so a signed-in account stays signed in,
        and stores a small amount of data in your browser so the app works
        offline. There are no advertising or cross-site tracking cookies.
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

export default Privacy;
