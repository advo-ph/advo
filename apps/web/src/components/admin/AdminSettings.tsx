import { useState, useEffect } from "react";
import {
  Plus,
  Save,
  Loader2,
  Check,
  Trash2,
  LogOut,
  Copy,
  KeyRound,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useRoles } from "@/hooks/useRoles";
import * as db from "@/lib/db";
import { get, patch as apiPatch, post, getApiOrigin } from "@/lib/api";
import { PageHeader, Panel, Dot } from "@/components/admin/_ui";
import { navGroups, type AdminSection } from "@/components/admin/AdminSidebar";
import { useNavHidden } from "@/hooks/useNavHidden";

interface SocialLink {
  platform: string;
  url: string;
}

interface MemberAccount {
  teamMemberId: number;
  name: string;
  role: string;
  userId: number | null;
  username: string | null;
  /** Null when the member has no account yet. */
  canLogin: boolean | null;
  isOwner: boolean | null;
}

/** One row of the Developer panel: a member's bot key and webhook. */
interface DeveloperRow {
  teamMemberId: number;
  name: string;
  isSelf: boolean;
  botKeyId: number | null;
  botKeyPrefix: string | null;
  botKeyLastUsedAt: string | null;
  memberWebhookId: number | null;
  memberWebhookUrl: string | null;
  memberWebhookIsActive: boolean | null;
  memberWebhookLastStatus: string | null;
}

