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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import * as db from "@/lib/db";
import { get, patch as apiPatch, post, del } from "@/lib/api";
import { PageHeader, Panel, Dot } from "@/components/admin/_ui";

interface SiteConfig {
  agency_name: string;
  domain_url: string;
  accent_color: string;
  logo_url: string;
}

interface SocialLink {
  platform: string;
  url: string;
}

interface AdminMember {
  id: number;
  email: string;
}

const DEFAULT_CONFIG: SiteConfig = {
  agency_name: "ADVO",
  domain_url: "advo.ph",
  accent_color: "#22C55E",
  logo_url: "/advo-logo-black.png",
};

const AdminSettings = () => {
  const { toast } = useToast();
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_CONFIG);
  const [adminEmails, setAdminEmails] = useState<AdminMember[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
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
    if (res.data) {
      // Admin list includes inactive members; only show active ones with an email
      // and retain the team_member_id so deletes can target the row.
      setAdminEmails(
        res.data
          .filter((m) => m.isActive !== false && !!m.email)
          .map((m) => ({ id: Number(m.teamMemberId), email: m.email as string }))
      );
    }
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

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const results = await Promise.all([
        apiPatch("/api/settings/agency_name", { value: config.agency_name }),
        apiPatch("/api/settings/domain_url", { value: config.domain_url }),
        apiPatch("/api/settings/accent_color", { value: config.accent_color }),
        apiPatch("/api/settings/logo_url", { value: config.logo_url }),
      ]);
      const failed = results.find((r) => r.error);
      if (failed) {
        toast({ title: "Error", description: failed.error, variant: "destructive" });
      } else {
        toast({ title: "Settings saved", description: "Domain configuration updated" });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unable to save settings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
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
    // team_member requires name + role (NOT NULL); derive a sensible default.
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
        { id: Number(res.data.teamMemberId), email: newEmail },
      ]);
      setNewEmail("");
      setIsAddEmailOpen(false);
      toast({ title: "Admin email added" });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unable to add admin",
        variant: "destructive",
      });
    }
  };

  const removeAdminEmail = async (member: AdminMember) => {
    if (adminEmails.length <= 1) {
      toast({ title: "Cannot remove last admin", variant: "destructive" });
      return;
    }
    try {
      const res = await del(`/api/team/${member.id}`);
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
        return;
      }
      setAdminEmails(adminEmails.filter((m) => m.id !== member.id));
      toast({ title: "Admin email removed" });
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
      <PageHeader title="Settings" meta="Domain configuration and admin preferences" />

      {/* Domain & Branding */}
      <Panel
        title="Domain & branding"
        action={
          <Button onClick={handleSave} disabled={isSaving} size="sm" className="h-8">
            {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Save
          </Button>
        }
      >
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="eyebrow block">Agency name</label>
            <Input className="h-9" value={config.agency_name} onChange={(e) => setConfig({ ...config, agency_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="eyebrow block">Domain URL</label>
            <Input className="h-9" value={config.domain_url} onChange={(e) => setConfig({ ...config, domain_url: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="eyebrow block">Accent color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={config.accent_color} onChange={(e) => setConfig({ ...config, accent_color: e.target.value })}
                className="w-9 h-9 rounded-md border border-border cursor-pointer shrink-0" />
              <Input className="h-9 tabular-nums" value={config.accent_color} onChange={(e) => setConfig({ ...config, accent_color: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="eyebrow block">Logo URL</label>
            <Input className="h-9" value={config.logo_url} onChange={(e) => setConfig({ ...config, logo_url: e.target.value })} />
          </div>
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
        meta="Manage who has admin access"
        action={
          <Button variant="outline" size="sm" className="h-8" onClick={() => setIsAddEmailOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add admin
          </Button>
        }
      >
        <div className="divide-y divide-border">
          {adminEmails.map((member) => (
            <div key={member.id} className="flex items-center justify-between gap-3 px-4 h-11">
              <span className="text-sm truncate">{member.email}</span>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => removeAdminEmail(member)}>
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
            <Badge variant="outline" className={`gap-1 shrink-0 ${apiStatus === "connected" ? "text-green-500 border-green-500/30" : apiStatus === "checking" ? "text-yellow-500 border-yellow-500/30" : "text-red-500 border-red-500/30"}`}>
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
            <Badge variant="outline" className="text-green-500 border-green-500/30 gap-1 shrink-0">
              <Check className="h-3 w-3" /> Connected
            </Badge>
          </div>
        </div>
      </Panel>

      {/* Password Change Dialog */}
      <Dialog open={isPasswordOpen} onOpenChange={setIsPasswordOpen}>
        <DialogContent className="bg-card border-border max-w-sm rounded-lg">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <label className="eyebrow block">Current password</label>
              <Input className="h-9" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="eyebrow block">New password</label>
              <Input className="h-9" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" />
            </div>
            <div className="space-y-1.5">
              <label className="eyebrow block">Confirm new password</label>
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
              <label className="eyebrow block">Email address</label>
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
