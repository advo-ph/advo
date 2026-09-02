# Document corpus — index

Built 2026-09-03 from the eleven Google Docs listed in `docs/SOURCE-DOCS.md`, read directly from Drive. One JSON per document, plus `TEMPLATE.json` (eight reusable skeletons). Money in `term.value` is integer centavos; every quote is verbatim from the Drive text.

| file | title | date | linked project or lead | fact count | term count |
| --- | --- | --- | --- | --- | --- |
| `fourlinq-app-contract.json` | ADVO Contract - APP DEVELOPMENT FOR FOURLINQ | 2026-08-20 | project 3 FourLinq Platform | 41 | 26 |
| `felici-contract-updated.json` | [UPDATED] ADVO Contract with FELICI ARTISAN / PINOY ARTISAN CORPORATION | 2026-08-22 | project 6 Felici Artisan Gelato | 34 | 27 |
| `felici-proposal-2026-07.json` | ADVO PROPOSAL - FELICI GELATO | 2026-07-02 | project 6 Felici Artisan Gelato (superseded) | 22 | 19 |
| `internal-commission-agreement.json` | THE OFFICIAL ADVO INTERNAL COMMISSION AND OPERATIONS AGREEMENT | none printed (Drive modified 2026-07-31) | none (internal) | 32 | 18 |
| `fourlinq-website-signoff.json` | ADVO PROJECT SIGN-OFF DOCUMENT | none printed (Drive modified 2026-08-08) | project 3 FourLinq Platform | 13 | 11 |
| `fourlinq-website-signoff-2026-07-07.json` | ADVO Project Sign-off - FOURLINQ DOORS AND WINDOWS | 2026-07-07 | project 3 FourLinq Platform | 13 | 8 |
| `fourlinq-addendum-1.json` | ADVO Addendum (Contract Addendum No. 1) | 2026-07-10 | project 3 FourLinq Platform | 9 | 11 |
| `hot-shots-fuel-proposal.json` | ADVO Project Proposal: Hot Shots Fuel | 2026-06-20 | lead Hot Shots Fuel | 13 | 11 |
| `excalibur-minutes-2026-07-10.json` | Minutes of the Meeting (July 10, 2026) | 2026-07-10 | lead Excalibur Builders | 17 | 8 |
| `business-pitch-script.json` | ADVO Business Pitch Script | none printed (SOURCE-DOCS: 2026-03-20) | none (facts link projects 3 and 7) | 17 | 2 |
| `felici-campaign-proposal-draft.json` | CAMPAIGN PROPOSAL - FELICI GELATO COLLABORATION (DRAFT) | 2026-05-26 | project 6 Felici Artisan Gelato | 12 | 10 |
| **total** | 11 documents | | | **223** | **151** |

Also: 29 action items across the files; `TEMPLATE.json` holds 8 templates (2 contract, 2 proposal, 1 signoff, 1 addendum, 1 pitch_deck, 1 campaign).

## Contradictions and inconsistencies noticed

1. **FourlinQ website money received.** The 2026-07-07 sign-off says the ₱12,000 down payment *and* the ₱15,000 chatbot payment were received before development, and states the total as ₱60,000. The undated PROJECT SIGN-OFF DOCUMENT and Addendum No. 1 (2026-07-10) both say ₱75,000 total, ₱12,000 received, ₱63,000 due. If the chatbot ₱15,000 really was received, the balance would be ₱48,000, not ₱63,000. Prod `project 3` follows the later two.
2. **07-07 sign-off is inconsistent with itself.** It lists the AI chatbot as a ₱15,000-value deliverable yet states "Total Investment: ₱60,000.00", and calls ₱12,000 a "20% down payment" — 20% of ₱60,000, not of ₱75,000.
3. **Felici 07-02 proposal delivery date precedes its own date.** It says final delivery "(June 12, 2026)" in a document dated July 2, 2026.
4. **Felici downpayment.** The 07-02 proposal sets a ₱9,600 downpayment (20% of ₱48,000). The 08-22 contract says ₱20,000 (10% of ₱200,000) "was paid" on July 2, 2026 — the same day as the ₱9,600 document.
5. **Felici 08-22 contract's deemed-approval window disagrees with itself.** The payment table says "deemed approval via 7-day non-response as outlined in Revisions & Scope Management", but that section defines 10 calendar days plus 3.
6. **Deemed approval differs per document.** FourlinQ app: 15 business days then 15 days. Felici 08-22: 10 + 3 calendar days. Felici 07-02: 7 + 3 calendar days.
7. **Invoice and penalty terms drift.** Invoices due in 5 business days (Felici 07-02) vs 7 business days (Felici 08-22, FourlinQ app). The 2% penalty runs from "the due date" (Felici 07-02) vs "the date of issuance" (Felici 08-22, FourlinQ app) vs "the date of signing" (FourlinQ sign-off).
8. **Revision rounds.** 5 rounds (FourlinQ app) vs 3 rounds (both Felici documents). Both the FourlinQ app and Felici 08-22 contracts say revisions "may be utilized until after the Project Sign-Off document is signed" and, in the next sentence, "must be utilized prior to the final Project Sign-off".
9. **Client no-response threshold.** 10 calendar days (FourlinQ app) vs 7 calendar days (both Felici documents).
10. **Commission agreement cross-references are wrong.** Section VII says penalties are "as described in Section VII" (itself); Section VIII cites confidentiality "as described in Section VI" (it is VII); Section X says IP and confidentiality survive "as described in Sections V and VI" (both are VII). The staff pool text mentions a referral allocation but the staff pool table has no referral row.
11. **Hot Shots Fuel AUD rate.** ₱18,000 = AUD 422.37, ₱42,000 = AUD 985.56 and ₱60,000 = AUD 1,407.93 all imply ~42.62 PHP/AUD, but ₱2,959.82 = AUD 70 implies ~42.28.
12. **Campaign draft date and name.** The document says May 26, 2026; `SOURCE-DOCS.md` lists it as 05/28/2026. The fee table names the second talent "Papa Jackson" while everywhere else says "Papa Jack".
13. **DJ Kara reach.** The Excalibur minutes cite "DJ Kara, 4M followers"; the campaign draft's own metric sum is 3,688,000.
14. **Undated documents.** The commission agreement, the PROJECT SIGN-OFF DOCUMENT and the pitch script carry no printed date; only Drive modification dates or `SOURCE-DOCS.md` supply one.
15. **Nothing is signed.** Every signature block in every document is blank in the Drive copy, including the "[PAID]" Felici contract and the FourlinQ addendum that names Ms. Imie.
