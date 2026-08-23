import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import LandingShell from "@/components/landing/landing-shell";
import {
  identityValue,
  legalIdentity,
  pendingIdentityField,
} from "@/lib/legal-identity";

/**
 * One layout for all four PayMongo disclosures, so Terms, Privacy, Refund and
 * Dispute cannot drift apart in tone, in structure, or in the merchant
 * identity they publish. Every page is a public route — a PayMongo reviewer
 * reads them signed out.
 */
export interface LegalDocumentProps {
  kicker: string;
  title: string;
  summary: string;
  children: ReactNode;
}

export const LegalSection = ({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) => (
  <section className="mt-12">
    <h2 className="text-lg font-semibold tracking-tight mb-3">{heading}</h2>
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
      {children}
    </div>
  </section>
);

const relatedDocument = [
  { to: "/terms", label: "Terms and Conditions" },
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/refund", label: "Return and Refund Policy" },
  { to: "/dispute", label: "Dispute Resolution Policy" },
];

/** A field that has no value yet says so, rather than showing a made-up one. */
const IdentityRow = ({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) => (
  <div className="flex flex-col gap-1 border-t border-border/60 py-3 sm:flex-row sm:gap-6">
    <dt className="w-56 shrink-0 text-xs uppercase tracking-[0.14em] text-muted-foreground">
      {label}
    </dt>
    <dd className="text-sm">
      {value ?? (
        <span className="text-muted-foreground">
          Not yet published — request it at{" "}
          <a className="underline" href={"mailto:" + legalIdentity.support_email}>
            {legalIdentity.support_email}
          </a>
        </span>
      )}
    </dd>
  </div>
);

const LegalDocument = ({ kicker, title, summary, children }: LegalDocumentProps) => (
  <LandingShell>
    <main className="landing-shell-main">
      <article className="mx-auto max-w-3xl">
        <span className="mb-4 block text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {kicker}
        </span>
        <h1 className="mb-5 text-4xl font-semibold tracking-tight md:text-5xl">
          {title}
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">{summary}</p>
        <p className="mt-6 text-xs uppercase tracking-[0.14em] text-muted-foreground">
          Effective {legalIdentity.effective_date} · {legalIdentity.trade_name}
        </p>

        {children}

        <LegalSection heading="Who you are transacting with">
          <dl className="not-prose">
            <IdentityRow label="Trading as" value={identityValue("trade_name")} />
            <IdentityRow label="Registered name" value={identityValue("legal_name")} />
            <IdentityRow
              label="Registration body"
              value={identityValue("registration_body")}
            />
            <IdentityRow
              label="Registration number"
              value={identityValue("registration_number")}
            />
            <IdentityRow
              label="Business address"
              value={identityValue("business_address")}
            />
            <IdentityRow label="Support email" value={identityValue("support_email")} />
            <IdentityRow label="Support phone" value={identityValue("support_phone")} />
          </dl>
          {pendingIdentityField.length > 0 ? (
            <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
              Some registration details above are not published yet. They are
              transcribed from ADVO&rsquo;s DTI/SEC paperwork rather than drafted
              here, so the page shows the gap instead of an invented value. Email{" "}
              <a className="underline" href={"mailto:" + legalIdentity.support_email}>
                {legalIdentity.support_email}
              </a>{" "}
              and we will send them on request.
            </p>
          ) : null}
        </LegalSection>

        <nav className="mt-16 border-t border-border/60 pt-6" aria-label="The other policies">
          <p className="mb-3 text-xs uppercase tracking-[0.14em] text-muted-foreground">
            The other policies
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {relatedDocument
              .filter((doc) => doc.label !== title)
              .map((doc) => (
                <Link key={doc.to} className="underline underline-offset-4" to={doc.to}>
                  {doc.label}
                </Link>
              ))}
          </div>
        </nav>
      </article>
    </main>
  </LandingShell>
);

export default LegalDocument;
