import LegalDocument, { LegalSection } from "@/components/legal/LegalDocument";
import { legalIdentity } from "@/lib/legal-identity";

/**
 * Terms and Conditions — one of the four disclosures PayMongo reads on the
 * live site before approving a merchant. The commercial terms below are the
 * house engagement terms already recorded in docs/ROADMAP.md (50/50 payment,
 * five revision rounds, IP on final payment, monthly infrastructure fee); a
 * signed contract for a specific engagement governs where it differs.
 */
const Terms = () => (
  <LegalDocument
    kicker="Legal"
    title="Terms and Conditions"
    summary={
      "These terms govern the software ADVO builds and operates for a client — the public site, the Client Hub, the Admin Console, and the hardware on the floor — and any payment made to ADVO through this site."
    }
  >
    <LegalSection heading="What ADVO sells">
      <p>
        ADVO builds and runs software systems: a public website, a Client Hub the
        client&rsquo;s customers sign into, an Admin Console the client&rsquo;s
        studio runs on, and the hardware that sits alongside them. Work is scoped
        per engagement and quoted; this site does not sell a fixed-price product
        off the shelf, and any figure shown in a quotation is valid only for the
        engagement it names.
      </p>
    </LegalSection>

    <LegalSection heading="Engagement and acceptance">
      <p>
        An engagement begins when both parties sign a written contract that names
        the scope, the investment, and the timeline. Nothing on this site is an
        offer capable of acceptance on its own — submitting the project form
        starts a conversation, not a contract.
      </p>
      <p>
        Deliverables are accepted by a signed project sign-off, or by deemed
        approval if the client does not respond within ten (10) days of delivery.
      </p>
    </LegalSection>

    <LegalSection heading="Payment">
      <p>
        Unless the signed contract says otherwise: 50% of the investment is due as
        a downpayment on signing, and the remaining 50% on final delivery and
        sign-off. Invoices are payable within seven (7) business days. Amounts
        unpaid from the sixteenth (16th) business day carry a 2% per month
        penalty.
      </p>
      <p>
        Where an engagement includes hosting and maintenance, a monthly
        infrastructure fee is billed on the 1st, starting at final delivery and
        deployment. Non-payment for fifteen (15) days past due allows ADVO to
        suspend hosting and API access until the account is settled.
      </p>
      <p>
        Card and e-wallet payments are processed by our payment provider. ADVO
        does not receive or store your full card number.
      </p>
    </LegalSection>

    <LegalSection heading="Revisions and change of scope">
      <p>
        Each deliverable carries up to five (5) rounds of revision, usable until
        the project sign-off is signed, and for six (6) months after signing if
        unused at final delivery. New modules, redesigns, or anything outside the
        signed scope require a written change-order addendum before work starts.
      </p>
    </LegalSection>

    <LegalSection heading="Intellectual property">
      <p>
        Source code and deliverables remain ADVO&rsquo;s property until the
        engagement is paid in full; ownership transfers to the client on final
        payment. ADVO retains the right to show the work in its portfolio unless
        the client objects in writing before final delivery.
      </p>
    </LegalSection>

    <LegalSection heading="Warranty and limits">
      <p>
        Delivered work carries a thirty (30) day post-launch warranty covering
        defects in what was built. It does not cover new requirements, third-party
        outages, or changes made to the system by anyone other than ADVO. Delay
        caused by the client extends the timeline day for day.
      </p>
      <p>
        To the extent Philippine law permits, ADVO&rsquo;s total liability for an
        engagement is limited to the amount paid for that engagement.
      </p>
    </LegalSection>

    <LegalSection heading="Acceptable use">
      <p>
        Accounts on the Client Hub and Admin Console are for the named client and
        its staff. Do not share credentials, probe the systems, or use them to
        store unlawful material. ADVO may suspend an account that does.
      </p>
    </LegalSection>

    <LegalSection heading="Governing law and changes">
      <p>
        These terms are governed by the laws of the Republic of the Philippines.
        Disputes follow the{" "}
        <a className="underline underline-offset-4" href="/dispute">
          Dispute Resolution Policy
        </a>
        . We may update these terms; the effective date at the top of this page
        always reflects the current version. Questions go to{" "}
        <a className="underline underline-offset-4" href={"mailto:" + legalIdentity.support_email}>
          {legalIdentity.support_email}
        </a>
        .
      </p>
    </LegalSection>
  </LegalDocument>
);

export default Terms;
