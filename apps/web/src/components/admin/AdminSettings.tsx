import { useState, useEffect } from "react";
import {
  Plus,
  Save,
  X,
  Loader2,
  Check,
  Trash2,
} from "lucide-react";
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
import { get, patch as apiPatch, post, del } from "@/lib/api";
import { PageHeader, Panel, Dot } from "@/components/admin/_ui";

interface SocialLink {
  platform: string;
  url: string;
}

interface AdminMember {
  id: number;
  name: string;
  email: string;
  /** False when the account exists but is switched off. */
  canLogin: boolean;
}

const AdminSettings = () => {
  const { toast } = useToast();
  const { isOwner, viewAsMember, setViewAsMember } = useRoles();
  const canToggleView = isOwner || viewAsMember;

  const [adminEmails, setAdminEmails] = useState<AdminMember[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [isAddEmailOpen, setIsAddEmailOpen] = useState(false);

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
    fetchAdminEmails();
    fetchSocialLinks();
  }, []);

  const fetchAdminEmails = async () => {
    const res = await get<Array<Record<string, unknown>>>("/api/team");
    if (!res.data) return;
    // People who hold an admin LOGIN account. This used to list every roster row that had an
    // email address in a column, under the title "Admin users", which meant the panel named
    // one thing and showed another. loginRole comes from the user table, so the filter now
    // matches the title. team_member_id is kept so removal can target the row.
    setAdminEmails(
      res.data
        .filter((m) => m.loginRole === "admin" && !!m.loginEmail)
        .map((m) => ({
          id: Number(m.teamMemberId),
          name: (m.name as string) || (m.loginEmail as string),
          email: m.loginEmail as string,
          canLogin: m.canLogin !== false,
        }))
    );
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

  const addAdminEmail = async () => {
    if (!newEmail || !newEmail.includes("@")) {
      toast({ title: "Invalid email", variant: "destructive" });
      return;
    }
    if (adminEmails.some((m) => m.email === newEmail)) {
      toast({ title: "Email already exists", variant: "destructive" });
      return;
    }
    // Creates a login-capable user with role: "admin" plus a directory row.
    try {
      const res = await post<Record<string, unknown>>("/api/team", {
        name: newEmail.split("@")[0],
        role: "Admin",
        email: newEmail,
        permissionRole: "admin",
      });
      if (res.error || !res.data) {
        toast({ title: "Error", description: res.error || "Failed to add admin", variant: "destructive" });
        return;
      }
      setAdminEmails([
        ...adminEmails,
        {
          id: Number(res.data.teamMemberId),
          name: (res.data.name as string) || newEmail,
          email: newEmail,
          canLogin: res.data.canLogin !== false,
        },
      ]);
      setNewEmail("");
      setIsAddEmailOpen(false);
      const defaultPassword =
        typeof res.data.defaultPassword === "string" ? res.data.defaultPassword : null;
      toast({
        title: "Admin user created",
        description: defaultPassword
          ? `They can log in with the password ${defaultPassword}, and change it in Settings.`
          : "This email already had an account. It now has admin access.",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unable to add admin",
        variant: "destructive",
      });
    }
  };

  const removeAdminEmail = async (member: AdminMember) => {
    // Count the ones who can actually get in. A list of five admins where four are switched
    // off is one admin, and removing that one locks everybody out.
    const usableAdmins = adminEmails.filter((m) => m.canLogin).length;
    if (member.canLogin && usableAdmins <= 1) {
      toast({ title: "This is the last admin who can log in", variant: "destructive" });
      return;
    }
    try {
      const res = await del(`/api/team/${member.id}`);
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
        return;
      }
      setAdminEmails(adminEmails.filter((m) => m.id !== member.id));
      toast({
        title: "Admin removed",
        description: `${member.name} was hidden from the website and can no longer log in.`,
      });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unable to remove admin",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" meta="Admin preferences" />

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

      {/* Admin Users */}
      <Panel
        title="Admin users"
        meta="Accounts with admin access. Turn a login on or off under Team."
        action={
          <Button variant="outline" size="sm" className="h-8" onClick={() => setIsAddEmailOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add admin
          </Button>
        }
      >
        <div className="divide-y divide-border">
          {adminEmails.length === 0 && (
            <div className="px-4 py-3 text-sm text-muted-foreground">No admin accounts yet.</div>
          )}
          {adminEmails.map((member) => (
            <div key={member.id} className="flex items-center justify-between gap-3 px-4 h-11">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm truncate">{member.email}</span>
                {!member.canLogin && (
                  <Badge variant="outline" className="shrink-0 text-destructive border-destructive/30">
                    No access
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 shrink-0"
                title="Remove admin. Hides them from the website and turns off their login."
                onClick={() => removeAdminEmail(member)}
              >
                <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </Panel>

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

      {/* Add Admin Email Dialog */}
      <Dialog open={isAddEmailOpen} onOpenChange={setIsAddEmailOpen}>
        <DialogContent className="bg-card border-border max-w-sm rounded-lg">
          <DialogHeader>
            <DialogTitle>Add Admin User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground block">Email address</label>
              <Input className="h-9" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                placeholder="admin@example.com" onKeyDown={(e) => e.key === "Enter" && addAdminEmail()} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddEmailOpen(false)}>Cancel</Button>
            <Button onClick={addAdminEmail}>
              <Plus className="h-4 w-4 mr-2" /> Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSettings;
