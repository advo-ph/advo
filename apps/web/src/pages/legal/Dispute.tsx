import LegalDocument, { LegalSection } from "@/components/legal/LegalDocument";
import { legalIdentity } from "@/lib/legal-identity";

/**
 * Dispute Resolution Policy — a PayMongo disclosure. It names one route in,
 * a clock on every step, and a venue, so a cardholder can see that raising a
 * problem with ADVO is faster than raising a chargeback with their bank.
 */
const Dispute = () => (
  <LegalDocument
    kicker="Legal"
    title="Dispute Resolution Policy"
    summary={
      "How to raise a problem with a payment, a deliverable, or an account — who answers, how long each step takes, and what happens if the two of us cannot agree."
    }
  >
    <LegalSection heading="Start here">
      <p>
        Email{" "}
        <a className="underline underline-offset-4" href={"mailto:" + legalIdentity.support_email}>
          {legalIdentity.support_email}
        </a>{" "}
        with the payment reference or project name, what happened, and what you
        want done. That address reaches a person, not a queue.
      </p>
      <p>
        We acknowledge within one (1) business day and give a substantive answer
        within seven (7) business days. If the answer needs longer, we say so and
        give a date.
      </p>
    </LegalSection>

    <LegalSection heading="If the first answer does not settle it">
      <p>
        Reply and ask for escalation. The engagement lead reviews the file
        afresh and responds within a further seven (7) business days, in writing,
        with the reasoning and the evidence relied on.
      </p>
    </LegalSection>

    <LegalSection heading="Good-faith negotiation">
      <p>
        If escalation does not settle it, either side may serve a written notice
        of dispute. Both sides then have fifteen (15) days to negotiate in good
        faith — by call or in person — before any formal step is taken.
      </p>
    </LegalSection>

    <LegalSection heading="Mediation, then venue">
      <p>
        A dispute still unresolved after that period goes to mediation before a
        mutually agreed mediator in Metro Manila, with the cost split evenly. Only
        if mediation fails does either side go to court, and the venue is the
        courts of Metro Manila, Philippines, under Philippine law.
      </p>
      <p>
        Nothing here removes a consumer&rsquo;s right to complain to the
        Department of Trade and Industry, or a data subject&rsquo;s right to
        complain to the National Privacy Commission.
      </p>
    </LegalSection>

    <LegalSection heading="Chargebacks">
      <p>
        If you do not recognise a charge, or believe it is wrong, please write to
        us before asking your bank to reverse it. We can usually identify and
        refund a mistaken or duplicate charge within days, where a chargeback
        takes weeks and freezes the engagement while it runs.
      </p>
      <p>
        When a chargeback is filed we respond to the payment provider with the
        contract, the sign-off record, and the delivery evidence for the amount in
        question. Refund entitlements are set by the{" "}
        <a className="underline underline-offset-4" href="/refund">
          Return and Refund Policy
        </a>
        , and this policy does not change them.
      </p>
    </LegalSection>

    <LegalSection heading="While a dispute is open">
      <p>
        Work continues on everything not in dispute, and the disputed amount is
        not treated as overdue — no late-payment penalty accrues on it, and
        hosting is not suspended over it, until the steps above are exhausted.
      </p>
    </LegalSection>
  </LegalDocument>
);

export default Dispute;
