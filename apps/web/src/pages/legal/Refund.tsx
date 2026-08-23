import LegalDocument, { LegalSection } from "@/components/legal/LegalDocument";
import { legalIdentity } from "@/lib/legal-identity";

/**
 * Return and Refund Policy — a PayMongo disclosure. ADVO ships software, not
 * goods, so "return" is stated in the terms that actually apply to a build:
 * what a downpayment buys, when it stops being refundable, and how a refund is
 * asked for and paid back.
 */
const Refund = () => (
  <LegalDocument
    kicker="Legal"
    title="Return and Refund Policy"
    summary={
      "ADVO sells software work and the hardware that runs alongside it. This page says what a payment buys, when it can still be refunded, and how long a refund takes to reach you."
    }
  >
    <LegalSection heading="What is being bought">
      <p>
        Almost everything ADVO sells is custom work — a website, a Client Hub, an
        Admin Console, an integration, or the monthly infrastructure that keeps
        them running. Custom work is not a returnable good: once it is built to
        your brief, it cannot be restocked. The rules below are written for that
        reality, and are deliberately specific rather than a blanket refusal.
      </p>
    </LegalSection>

    <LegalSection heading="Refund of a downpayment">
      <p>
        <strong>Before work starts.</strong> If you cancel in writing before ADVO
        begins work on the first deliverable, the downpayment is refunded in full.
      </p>
      <p>
        <strong>After work starts, before the first sign-off.</strong> The
        downpayment is refunded less the work already performed, billed at the
        rate in your contract, together with any third-party cost already
        committed on your behalf (domains, licences, hardware).
      </p>
      <p>
        <strong>After a milestone is signed off.</strong> The amount attributed to
        that milestone is non-refundable — the deliverable has been accepted and
        the work is done. Later, unstarted milestones remain refundable on the
        rules above.
      </p>
    </LegalSection>

    <LegalSection heading="Monthly infrastructure fee">
      <p>
        The monthly hosting and maintenance fee is billed on the 1st for the month
        ahead. Cancel any time with fourteen (14) days of notice; the month in
        progress is not pro-rated, and no further month is billed. If ADVO fails
        to deliver the service for a whole billing month, that month is refunded.
      </p>
    </LegalSection>

    <LegalSection heading="Hardware">
      <p>
        Hardware supplied by ADVO may be returned within seven (7) days of
        delivery if it is unopened and unused, or at any time within the
        manufacturer warranty if it arrives faulty, in line with the Consumer Act
        of the Philippines (RA 7394). Return shipping on a non-faulty return is
        yours; on a faulty item it is ours.
      </p>
    </LegalSection>

    <LegalSection heading="Duplicate and mistaken payments">
      <p>
        A payment made twice, or made for the wrong amount, is refunded in full.
        Tell us and we will not wait for you to ask twice.
      </p>
    </LegalSection>

    <LegalSection heading="How to ask, and how long it takes">
      <p>
        Email{" "}
        <a className="underline underline-offset-4" href={"mailto:" + legalIdentity.support_email}>
          {legalIdentity.support_email}
        </a>{" "}
        with the invoice or payment reference and what you are asking for. We
        answer within three (3) business days.
      </p>
      <p>
        An approved refund is filed with our payment provider within seven (7)
        business days and is returned to the card or e-wallet the payment came
        from. Your bank or wallet then takes its own time — usually five (5) to
        fifteen (15) business days — to post it.
      </p>
      <p>
        If we decline a refund, we say why in writing, and the{" "}
        <a className="underline underline-offset-4" href="/dispute">
          Dispute Resolution Policy
        </a>{" "}
        tells you what happens next.
      </p>
    </LegalSection>
  </LegalDocument>
);

export default Refund;
