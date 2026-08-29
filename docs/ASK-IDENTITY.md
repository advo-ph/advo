# The identity ask — one request, three blockers

Date: 2026-08-28
Owner: Prince (nobody else in the repo holds these facts)
Status: outstanding

Three separate pieces of work are stalled on the **same five facts** from ADVO's DTI/SEC
paperwork. They have been tracked as three rows in [ROADMAP.md](ROADMAP.md), which made them
look like three chases. They are one.

| Stalled thing | What it is waiting for | What happens when the facts arrive |
| --- | --- | --- |
| PayMongo merchant review | `registration_number`, `registration_body`, `business_address`, `support_phone` in `data/legal-identity.json` | `npm run bench:paymongo` goes 5/7 to 7/7 with **no code change**. Card and e-wallet acceptance stops being blocked at review. |
| [LEGAL-BRIEF.md](LEGAL-BRIEF.md) Annex A | The same registration particulars, plus entity type, signatory, and a correspondence address | The brief stops going to counsel with nine TODOs in its annex. |
| The contract's own signatory block | Legal name, entity type, authority to bind | We stop signing client contracts under a trade name whose legal identity is not written down anywhere in this repo. |

Nothing here can be inferred, derived, or looked up from inside the codebase, and no lane is
permitted to invent a registration number. That is deliberate: a guessed identifier on a public
disclosure page is worse than an honest "Not yet published", and a guessed one in a document
going to a lawyer is worse still.

---

## The message to send

Copy from here down.

> Hey Prince — I need five things off the ADVO registration paperwork. They are the only reason
> PayMongo is still blocked and the only blanks left in the lawyer packet. Everything else on both
> is done and waiting.
>
> From the DTI or SEC certificate, exactly as printed on it:
>
> 1. **Legal name of the entity** — the registered name, not "ADVO". If they differ, I need both.
> 2. **Entity type** — sole proprietorship, partnership, or corporation.
> 3. **Registering body and registration number** — DTI or SEC, and the number as printed.
> 4. **Registered business address** — the full address on the certificate, including postal code.
> 5. **Customer-service phone number** — a number we are willing to publish on advo.ph and answer.
>
> Two more, only for the lawyer packet:
>
> 6. **Who signs and binds the company** — name and the basis for their authority.
> 7. **Where counsel should send correspondence** — the registered address is fine if it is the same.
>
> A photo of the certificate covers 1 to 4 on its own. Send that and I will transcribe it.
>
> Two things worth knowing about why this is urgent rather than admin:
>
> - **PayMongo** reviews the live site before approving a merchant. `/terms`, `/privacy`, `/refund`
>   and `/dispute` are all live and linked, but they currently render "Not yet published" where the
>   registration number and address go, because I will not put an invented number on a compliance
>   page. A reviewer reading that will not approve us. This is the last thing between us and card
>   and e-wallet acceptance.
> - **The lawyer packet** is written and ready to send. It goes out with a blank annex until this
>   lands, and the terms it is asking about have already gone to a client, so the clock on that one
>   is not ours to set.

## Where the answers go

| Answer | Destination |
| --- | --- |
| 1 | `legal_name` in `data/legal-identity.json`, and Annex A row 1 |
| 2 | Annex A row 2 |
| 3 | `registration_body` + `registration_number` in `data/legal-identity.json`, Annex A row 3 |
| 4 | `business_address` in `data/legal-identity.json`, Annex A row 4 |
| 5 | `support_phone` in `data/legal-identity.json` |
| 6 | Annex A row 5 |
| 7 | Annex A row 6 |

`support_email` is already `contact@advo.ph` and needs nothing.

After transcribing, run `npm run bench:paymongo` — it must report 7/7. The bench is the check that
the transcription actually landed in the file the pages read from; the disclosure pages import the
identity rather than hardcoding it, so nothing else needs editing.

## Three facts about the 11 August contract, same ask, different source

These are not on the certificate — they come from the contract file itself, and Annex A carries
them as separate TODOs:

- **Was it executed?** Our copy shows neither investment tier initialed and no visible signature
  page. Until the executed original is retrieved, counsel has to treat it as terms offered.
- **The fortuitous-events clause is truncated** in our copy, ending mid-sentence at "In such
  circumstances, performance...". Nobody here knows what the sent version said after that.
- **Which investment tier the client selected.**

Ask for the sent PDF as well. It answers all three at once.
