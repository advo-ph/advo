import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { post } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

/**
 * Account controls for whoever is signed in.
 *
 * This exists because changing your own password was admin-only. The form lived inside
 * AdminSettings, which sits behind /admin and requireAdmin, so a team or client account had
 * no way to change its password anywhere in the product. Everyone ships with the same
 * default, which made that a real gap rather than a cosmetic one.
 *
 * It is mounted globally by AuthProvider instead of being placed on a page, because the two
 * roles that needed it do not share a screen with the one that already had it.
 *
 * Props are structural rather than pulled from useAuth so this component does not import the
 * provider that renders it.
 */
interface AccountPanelProps {
  user?: { displayName: string; email: string; role: string };
}

const AccountPanel = ({ user }: AccountPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const initials = (user?.displayName || user?.email || "?")
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({ variant: "destructive", title: "The new passwords do not match." });
      return;
    }
    if (newPassword.length < 8) {
      toast({ variant: "destructive", title: "Use at least 8 characters." });
      return;
    }

    setIsSaving(true);
    const res = await post("/api/auth/change-password", { currentPassword, newPassword });
    setIsSaving(false);

    if (res.error) {
      toast({ variant: "destructive", title: "Error", description: res.error });
      return;
    }

    toast({ title: "Password changed." });
    reset();
    setIsOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Account settings"
        title="Account settings"
        className="fixed bottom-4 right-4 z-[55] h-9 w-9 rounded-full border border-border bg-card/90 backdrop-blur text-xs font-medium text-muted-foreground shadow-card transition-colors hover:bg-secondary hover:text-foreground"
      >
        {initials || "?"}
      </button>

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) reset();
        }}
      >
        <DialogContent className="max-w-sm bg-card border-border rounded-lg">
          <DialogHeader>
            <DialogTitle>Account</DialogTitle>
          </DialogHeader>

          <div className="space-y-1 pb-2">
            <p className="text-sm font-medium">{user?.displayName}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
            <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4 border-t border-border pt-4">
            <p className="text-sm">Change password</p>

            <div className="space-y-2">
              <Label htmlFor="account-current-password" className="text-sm">
                Current password
              </Label>
              <Input
                id="account-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="bg-background"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-new-password" className="text-sm">
                New password
              </Label>
              <Input
                id="account-new-password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="bg-background"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-confirm-password" className="text-sm">
                Confirm new password
              </Label>
              <Input
                id="account-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="bg-background"
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isSaving} className="w-full">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Change password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AccountPanel;
