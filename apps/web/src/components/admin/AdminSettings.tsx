import { useState, useEffect } from "react";
import {
  Plus,
  Save,
  Loader2,
  Check,
  Trash2,
  LogOut,
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
import { get, patch as apiPatch, post } from "@/lib/api";
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
  }, []);

  useEffect(() => {
    if (isOwner) fetchAccounts();
  }, [isOwner]);

  const fetchAccounts = async () => {
    const res = await get<MemberAccount[]>("/api/team/accounts");
    if (res.data) setAccounts(res.data);
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
              <div key={account.teamMemberId} className="flex items-center justify-between gap-3 px-4 min-h-12 py-2">
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
            ))}
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
    </div>
  );
};

export default AdminSettings;
