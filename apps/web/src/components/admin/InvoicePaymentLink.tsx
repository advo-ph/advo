/**
 * The button that turns an invoice into something a client can pay.
 *
 * This is the entire user-facing surface of migration 022. Everything else in that
 * migration — the provider seam, the signature verification, the settlement invariants —
 * exists so that pressing this is safe.
 *
 * Four behaviours, and each of them is about being honest rather than looking finished:
 *
 *   1. THE MANUAL RAIL IS NOT A FAILURE. With `PAYMENT_PROVIDER=manual` — the default,
 *      and what the business does today — the API returns an intent with NO checkout URL.
 *      That is a success, and it is reported as one: the collectable is recorded and the
 *      operator is told to collect out-of-band. A button that showed an error here would
 *      be lying about a working path.
 *
 *   2. A FALLBACK IS NAMED. If `PAYMENT_PROVIDER=paymongo` is set but the credential is
 *      missing, the API answers with `fellBack: true` and a reason. Swallowing that would
 *      let an operator believe PayMongo is live while every invoice quietly becomes a
 *      manual row — which is the exact shape of the mail outage that ran unnoticed for
 *      months.
 *
 *   3. AN ALREADY-PAID INVOICE HAS NO BUTTON. The API refuses with 409, but a button that
 *      exists only to fail is a button people press.
 *
 *   4. THE LINK IS COPYABLE, NOT AUTO-OPENED. This is a payment URL for a CLIENT. Opening
 *      it in the operator's own browser is at best noise on the provider's funnel and at
 *      worst a real payment attempt from the wrong person.
 */
import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { post } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface PaymentIntentResult {
  intent: {
    paymentIntentId: number;
    provider: string;
    checkoutUrl: string | null;
  };
  checkoutUrl: string | null;
  /** True when a provider was named but manual answered instead. */
  fellBack: boolean;
  detail: string;
}

interface InvoicePaymentLinkProps {
  invoiceId: number;
  /** Rendered as nothing when the invoice is already paid — see behaviour 3. */
  status: string;
}

const InvoicePaymentLink = ({ invoiceId, status }: InvoicePaymentLinkProps) => {
  const { toast } = useToast();
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Behaviour 3.
  if (status === "paid") return null;

  const onCreate = async () => {
    setIsWorking(true);
    const res = await post<PaymentIntentResult>("/api/payment/intent", { invoiceId });
    setIsWorking(false);

    if (res.error) {
      toast({ title: "Could not create a payment link", description: res.error, variant: "destructive" });
      return;
    }

    const url = res.data?.checkoutUrl ?? null;
    setCheckoutUrl(url);

    if (url) {
      toast({
        title: `${res.data?.intent.provider} link ready`,
        // Behaviour 2: a fallback is named even on the success path.
        description: res.data?.fellBack ? res.data.detail : "Copy it to the client.",
      });
      return;
    }

    // Behaviour 1: no URL is the manual rail working, not an error.
    toast({
      title: "Collectable recorded",
      description: res.data?.detail ?? "No checkout URL — collect out-of-band and settle it here.",
    });
  };

  const onCopy = async () => {
    if (!checkoutUrl) return;
    await navigator.clipboard.writeText(checkoutUrl);
    setIsCopied(true);
    // Reverts so the button does not sit reading "Copied" forever, which stops it
    // reporting anything about the NEXT press.
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Behaviour 4: copy, never auto-open.
  if (checkoutUrl) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={onCopy}
        aria-label="Copy payment link"
        title={checkoutUrl}
      >
        {isCopied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0"
      disabled={isWorking}
      onClick={onCreate}
      aria-label="Create payment link"
      title="Create a payment link for this invoice"
    >
      <Link2 className="h-3.5 w-3.5" />
    </Button>
  );
};

export default InvoicePaymentLink;
