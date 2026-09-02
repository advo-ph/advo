/**
 * Admin Messages — the inbox for migration 023.
 *
 * Three panels, ordered by what a person should do first:
 *
 *   1. UNTRIAGED INBOUND — a queue you work through. Client messages that arrived on
 *      SMS / Viber / Messenger and that nobody has looked at.
 *   2. DIDN'T GO OUT — an ops alert that should normally be EMPTY. A `failed` row is a
 *      broken transport; a `refused` row is the consent gate doing its job. They are
 *      shown apart because they need completely different responses, and a dashboard
 *      that conflates them teaches people to ignore both.
 *   3. CONTACT CHANNELS — reference data, and the consent ledger.
 *
 * Two presentation rules that carry weight beyond styling:
 *
 * AN UNVERIFIED MESSAGE IS LABELLED. `signature_verified = false` means the callback's
 * signature did not check out. 023 stores those deliberately — dropping a real client
 * message costs more than storing a forgery — but a forged row rendered as plain client
 * speech would be a FABRICATED PAPER TRAIL, and this screen is where the change-order
 * process reads its evidence. So it is marked, every time.
 *
 * CONSENT STATE IS ALWAYS VISIBLE ON A CHANNEL ROW. Not behind a detail view. The whole
 * point of `contact_channel.consent_at` is that somebody can see, at a glance, which
 * addresses ADVO may not use — including the ~5K scraped clinic numbers if they are ever
 * imported.
 */
import { useState } from "react";
import {
  AlertTriangle,
  Check,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Panel, Empty, Stat, StatStrip } from "@/components/admin/_ui";
import { useMessage, type ContactChannel } from "@/hooks/useMessage";

const CHANNEL_LABEL: Record<string, string> = {
  sms: "SMS",
  viber: "Viber",
  messenger: "Messenger",
  whatsapp: "WhatsApp",
};

const fmtWhen = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "—";

/** Consent, as three distinct states rather than a boolean. */
function consentOf(row: ContactChannel): {
  label: string;
  icon: typeof ShieldCheck;
  isAllowed: boolean;
} {
  if (row.revokedAt) return { label: "withdrawn", icon: ShieldX, isAllowed: false };
  if (!row.consentAt) return { label: "no consent", icon: ShieldAlert, isAllowed: false };
  return { label: row.consentSource || "consented", icon: ShieldCheck, isAllowed: true };
}

