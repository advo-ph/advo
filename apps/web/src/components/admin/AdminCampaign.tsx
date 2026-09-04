import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, Send, ShieldBan, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { get, post } from "@/lib/api";
import { PageHeader, Empty } from "./_ui";

type Campaign = {
  campaignId: number;
  name: string;
  subject: string;
  status: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
};

type Preview = {
  recipientCount: number;
  suppressedCount: number;
  isOutreachConfigured: boolean;
  isOutreachDnsVerified: boolean;
  dnsUnverifiedReason: string | null;
  sample: { name: string; email: string; company: string | null }[];
};

type SendResult = {
  sentCount: number;
  failedCount: number;
  skippedCount: number;
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700",
  sending: "bg-blue-100 text-blue-700",
  paused: "bg-amber-100 text-amber-700",
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

const AdminCampaign = () => {
  const { toast } = useToast();
  const [campaign, setCampaign] = useState<Campaign[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [isOutdatedOnly, setIsOutdatedOnly] = useState(true);
  const [limitCount, setLimitCount] = useState("50");
  const [ratePerHour, setRatePerHour] = useState("60");

  const segment = useCallback(
    () => ({
      isOutdatedOnly,
      limitCount: Number(limitCount) > 0 ? Number(limitCount) : undefined,
    }),
    [isOutdatedOnly, limitCount],
  );

  // Every helper in lib/api returns the { data, error } envelope and never throws.
  // Unwrap it and check res.error, or the envelope object itself lands in state and
  // the next .length / .map call takes the whole console down.
  const load = useCallback(async () => {
    const res = await get<Campaign[]>("/api/campaign");
    if (res.error || !Array.isArray(res.data)) {
      setCampaign([]);
      toast({
        title: "Could not load campaigns",
        description: res.error || "The API did not return a campaign list. Reload to try again.",
        variant: "destructive",
      });
      return;
    }
    setCampaign(res.data);
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  /** DRY-RUN. Resolves and counts. Sends nothing. */
  const runPreview = async () => {
    setIsLoading(true);
    try {
      const res = await post<Preview>("/api/campaign/preview", segment());
      if (res.error || !res.data) {
        setPreview(null);
        toast({
          title: "Preview failed",
          description: res.error || "Could not resolve the segment. Check the cap and try again.",
          variant: "destructive",
        });
        return;
      }
      // The transport banners below read isOutreachConfigured. A missing sample array
      // would crash the render, so normalise it here at the boundary.
      setPreview({
        ...res.data,
        sample: Array.isArray(res.data.sample) ? res.data.sample : [],
      });
    } finally {
      setIsLoading(false);
    }
  };

  const createAndQueue = async () => {
    if (!name.trim() || !subject.trim() || !bodyHtml.trim()) {
      toast({ title: "Name, subject, and body are all required", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const created = await post<Campaign>("/api/campaign", {
        name,
        subject,
        bodyHtml,
        segment: segment(),
        ratePerHour: Number(ratePerHour) > 0 ? Number(ratePerHour) : 60,
      });
      if (created.error || !created.data) {
        toast({
          title: "Could not create the campaign",
          description: created.error || "The API did not return the new campaign.",
          variant: "destructive",
        });
        return;
      }

      const queued = await post<{ campaignId: number; recipientCount: number }>(
        `/api/campaign/${created.data.campaignId}/materialize`,
        {},
      );
      if (queued.error || !queued.data) {
        // The campaign row exists but has no recipient rows. Say that, because
        // "queued" would be a lie and the operator needs to retry the queue step.
        toast({
          title: "Campaign created, but no recipient was queued",
          description:
            queued.error || "Materializing the segment failed. Queue it again to add recipients.",
          variant: "destructive",
        });
        await load();
        return;
      }

      toast({
        title: "Campaign queued",
        description: `${queued.data.recipientCount} recipient queued. Nothing has been sent yet.`,
      });
      setName("");
      setSubject("");
      setBodyHtml("");
      await load();
    } finally {
      setIsLoading(false);
    }
  };

  const send = async (campaignId: number) => {
    setIsLoading(true);
    try {
      const res = await post<SendResult>(`/api/campaign/${campaignId}/send`, {});

      // A refused send must never read as success. The API reports refusal through
      // res.error, which is exactly the case that used to toast "Send pass complete".
      if (res.error || !res.data) {
        toast({
          title: "Send refused. Nothing was sent.",
          description: res.error || "The API did not report a send result. Nothing was sent.",
          variant: "destructive",
        });
        return;
      }

      const { sentCount, failedCount, skippedCount } = res.data;
      const detail = `${sentCount} sent, ${failedCount} failed, ${skippedCount} skipped by suppression.`;

      if (sentCount === 0) {
        toast({
          title: "No email was sent.",
          description: detail,
          variant: "destructive",
        });
      } else {
        toast({
          title: failedCount > 0 ? "Send pass finished with failures" : "Send pass complete",
          description: detail,
        });
      }
      await load();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        meta="Batch outreach to a lead segment. Every send carries a one-click unsubscribe, and an unsubscribed, bounced, or complained address is suppressed permanently."
      />

      {preview && !preview.isOutreachConfigured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong className="font-semibold">No outreach transport configured.</strong> Set{" "}
          <code className="rounded bg-amber-100 px-1">OUTREACH_SMTP_HOST</code> and{" "}
          <code className="rounded bg-amber-100 px-1">OUTREACH_FROM</code> on the API. Sending is
          refused until then — it deliberately does not fall back to the transactional mailer that
          carries client login links.
        </div>
      )}

      {/* Configured but not cleared is the dangerous state: the transport would connect and the
          mail would go out unauthenticated. Say so separately from "not configured". */}
      {preview && preview.isOutreachConfigured && !preview.isOutreachDnsVerified && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <strong className="font-semibold">Outreach domain is not DNS-verified.</strong> The
          transport is configured, but SPF, DKIM and DMARC have not been confirmed to resolve for
          the sending domain — sending now is how a domain gets blocked on its first campaign.
          Sending stays refused.
          {preview.dnsUnverifiedReason && (
            <p className="mt-2 text-red-800">{preview.dnsUnverifiedReason}</p>
          )}
          <p className="mt-2 text-red-800">
            Run <code className="rounded bg-red-100 px-1">npm run outreach:preflight</code> to check
            the records and record the result.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-lg border p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Mail className="h-4 w-4" /> New campaign
          </h3>

          <Input placeholder="Internal name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            placeholder="Subject line"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <Textarea
            placeholder="Body HTML. An unsubscribe footer is appended automatically."
            rows={8}
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
          />

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isOutdatedOnly}
                onChange={(e) => setIsOutdatedOnly(e.target.checked)}
              />
              Outdated systems only
            </label>
            <label className="flex items-center gap-2">
              Cap
              <Input
                className="w-24"
                value={limitCount}
                onChange={(e) => setLimitCount(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2">
              Per hour
              <Input
                className="w-24"
                value={ratePerHour}
                onChange={(e) => setRatePerHour(e.target.value)}
              />
            </label>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={runPreview} disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
              Dry run
            </Button>
            <Button onClick={createAndQueue} disabled={isLoading}>
              Queue campaign
            </Button>
          </div>

          {preview && (
            <div className="rounded-md bg-neutral-50 p-3 text-sm">
              <div className="font-semibold">
                {preview.recipientCount} recipient will receive this.
              </div>
              <div className="mt-1 flex items-center gap-1 text-neutral-600">
                <ShieldBan className="h-3.5 w-3.5" />
                {preview.suppressedCount} address on the permanent suppression list.
              </div>
              {preview.sample.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-neutral-500">
                  {preview.sample.map((s) => (
                    <li key={s.email}>
                      {s.name} — {s.email}
                      {s.company ? ` (${s.company})` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-lg border p-5">
          <h3 className="text-sm font-semibold">Campaigns</h3>
          {campaign.length === 0 ? (
            <Empty text="No campaign yet. Dry-run a segment, then queue your first campaign." icon={Mail} />
          ) : (
            <ul className="space-y-2">
              {campaign.map((row) => (
                <li
                  key={row.campaignId}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{row.name}</div>
                    <div className="truncate text-xs text-neutral-500">{row.subject}</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {row.sentCount}/{row.recipientCount} sent
                      {row.failedCount > 0 ? ` · ${row.failedCount} failed` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge className={STATUS_TONE[row.status] ?? ""}>{row.status}</Badge>
                    {row.status !== "sent" && (
                      <Button size="sm" onClick={() => send(row.campaignId)} disabled={isLoading}>
                        <Send className="mr-1.5 h-3.5 w-3.5" />
                        Send
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminCampaign;
