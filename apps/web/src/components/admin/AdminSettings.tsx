import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Globe,
  Palette,
  Shield,
  Plus,
  Save,
  X,
  Loader2,
  Check,
  Database,
  Link as LinkIcon,
  Lock,
  Share2,
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
import { get, patch as apiPatch, post } from "@/lib/api";

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

const DEFAULT_CONFIG: SiteConfig = {
  agency_name: "ADVO",
  domain_url: "advo.ph",
  accent_color: "#22C55E",
  logo_url: "/advo-logo-black.png",
};

const AdminSettings = () => {
  const { toast } = useToast();
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_CONFIG);
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
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
    const res = await get<Array<{ email: string }>>("/api/team");
    if (res.data) {
      setAdminEmails(res.data.map((m: Record<string, unknown>) => (m.email as string) || ""));
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
    await apiPatch("/api/settings/agency_name", { value: config.agency_name });
    await apiPatch("/api/settings/domain_url", { value: config.domain_url });
    await apiPatch("/api/settings/accent_color", { value: config.accent_color });
    toast({ title: "Settings saved", description: "Domain configuration updated" });
    setIsSaving(false);
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
    setIsChangingPassword(false);
  };

  const handleSaveSocial = async () => {
    setIsSavingSocial(true);
    await apiPatch("/api/settings/social_links", { value: socialLinks });
    toast({ title: "Social links saved" });
    setIsSavingSocial(false);
  };

  const addSocialLink = () => setSocialLinks([...socialLinks, { platform: "", url: "" }]);

  const updateSocialLink = (idx: number, field: keyof SocialLink, val: string) => {
    setSocialLinks(socialLinks.map((l, i) => (i === idx ? { ...l, [field]: val } : l)));
  };

  const removeSocialLink = (idx: number) => setSocialLinks(socialLinks.filter((_, i) => i !== idx));

  const addAdminEmail = () => {
    if (!newEmail || !newEmail.includes("@")) {
      toast({ title: "Invalid email", variant: "destructive" });
      return;
    }
    if (adminEmails.includes(newEmail)) {
      toast({ title: "Email already exists", variant: "destructive" });
      return;
    }
    setAdminEmails([...adminEmails, newEmail]);
    setNewEmail("");
    setIsAddEmailOpen(false);
    toast({ title: "Admin email added" });
  };

  const removeAdminEmail = (email: string) => {
    if (adminEmails.length <= 1) {
      toast({ title: "Cannot remove last admin", variant: "destructive" });
      return;
    }
    setAdminEmails(adminEmails.filter(e => e !== email));
    toast({ title: "Admin email removed" });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">Domain configuration and admin preferences</p>
      </div>

      {/* Domain & Branding */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="p-6 bg-card border border-border rounded-xl shadow-card space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Globe className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold">Domain & Branding</h3>
            <p className="text-sm text-muted-foreground">Configure your agency identity</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Agency Name</label>
            <Input value={config.agency_name} onChange={(e) => setConfig({ ...config, agency_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Domain URL</label>
            <div className="relative">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={config.domain_url} onChange={(e) => setConfig({ ...config, domain_url: e.target.value })} className="pl-9" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Accent Color</label>
            <div className="flex items-center gap-3">
              <input type="color" value={config.accent_color} onChange={(e) => setConfig({ ...config, accent_color: e.target.value })}
                className="w-10 h-10 rounded-lg border border-border cursor-pointer" />
              <Input value={config.accent_color} onChange={(e) => setConfig({ ...config, accent_color: e.target.value })} className="font-mono" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Logo URL</label>
            <Input value={config.logo_url} onChange={(e) => setConfig({ ...config, logo_url: e.target.value })} />
          </div>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="rounded-full">
          {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </motion.div>

      {/* Social Links */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}
        className="p-6 bg-card border border-border rounded-xl shadow-card space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <Share2 className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <h3 className="font-semibold">Social Links</h3>
              <p className="text-sm text-muted-foreground">Displayed in the footer</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="rounded-full" onClick={addSocialLink}>
            <Plus className="h-4 w-4 mr-2" /> Add Link
          </Button>
        </div>
        <div className="space-y-3">
          {socialLinks.map((link, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <Input placeholder="Platform (e.g. facebook)" value={link.platform}
                onChange={(e) => updateSocialLink(idx, "platform", e.target.value)} className="max-w-[160px]" />
              <Input placeholder="https://..." value={link.url}
                onChange={(e) => updateSocialLink(idx, "url", e.target.value)} className="flex-1" />
              <Button variant="ghost" size="sm" onClick={() => removeSocialLink(idx)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {socialLinks.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">No social links configured</p>
          )}
        </div>
        {socialLinks.length > 0 && (
          <Button onClick={handleSaveSocial} disabled={isSavingSocial} className="rounded-full" size="sm">
            {isSavingSocial ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Social Links
          </Button>
        )}
      </motion.div>

      {/* Security */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="p-6 bg-card border border-border rounded-xl shadow-card space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <Lock className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <h3 className="font-semibold">Security</h3>
              <p className="text-sm text-muted-foreground">Account password</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setIsPasswordOpen(true)}>
            <Lock className="h-4 w-4 mr-2" /> Change Password
          </Button>
        </div>
      </motion.div>

      {/* Admin Users */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}
        className="p-6 bg-card border border-border rounded-xl shadow-card space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h3 className="font-semibold">Admin Users</h3>
              <p className="text-sm text-muted-foreground">Manage who has admin access</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setIsAddEmailOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Admin
          </Button>
        </div>
        <div className="space-y-2">
          {adminEmails.map((email) => (
            <div key={email} className="flex items-center justify-between p-3 bg-secondary/30 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                  <Shield className="h-4 w-4 text-accent" />
                </div>
                <span className="text-sm font-mono">{email}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeAdminEmail(email)} className="text-muted-foreground hover:text-destructive">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Integrations */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="p-6 bg-card border border-border rounded-xl shadow-card space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <Database className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <h3 className="font-semibold">Integrations</h3>
            <p className="text-sm text-muted-foreground">Connection status for services</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">API</p>
                <p className="text-xs text-muted-foreground font-mono">{import.meta.env.VITE_API_URL || "Not configured"}</p>
              </div>
            </div>
            <Badge variant="outline" className={`gap-1 ${apiStatus === "connected" ? "text-green-500 border-green-500/30" : apiStatus === "checking" ? "text-yellow-500 border-yellow-500/30" : "text-red-500 border-red-500/30"}`}>
              {apiStatus === "connected" && <Check className="h-3 w-3" />}
              {apiStatus === "checking" && <Loader2 className="h-3 w-3 animate-spin" />}
              {apiStatus === "connected" ? "Connected" : apiStatus === "checking" ? "Checking..." : "Disconnected"}
            </Badge>
          </div>
          <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl">
            <div className="flex items-center gap-3">
              <Palette className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Vercel</p>
                <p className="text-xs text-muted-foreground">Deployment platform</p>
              </div>
            </div>
            <Badge variant="outline" className="text-green-500 border-green-500/30 gap-1">
              <Check className="h-3 w-3" /> Connected
            </Badge>
          </div>
        </div>
      </motion.div>

      {/* Password Change Dialog */}
      <Dialog open={isPasswordOpen} onOpenChange={setIsPasswordOpen}>
        <DialogContent className="bg-card border-border max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Password</label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">New Password</label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Confirm New Password</label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePasswordChange()} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPasswordOpen(false)}>Cancel</Button>
            <Button onClick={handlePasswordChange} disabled={isChangingPassword}>
              {isChangingPassword ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}
              Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Admin Email Dialog */}
      <Dialog open={isAddEmailOpen} onOpenChange={setIsAddEmailOpen}>
        <DialogContent className="bg-card border-border max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle>Add Admin User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email Address</label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
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