const AdminSettings = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };
  const { isOwner, viewAsMember, setViewAsMember } = useRoles();
  const canToggleView = isOwner || viewAsMember;
  const { hidden: navHidden, save: saveNavHidden } = useNavHidden();

  const toggleNavItem = async (id: AdminSection, visible: boolean) => {
    const next = visible ? navHidden.filter((h) => h !== id) : [...navHidden, id];
    const res = await saveNavHidden(next);
    if (res.error) toast({ title: "Could not save", description: res.error, variant: "destructive" });
  };

  // Member accounts (owner only)
  const [accounts, setAccounts] = useState<MemberAccount[]>([]);
  const [editing, setEditing] = useState<MemberAccount | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  // Developer panel — a member sees only their own row, the owner sees everyone who added one.
  const [developerRows, setDeveloperRows] = useState<DeveloperRow[]>([]);

  // Bot keys — one live MCP bearer credential per member.
  const [botKeyBusyId, setBotKeyBusyId] = useState<number | null>(null);
  const [newBotKey, setNewBotKey] = useState<{ memberName: string; token: string } | null>(null);

  // Member webhooks — push alerts on every activity_log row.
  const [webhookUrlDraft, setWebhookUrlDraft] = useState<Record<number, string>>({});
  const [webhookBusyId, setWebhookBusyId] = useState<number | null>(null);
  const [webhookTestResult, setWebhookTestResult] = useState<Record<number, "ok" | "failed">>({});
  const [newWebhookSecret, setNewWebhookSecret] = useState<{ memberName: string; secret: string } | null>(null);

  // Password change
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Social links
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [isSavingSocial, setIsSavingSocial] = useState(false);

  // API status
  const [apiStatus, setApiStatus] = useState<"connected" | "disconnected" | "checking">("checking");

  useEffect(() => {
    checkApiConnection();
    fetchSocialLinks();
    fetchDeveloperRows();
  }, []);

  useEffect(() => {
    if (isOwner) fetchAccounts();
  }, [isOwner]);

  const fetchAccounts = async () => {
    const res = await get<MemberAccount[]>("/api/team/accounts");
    if (res.data) setAccounts(res.data);
  };

  const fetchDeveloperRows = async () => {
    const res = await get<DeveloperRow[]>("/api/team/developer");
    if (res.data) setDeveloperRows(res.data);
  };

  const openAccount = (account: MemberAccount) => {
    setEditing(account);
    setEditUsername(account.username ?? "");
    setEditPassword("");
  };

  const saveAccount = async () => {
    if (!editing) return;
    const isNew = editing.userId == null;
    const username = editUsername.trim();
    const body: { username?: string; password?: string } = {};
    if (username && username !== editing.username) body.username = username;
    if (editPassword) body.password = editPassword;
    if (isNew && (!body.username || !body.password)) {
      toast({ title: "Enter a username and a password", variant: "destructive" });
      return;
    }
    if (!body.username && !body.password) {
      setEditing(null);
      return;
    }
    if (body.password && body.password.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    setIsSavingAccount(true);
    const res = await apiPatch(`/api/team/${editing.teamMemberId}/account`, body);
    setIsSavingAccount(false);
    if (res.error) {
      toast({ title: "Could not save", description: res.error, variant: "destructive" });
      return;
    }
    toast({ title: isNew ? `Login created for ${editing.name}` : `Login updated for ${editing.name}` });
    setEditing(null);
    fetchAccounts();
  };

  const createBotKey = async (account: DeveloperRow) => {
    setBotKeyBusyId(account.teamMemberId);
    const res = await post<{ botKeyId: number; token: string }>("/api/bot-keys", {
      teamMemberId: account.teamMemberId,
    });
    setBotKeyBusyId(null);
    if (res.error || !res.data) {
      toast({ title: "Could not create bot key", description: res.error, variant: "destructive" });
      return;
    }
    setNewBotKey({ memberName: account.name, token: res.data.token });
    fetchDeveloperRows();
  };

  const revokeBotKey = async (account: DeveloperRow) => {
    if (!account.botKeyId) return;
    setBotKeyBusyId(account.teamMemberId);
    const res = await post(`/api/bot-keys/${account.botKeyId}/revoke`, {});
    setBotKeyBusyId(null);
    if (res.error) {
      toast({ title: "Could not revoke bot key", description: res.error, variant: "destructive" });
      return;
    }
    toast({ title: `Bot key revoked for ${account.name}` });
    fetchDeveloperRows();
  };

  const saveWebhook = async (account: DeveloperRow) => {
    const url = (webhookUrlDraft[account.teamMemberId] ?? account.memberWebhookUrl ?? "").trim();
    if (!url) {
      toast({ title: "Enter a webhook URL first", variant: "destructive" });
      return;
    }
    setWebhookBusyId(account.teamMemberId);
    const res = account.memberWebhookId
      ? await apiPatch(`/api/webhooks/${account.memberWebhookId}`, { url })
      : await post<{ memberWebhookId: number; secret: string }>("/api/webhooks", { teamMemberId: account.teamMemberId, url });
    setWebhookBusyId(null);
    if (res.error) {
      toast({ title: "Could not save webhook", description: res.error, variant: "destructive" });
      return;
    }
    if (!account.memberWebhookId && "data" in res && res.data) {
      setNewWebhookSecret({ memberName: account.name, secret: (res.data as { secret: string }).secret });
    } else {
      toast({ title: `Webhook saved for ${account.name}` });
    }
    fetchDeveloperRows();
  };

  const toggleWebhookActive = async (account: DeveloperRow) => {
    if (!account.memberWebhookId) return;
    setWebhookBusyId(account.teamMemberId);
    const res = await apiPatch(`/api/webhooks/${account.memberWebhookId}`, {
      isActive: !account.memberWebhookIsActive,
    });
    setWebhookBusyId(null);
    if (res.error) {
      toast({ title: "Could not update webhook", description: res.error, variant: "destructive" });
      return;
    }
    fetchDeveloperRows();
  };

  const testWebhook = async (account: DeveloperRow) => {
    if (!account.memberWebhookId) return;
    setWebhookBusyId(account.teamMemberId);
    const res = await post<{ ok: boolean; error?: string }>(`/api/webhooks/${account.memberWebhookId}/test`, {});
    setWebhookBusyId(null);
    if (res.error || !res.data) {
      toast({ title: "Could not reach test endpoint", description: res.error, variant: "destructive" });
      return;
    }
    setWebhookTestResult((prev) => ({ ...prev, [account.teamMemberId]: res.data!.ok ? "ok" : "failed" }));
    toast(
      res.data.ok
        ? { title: "Test delivery succeeded" }
        : { title: "Test delivery failed", description: res.data.error, variant: "destructive" },
    );
    fetchDeveloperRows();
  };

  const fetchSocialLinks = async () => {
    const res = await get<{ value: unknown }>("/api/settings/social_links");
    if (res.data?.value) {
      const val = typeof res.data.value === "string" ? JSON.parse(res.data.value) : res.data.value;
      setSocialLinks(Array.isArray(val) ? val : []);
    }
  };

  const checkApiConnection = async () => {
    setApiStatus("checking");
    try {
      const isConnected = await db.checkConnection();
      setApiStatus(isConnected ? "connected" : "disconnected");
    } catch {
      setApiStatus("disconnected");
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    setIsChangingPassword(true);
    try {
      const res = await post("/api/auth/change-password", { currentPassword, newPassword });
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
      } else {
        toast({ title: "Password changed successfully" });
        setIsPasswordOpen(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unable to change password",
        variant: "destructive",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSaveSocial = async () => {
    setIsSavingSocial(true);
    try {
      const res = await apiPatch("/api/settings/social_links", { value: socialLinks });
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
      } else {
        toast({ title: "Social links saved" });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unable to save social links",
        variant: "destructive",
      });
    } finally {
      setIsSavingSocial(false);
    }
  };

  const addSocialLink = () => setSocialLinks([...socialLinks, { platform: "", url: "" }]);

  const updateSocialLink = (idx: number, field: keyof SocialLink, val: string) => {
    setSocialLinks(socialLinks.map((l, i) => (i === idx ? { ...l, [field]: val } : l)));
  };

  const removeSocialLink = (idx: number) => setSocialLinks(socialLinks.filter((_, i) => i !== idx));

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" meta="Admin preferences" />

      <Panel title="Account" meta={user?.email}>
        <div className="p-4">
          <Button variant="outline" size="sm" className="h-9" onClick={handleSignOut}>
            <LogOut className="h-3.5 w-3.5 mr-1.5" /> Log out
          </Button>
        </div>
      </Panel>

      {/* Social Links */}
      <Panel
        title="Social links"
        meta="Displayed in the footer"
        action={
          <Button variant="outline" size="sm" className="h-8" onClick={addSocialLink}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add link
          </Button>
        }
      >
        <div className="p-4 space-y-3">
          {socialLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No social links configured</p>
          ) : (
            socialLinks.map((link, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input placeholder="Platform (e.g. facebook)" value={link.platform}
                  onChange={(e) => updateSocialLink(idx, "platform", e.target.value)} className="h-9 max-w-[160px]" />
                <Input placeholder="https://..." value={link.url}
                  onChange={(e) => updateSocialLink(idx, "url", e.target.value)} className="h-9 flex-1" />
                <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => removeSocialLink(idx)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            ))
          )}
          {socialLinks.length > 0 && (
            <Button onClick={handleSaveSocial} disabled={isSavingSocial} size="sm" className="h-8">
              {isSavingSocial ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              Save social links
            </Button>
          )}
        </div>
      </Panel>

      {/* Sidebar visibility: owner only. Applies to every console user. */}
      {isOwner && (
        <Panel title="Sidebar" meta="Buttons everyone sees">
          <div className="divide-y divide-border">
            {navGroups.map((group) => (
              <div key={group.label} className="px-4 py-3">
                <div className="pb-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {group.label}
                </div>
                <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <label key={item.id} className="flex min-h-9 items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2">
                        <item.icon className="h-4 w-4 text-muted-foreground" />
                        {item.label}
                        {item.ownerOnly && <span className="text-xs text-muted-foreground">(you only)</span>}
                      </span>
                      <Switch
                        checked={!navHidden.includes(item.id)}
                        onCheckedChange={(on) => toggleNavItem(item.id, on)}
                        aria-label={`Show ${item.label}`}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Security */}
      <Panel
        title="Security"
        meta="Account password"
        action={
          <Button variant="outline" size="sm" className="h-8" onClick={() => setIsPasswordOpen(true)}>
            Change password
          </Button>
        }
      >
        <div className="px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Update the password used to sign in to the admin console.
          </p>
        </div>
      </Panel>

      {/* Member accounts: owner only. Username and password each member logs in with. */}
      {isOwner && (
        <Panel title="Member accounts" meta="Logins for team members">
          <div className="divide-y divide-border">
            {accounts.length === 0 && (
              <div className="px-4 py-3 text-sm text-muted-foreground">No team members yet.</div>
            )}
            {accounts.map((account) => (
              <div key={account.teamMemberId} className="px-4 py-2">
                <div className="flex items-center justify-between gap-3 min-h-8">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{account.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {account.username ?? "No login"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {account.canLogin === false && (
                      <Badge variant="outline" className="text-destructive border-destructive/30">
                        No access
                      </Badge>
                    )}
                    <Button variant="outline" size="sm" className="h-8" onClick={() => openAccount(account)}>
                      {account.userId == null ? "Add login" : "Edit"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Developer: bot key (MCP) + webhook. Each member manages their own; the owner also sees
          every member who has added one. Empty until someone adds something. */}
      {developerRows.length > 0 && (
        <Panel title="Developer" meta={isOwner ? "Bot keys and webhooks" : "Optional, for bots"}>
          <div className="divide-y divide-border">
            {developerRows.map((row) => {
              const busyKey = botKeyBusyId === row.teamMemberId;
              const busyHook = webhookBusyId === row.teamMemberId;
              return (
                <div key={row.teamMemberId} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-3 min-h-8">
                    <div className="min-w-0">
                      <div className="text-sm truncate">{row.isSelf ? "You" : row.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {row.botKeyId ? (
                          <span className="font-mono">{row.botKeyPrefix}…</span>
                        ) : (
                          "No bot key"
                        )}
                        {row.botKeyLastUsedAt && ` · used ${new Date(row.botKeyLastUsedAt).toLocaleDateString()}`}
                      </div>
                    </div>
                    {row.botKeyId ? (
                      <Button variant="outline" size="sm" className="h-8 shrink-0 text-destructive"
                        disabled={busyKey} onClick={() => revokeBotKey(row)}>
                        {busyKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Revoke"}
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="h-8 shrink-0"
                        disabled={busyKey} onClick={() => createBotKey(row)}>
                        {busyKey ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <KeyRound className="h-3.5 w-3.5 mr-1.5" /> Add bot key
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  {/* Webhook — push alerts on every change in ADVO. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Dot
                      className={
                        row.memberWebhookId == null
                          ? "bg-muted"
                          : webhookTestResult[row.teamMemberId] === "failed" || row.memberWebhookLastStatus === "failing"
                          ? "bg-red-500"
                          : row.memberWebhookLastStatus === "ok"
                          ? "bg-green-500"
                          : "bg-yellow-500"
                      }
                    />
                    <Input
                      className="h-8 text-xs flex-1 min-w-[10rem]"
                      placeholder="Webhook URL (optional)"
                      value={webhookUrlDraft[row.teamMemberId] ?? row.memberWebhookUrl ?? ""}
                      onChange={(e) => setWebhookUrlDraft((prev) => ({ ...prev, [row.teamMemberId]: e.target.value }))}
                    />
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-8" disabled={busyHook} onClick={() => saveWebhook(row)}>
                        {busyHook ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                      </Button>
                      {row.memberWebhookId != null && (
                        <>
                          <Button variant="outline" size="sm" className="h-8" disabled={busyHook} onClick={() => testWebhook(row)}>
                            Test
                          </Button>
                          <Switch
                            checked={row.memberWebhookIsActive ?? false}
                            onCheckedChange={() => toggleWebhookActive(row)}
                            aria-label={`Webhook active for ${row.name}`}
                          />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Integrations */}
      <Panel title="Integrations" meta="Connection status for services">
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between gap-3 px-4 h-11">
            <div className="flex items-center gap-2.5 min-w-0">
              <Dot
                className={
                  apiStatus === "connected"
                    ? "bg-green-500"
                    : apiStatus === "checking"
                    ? "bg-yellow-500"
                    : "bg-red-500"
                }
              />
              <span className="text-sm">API</span>
              <span className="text-xs text-muted-foreground truncate">
                {import.meta.env.VITE_API_URL || "Not configured"}
              </span>
            </div>
            {/* Semantic tokens: light → -700 values (≥4.5:1 on near-white); dark → -500
                values (≥5.1:1 on near-black). Avoids a hardcoded -700 that fails dark mode.
                Verified: red-700 dark was 2.97:1 (fail); danger token uses -500 → 5.1:1. */}
            <Badge variant="outline" className={`gap-1 shrink-0 ${apiStatus === "connected" ? "text-success border-success/40" : apiStatus === "checking" ? "text-warning border-warning/40" : "text-danger border-danger/40"}`}>
              {apiStatus === "connected" && <Check className="h-3 w-3" />}
              {apiStatus === "checking" && <Loader2 className="h-3 w-3 animate-spin" />}
              {apiStatus === "connected" ? "Connected" : apiStatus === "checking" ? "Checking..." : "Disconnected"}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 h-11">
            <div className="flex items-center gap-2.5 min-w-0">
              <Dot className="bg-green-500" />
              <span className="text-sm">Vercel</span>
              <span className="text-xs text-muted-foreground truncate">Deployment platform</span>
            </div>
            <Badge variant="outline" className="text-success border-success/40 gap-1 shrink-0">
              <Check className="h-3 w-3" /> Connected
            </Badge>
          </div>
        </div>
      </Panel>

      {/* See as member — owner only */}
      {canToggleView && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 h-12">
          <span className="text-sm">See as member</span>
          <Switch checked={viewAsMember} onCheckedChange={setViewAsMember} />
        </div>
      )}

      {/* Password Change Dialog */}
      <Dialog open={isPasswordOpen} onOpenChange={setIsPasswordOpen}>
        <DialogContent className="bg-card border-border max-w-sm rounded-lg">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground block">Current password</label>
              <Input className="h-9" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground block">New password</label>
              <Input className="h-9" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground block">Confirm new password</label>
              <Input className="h-9" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePasswordChange()} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPasswordOpen(false)}>Cancel</Button>
            <Button onClick={handlePasswordChange} disabled={isChangingPassword}>
              {isChangingPassword ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Member Account Dialog */}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="bg-card border-border max-w-sm rounded-lg">
          <DialogHeader>
            <DialogTitle>{editing?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground block">Username</label>
              <Input className="h-9" value={editUsername} autoComplete="off"
                onChange={(e) => setEditUsername(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground block">
                {editing?.userId == null ? "Password" : "New password"}
              </label>
              <Input className="h-9" type="password" value={editPassword} autoComplete="new-password"
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder={editing?.userId == null ? "Min 8 characters" : "Leave empty to keep"}
                onKeyDown={(e) => e.key === "Enter" && saveAccount()} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveAccount} disabled={isSavingAccount}>
              {isSavingAccount ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New bot key reveal — shown exactly once at creation time. */}
      <Dialog open={newBotKey !== null} onOpenChange={(open) => !open && setNewBotKey(null)}>
        <DialogContent className="bg-card border-border max-w-sm rounded-lg">
          <DialogHeader>
            <DialogTitle>Bot key for {newBotKey?.memberName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <Input className="h-9 min-w-0 flex-1 font-mono text-xs" readOnly value={newBotKey?.token ?? ""} />
              <Button
                variant="outline"
                size="sm"
                className="h-9 shrink-0"
                onClick={() => newBotKey && navigator.clipboard.writeText(newBotKey.token)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">This will not be shown again.</p>
            <div className="min-w-0 space-y-1 pt-2">
              <p className="text-xs font-medium text-foreground">MCP server URL</p>
              <div className="flex items-center gap-2 min-w-0">
                <Input className="h-9 min-w-0 flex-1 font-mono text-xs" readOnly value={`${getApiOrigin()}/mcp`} />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0"
                  onClick={() => navigator.clipboard.writeText(`${getApiOrigin()}/mcp`)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="min-w-0 space-y-1 pt-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-foreground">Connect from Grok</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      `{"type":"mcp","server_url":"${getApiOrigin()}/mcp","authorization":"Bearer ${newBotKey?.token ?? "<key>"}"}`,
                    )
                  }
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/40 p-2 text-[11px] leading-snug">
{`{"type":"mcp","server_url":"${getApiOrigin()}/mcp","authorization":"Bearer ${newBotKey?.token ?? "<key>"}"}`}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewBotKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New webhook secret reveal — shown exactly once at creation time. */}
      <Dialog open={newWebhookSecret !== null} onOpenChange={(open) => !open && setNewWebhookSecret(null)}>
        <DialogContent className="bg-card border-border max-w-sm rounded-lg">
          <DialogHeader>
            <DialogTitle>Webhook secret for {newWebhookSecret?.memberName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <div className="flex items-center gap-2">
              <Input className="h-9 font-mono text-xs" readOnly value={newWebhookSecret?.secret ?? ""} />
              <Button
                variant="outline"
                size="sm"
                className="h-9 shrink-0"
                onClick={() => newWebhookSecret && navigator.clipboard.writeText(newWebhookSecret.secret)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Used to verify the X-ADVO-Signature header on every delivery. This will not be shown again.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewWebhookSecret(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSettings;
