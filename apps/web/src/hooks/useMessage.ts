/**
 * Message channels (migration 023) — the read/write surface for the admin inbox.
 *
 * Three queries, deliberately separate rather than one combined "messages" fetch:
 * untriaged inbound is a QUEUE somebody works through, undelivered outbound is an
 * OPS ALERT that should normally be empty, and contact channels are REFERENCE DATA.
 * Folding them together would make the empty-outbound case — the healthy one — look
 * identical to a loading state.
 *
 * The consent mutations are the ones to be careful with. `grantConsent` requires a
 * source string because "we have consent" without provenance is not a defence, and
 * `revokeConsent` is deliberately not a delete: the row is the evidence consent was
 * given and withdrawn, which is what a DPA complaint is answered with.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export type MessageChannel = "sms" | "viber" | "messenger" | "whatsapp";

export interface ContactChannel {
  contactChannelId: number;
  clientId: number | null;
  leadId: number | null;
  channel: MessageChannel;
  reference: string;
  displayName: string | null;
  isPrimary: boolean;
  /** NULL = we know the address and MAY NOT use it. The send path refuses. */
  consentAt: string | null;
  consentSource: string | null;
  revokedAt: string | null;
  note: string | null;
  createdAt: string;
}

export interface InboundMessage {
  inboundMessageId: number;
  channel: MessageChannel;
  clientId: number | null;
  projectId: number | null;
  leadId: number | null;
  senderReference: string;
  senderName: string | null;
  body: string | null;
  sentAt: string | null;
  receivedAt: string;
  /** False = stored but NOT verified. Never render it as plain client speech. */
  signatureVerified: boolean;
  isActioned: boolean;
}

export interface OutboundMessage {
  outboundMessageId: number;
  channel: MessageChannel;
  provider: string;
  toReference: string;
  body: string;
  purpose: string;
  /** queued | sent | failed | refused. "refused" is ours, not a provider's. */
  status: string;
  failureReason: string | null;
  sentAt: string | null;
  createdAt: string;
}

const UNTRIAGED_KEY = ["message", "inbound", "untriaged"];
const UNDELIVERED_KEY = ["message", "outbound", "undelivered"];
const CONTACT_KEY = ["message", "contact"];

export function useMessage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: untriaged = [], isLoading: isInboundLoading } = useQuery({
    queryKey: UNTRIAGED_KEY,
    queryFn: async () => (await get<InboundMessage[]>("/api/message/inbound/untriaged")).data || [],
    staleTime: 30 * 1000,
  });

  const { data: undelivered = [], isLoading: isOutboundLoading } = useQuery({
    queryKey: UNDELIVERED_KEY,
    queryFn: async () =>
      (await get<OutboundMessage[]>("/api/message/outbound/undelivered")).data || [],
    staleTime: 30 * 1000,
  });

  const { data: contact = [], isLoading: isContactLoading } = useQuery({
    queryKey: CONTACT_KEY,
    queryFn: async () => (await get<ContactChannel[]>("/api/message/contact")).data || [],
    staleTime: 60 * 1000,
  });

  const onErr = (e: Error) =>
    toast({ title: "Error", description: e.message, variant: "destructive" });

  const actionMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await post(`/api/message/inbound/${id}/action`);
      if (r.error) throw new Error(r.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: UNTRIAGED_KEY });
      toast({ title: "Marked as handled" });
    },
    onError: onErr,
  });

  const consentMutation = useMutation({
    mutationFn: async ({ id, consentSource }: { id: number; consentSource: string }) => {
      const r = await post(`/api/message/contact/${id}/consent`, { consentSource });
      if (r.error) throw new Error(r.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONTACT_KEY });
      toast({ title: "Consent recorded" });
    },
    onError: onErr,
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await post(`/api/message/contact/${id}/revoke`);
      if (r.error) throw new Error(r.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONTACT_KEY });
      // Named, not softened: the row survives, and an operator should know that rather
      // than assume they erased something.
      toast({
        title: "Consent withdrawn",
        description: "The record is kept — deleting it would lose the evidence consent was ever given.",
      });
    },
    onError: onErr,
  });

  return {
    untriaged,
    undelivered,
    contact,
    isLoading: isInboundLoading || isOutboundLoading || isContactLoading,
    markActioned: actionMutation.mutateAsync,
    grantConsent: consentMutation.mutateAsync,
    revokeConsent: revokeMutation.mutateAsync,
    isMutating:
      actionMutation.isPending || consentMutation.isPending || revokeMutation.isPending,
  };
}