const AdminMessages = () => {
  const {
    untriaged,
    undelivered,
    contact,
    isLoading,
    markActioned,
    grantConsent,
    revokeConsent,
    isMutating,
  } = useMessage();

  // Which channel row has its "why do we have permission?" input open. Consent is only
  // ever granted WITH a source, so there is no one-click grant.
  const [consentingId, setConsentingId] = useState<number | null>(null);
  const [consentSource, setConsentSource] = useState("");

  const failed = undelivered.filter((one) => one.status === "failed");
  const refused = undelivered.filter((one) => one.status === "refused");
  const consented = contact.filter((one) => consentOf(one).isAllowed).length;

  const onGrant = async (id: number) => {
    if (!consentSource.trim()) return;
    await grantConsent({ id, consentSource: consentSource.trim() });
    setConsentingId(null);
    setConsentSource("");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Messages"
        meta="SMS · Viber · Messenger — inbound and outbound"
      />

      <StatStrip cols={4}>
        <Stat label="Untriaged" value={String(untriaged.length)} sub="nobody has looked yet" />
        <Stat label="Send failures" value={String(failed.length)} sub="broken transport" />
        <Stat label="Refused" value={String(refused.length)} sub="consent gate held" />
        <Stat
          label="Reachable"
          value={`${consented}/${contact.length}`}
          sub="channels we may use"
        />
      </StatStrip>

      {/* ─── 1. The queue ─── */}
      <Panel title="Untriaged" meta={`${untriaged.length} waiting`}>
        {isLoading ? (
          <Empty text="Loading…" />
        ) : untriaged.length === 0 ? (
          <Empty text="Nothing waiting. Every message has been looked at." icon={MessageSquare} />
        ) : (
          <ul className="divide-y divide-border">
            {untriaged.map((one) => (
              <li key={one.inboundMessageId} className="px-4 py-3 flex items-start gap-3">
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium">
                      {CHANNEL_LABEL[one.channel] ?? one.channel}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {one.senderName || one.senderReference}
                    </span>
                    {/* The forged-paper-trail guard. Never render an unverified message
                        as plain client speech. */}
                    {!one.signatureVerified && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        unverified signature
                      </span>
                    )}
                    {one.projectId === null && (
                      <span className="text-xs text-muted-foreground">· unattached</span>
                    )}
                  </span>
                  <span className="block text-sm whitespace-pre-wrap break-words">
                    {one.body || <span className="text-muted-foreground">(no text — attachment only)</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {fmtWhen(one.sentAt ?? one.receivedAt)}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isMutating}
                  onClick={() => markActioned(one.inboundMessageId)}
                  className="shrink-0"
                >
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                  Handled
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ─── 2. The ops alert. Two lists, because they mean different things. ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Send failures" meta={failed.length ? `${failed.length} broken` : "none"}>
          {failed.length === 0 ? (
            <Empty text="Everything that was sent, sent." />
          ) : (
            <ul className="divide-y divide-border">
              {failed.map((one) => (
                <li key={one.outboundMessageId} className="px-4 py-3 space-y-1">
                  <p className="text-xs font-medium">
                    {CHANNEL_LABEL[one.channel] ?? one.channel} · {one.toReference} · {one.purpose}
                  </p>
                  {/* 023's CHECK guarantees this is never null on a failed row — that
                      constraint exists because a failure with no reason is the exact
                      shape of the outage this table was built to prevent. */}
                  <p className="text-xs text-muted-foreground break-words">{one.failureReason}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Refused before sending"
          meta={refused.length ? `${refused.length} held` : "none"}
        >
          {refused.length === 0 ? (
            <Empty text="Nothing was blocked." />
          ) : (
            <ul className="divide-y divide-border">
              {refused.map((one) => (
                <li key={one.outboundMessageId} className="px-4 py-3 space-y-1">
                  <p className="text-xs font-medium">
                    {CHANNEL_LABEL[one.channel] ?? one.channel} · {one.toReference} · {one.purpose}
                  </p>
                  <p className="text-xs text-muted-foreground break-words">{one.failureReason}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
            A refusal is not a failure. These were declined before reaching a provider —
            usually no recorded consent, which is the gate working.
          </p>
        </Panel>
      </div>

      {/* ─── 3. The consent ledger ─── */}
      <Panel title="Contact channels" meta={`${contact.length} on record`}>
        {contact.length === 0 ? (
          <Empty text="No contact channels yet." />
        ) : (
          <ul className="divide-y divide-border">
            {contact.map((one) => {
              const state = consentOf(one);
              const StateIcon = state.icon;
              return (
                <li key={one.contactChannelId} className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">
                        {one.displayName || one.reference}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {CHANNEL_LABEL[one.channel] ?? one.channel} · {one.reference}
                      </span>
                    </span>
                    {/* Always visible, never behind a detail view. */}
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                      <StateIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {state.label}
                    </span>
                    {state.isAllowed ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isMutating}
                        onClick={() => revokeConsent(one.contactChannelId)}
                        className="shrink-0"
                      >
                        Withdraw
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isMutating}
                        onClick={() => {
                          setConsentingId(one.contactChannelId);
                          setConsentSource("");
                        }}
                        className="shrink-0"
                      >
                        Record consent
                      </Button>
                    )}
                  </div>

                  {consentingId === one.contactChannelId && (
                    <div className="flex items-center gap-2">
                      <Input
                        value={consentSource}
                        onChange={(e) => setConsentSource(e.target.value)}
                        placeholder="Where did permission come from? e.g. contract, signup_form, client_reply"
                        className="h-8 text-xs"
                      />
                      <Button
                        size="sm"
                        // A source is REQUIRED. "We have consent" without provenance is
                        // not a defence, so there is no way to grant without saying why.
                        disabled={!consentSource.trim() || isMutating}
                        onClick={() => onGrant(one.contactChannelId)}
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConsentingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
          Under RA 10173 a stored number is not permission to use it. A channel with no
          recorded consent is refused before any provider is reached, and setting a
          provider key does not change that.
        </p>
      </Panel>
    </div>
  );
};

export default AdminMessages;
