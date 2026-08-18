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
  sample: { name: string; email: string; company: string | null }[];
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

  const load = useCallback(async () => {
    try {
      setCampaign(await get<Campaign[]>("/api/campaign"));
    } catch {
      /* listing failure is non-fatal for the form */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** DRY-RUN. Resolves and counts. Sends nothing. */
  const runPreview = async () => {
    setIsLoading(true);
    try {
      setPreview(await post<Preview>("/api/campaign/preview", segment()));
    } catch (err) {
      toast({
        title: "Preview failed",
        description: err instanceof Error ? err.message : "Could not resolve the segment",
        variant: "destructive",
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
      const queued = await post<{ recipientCount: number }>(
        `/api/campaign/${created.campaignId}/materialize`,
        {},
      );
      toast({
        title: "Campaign queued",
        description: `${queued.recipientCount} recipient queued. Nothing has been sent yet.`,
      });
      setName("");
      setSubject("");
      setBodyHtml("");
      await load();
    } catch (err) {
      toast({
        title: "Could not queue the campaign",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const send = async (campaignId: number) => {
    setIsLoading(true);
    try {
      const result = await post<{ sentCount: number; failedCount: number; skippedCount: number }>(
        `/api/campaign/${campaignId}/send`,
        {},
      );
      toast({
        title: "Send pass complete",
        description: `${result.sentCount} sent, ${result.failedCount} failed, ${result.skippedCount} skipped by suppression.`,
      });
      await load();
    } catch (err) {
      toast({
        title: "Send refused",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
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
