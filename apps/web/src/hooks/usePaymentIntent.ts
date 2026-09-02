import { useQueries } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

/** Mirrors payment_intent (migration 022), camelCase from Drizzle. */
export interface PaymentIntent {
  paymentIntentId: number;
  invoiceId: number;
  provider: string;
  checkoutUrl: string | null;
  amountCents: number;
  currency: string;
  status: "pending" | "paid" | "failed" | "expired" | "cancelled" | string;
  method: string | null;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/**
 * The payable link, if any, for each invoice. A client may only read intents
 * for a named invoice, so this is one request per invoice rather than a list;
 * on a project that is two or three calls, cached for a minute.
 *
 * Returns only an intent a client can act on: pending, with a checkout URL,
 * not past its expiry. A manual-rail intent has no URL and is not offered as
 * a button, which is the honest state: it is collected by transfer.
 */
export function usePayableIntent(invoiceId: number[]) {
  const { user } = useAuth();
  const result = useQueries({
    queries: invoiceId.map((id) => ({
      queryKey: ["payment-intent", id],
      queryFn: async () => {
        const res = await get<PaymentIntent[]>(`/api/payment/intent?invoiceId=${id}`);
        return res.data || [];
      },
      enabled: Boolean(user),
      staleTime: 60 * 1000,
    })),
  });

  const payable: Record<number, PaymentIntent> = {};
  result.forEach((query, index) => {
    const now = Date.now();
    const open = (query.data || []).find(
      (intent) =>
        intent.status === "pending" &&
        Boolean(intent.checkoutUrl) &&
        (!intent.expiresAt || new Date(intent.expiresAt).getTime() > now),
    );
    if (open) payable[invoiceId[index]] = open;
  });
  return payable;
}
