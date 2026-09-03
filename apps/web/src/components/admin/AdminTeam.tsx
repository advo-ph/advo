import { useState, useRef, useCallback } from "react";
import {
  Plus,
  Pencil,
  Save,
  X,
  Loader2,
  Camera,
  GripVertical,
  Eye,
  EyeOff,
  Users,
  KeyRound,
  Globe,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { upload } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAdminTeam, type TeamMember } from "@/hooks/useAdminTeam";
import { useRoles } from "@/hooks/useRoles";
import TeamMemberCard from "@/components/TeamMemberCard";
import ImageCropDialog from "@/components/ImageCropDialog";
import { PageHeader, Empty } from "./_ui";

const TEAM_ROLES = [
  "Founder",
  "Developer",
  "Junior Developer",
  "Project Manager",
  "Externals & Operations",
  "Marketing & Partnerships",
  "Legal & Contracts",
  "Designer",
  "Content Creator",
  "Videographer",
  "Photographer",
  "Accountant",
];

const AdminTeam = () => {
  const { isOwner } = useRoles();
  const { toast } = useToast();
  const {
    members,
    isLoading,
    createMember,
    updateMember,
    setLoginAccess,
    isSettingLoginAccess,
    reorderMembers,
    isSaving,
  } = useAdminTeam();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [localOrder, setLocalOrder] = useState<TeamMember[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewFileInputRef = useRef<HTMLInputElement>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropAspect, setCropAspect] = useState(1);
  const [cropTarget, setCropTarget] = useState<"avatar" | "preview">("avatar");

  const allMembers = localOrder || members;
  const displayMembers = showInactive ? allMembers : allMembers.filter((m) => m.is_active);
  const inactiveCount = allMembers.filter((m) => !m.is_active).length;

  // The login switch writes straight through, so the dialog has to read the live row rather
  // than the snapshot taken when it opened, or it shows the old state until it is reopened.
  const editingLive = editingMember
    ? allMembers.find((m) => m.team_member_id === editingMember.team_member_id) ?? editingMember
    : null;

  const [formData, setFormData] = useState({
    name: "",
    role: "",
    email: "",
    avatar_url: "",
    preview_image_url: "",
    bio: "",
    linkedin_url: "",
    github_url: "",
    is_active: true,
  });

  const handleDragStart = (idx: number) => setDraggedIdx(idx);

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) return;
    const fromId = displayMembers[draggedIdx]?.team_member_id;
    const toId = displayMembers[idx]?.team_member_id;
    if (fromId == null || toId == null) return;
    const next = [...allMembers];
    const fromAll = next.findIndex((m) => m.team_member_id === fromId);
    const toAll = next.findIndex((m) => m.team_member_id === toId);
    if (fromAll === -1 || toAll === -1) return;
    const [moved] = next.splice(fromAll, 1);
    next.splice(toAll, 0, moved);
    setLocalOrder(next);
    setDraggedIdx(idx);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    if (localOrder) {
      reorderMembers(localOrder);
      setLocalOrder(null); // hook will hold the new order via optimistic update
    }
  };

  const openCreateDialog = () => {
    setEditingMember(null);
    setFormData({
      name: "",
      role: "",
      email: "",
      avatar_url: "",
      preview_image_url: "",
      bio: "",
      linkedin_url: "",
      github_url: "",
      is_active: true,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (member: TeamMember) => {
    setEditingMember(member);
    setFormData({
      name: member.name,
      role: member.role,
      email: member.email || "",
      avatar_url: member.avatar_url || "",
      preview_image_url: member.preview_image_url || "",
      bio: member.bio || "",
      linkedin_url: member.linkedin_url || "",
      github_url: member.github_url || "",
      is_active: member.is_active,
    });
    setIsDialogOpen(true);
  };

  const openCropFromFile = (e: React.ChangeEvent<HTMLInputElement>, aspect: number, target: "avatar" | "preview") => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "Please select an image file", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "Image must be under 5MB", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(reader.result as string);
      setCropAspect(aspect);
      setCropTarget(target);
    };
    reader.readAsDataURL(file);
  };

  const handleCropped = useCallback(async (blob: Blob) => {
    setCropSrc(null);
    setIsUploading(true);
    try {
      const filename = cropTarget === "preview" ? "preview.jpg" : "avatar.jpg";
      const file = new File([blob], filename, { type: "image/jpeg" });
      const result = await upload(file, "avatars");
      if (result.error) {
        toast({ title: "Upload failed", description: result.error, variant: "destructive" });
        return;
      }
      const field = cropTarget === "preview" ? "preview_image_url" : "avatar_url";
      setFormData((prev) => ({ ...prev, [field]: result.url }));
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unable to upload photo",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [toast, cropTarget]);

  const handleSave = async () => {
    if (!formData.name || !formData.role) {
      toast({ title: "Error", description: "Name and role are required", variant: "destructive" });
      return;
    }

    const input = {
      name: formData.name,
      role: formData.role,
      email: formData.email || null,
      avatar_url: formData.avatar_url || null,
      preview_image_url: formData.preview_image_url || null,
      bio: formData.bio || null,
      linkedin_url: formData.linkedin_url || null,
      github_url: formData.github_url || null,
      is_active: formData.is_active,
    };

    setIsDialogOpen(false);
    try {
      if (editingMember) {
        await updateMember(editingMember.team_member_id, input);
      } else {
        await createMember(input);
      }
    } catch {
      // Hook surfaces the toast
    }
  };

  const handleToggleLogin = async (member: TeamMember) => {
    if (member.can_login === null) return;
    try {
      await setLoginAccess(member.team_member_id, !member.can_login);
    } catch {
      // Hook surfaces the toast
    }
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Team"
        meta="Drag to reorder"
        action={
          <div className="flex items-center gap-2">
            {inactiveCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowInactive(!showInactive)}
                className="h-9 gap-1.5"
              >
                {showInactive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {inactiveCount} hidden
              </Button>
            )}
            <Button
              size="sm"
              onClick={openCreateDialog}
              className="h-9 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Add member
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : displayMembers.length === 0 ? (
        <div className="border border-border rounded-lg bg-card">
          <Empty text="No team members yet" icon={Users} />
        </div>
      ) : (
        <div className="border border-border rounded-lg bg-card overflow-hidden">
          {/* Header row */}
          <div className="flex items-center gap-3 px-3 h-9 border-b border-border text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            <span className="w-4 shrink-0" />
            <span className="flex-1 min-w-0">Member</span>
            <span className="hidden lg:block flex-1 min-w-0">Bio</span>
            <span className="w-4 shrink-0" />
          </div>

          {/* Rows */}
          <div className="divide-y divide-border">
            {displayMembers.map((member, index) => (
              <div
                key={member.team_member_id}
                onDragOver={(e) => handleDragOver(e, index)}
                onClick={() => openEditDialog(member)}
                className={`flex items-center gap-3 px-3 h-[72px] text-sm hover:bg-secondary/40 transition-colors cursor-pointer ${
                  draggedIdx === index ? "opacity-50" : ""
                }`}
              >
                <div
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragEnd={handleDragEnd}
                  onClick={(e) => e.stopPropagation()}
                  className="cursor-grab active:cursor-grabbing shrink-0"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                </div>

                <div className="flex-1 min-w-0 flex items-center gap-2.5">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={member.avatar_url || undefined} />
                    <AvatarFallback className="bg-secondary text-foreground text-xs font-medium">
                      {getInitials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{member.name}</span>
                      {!member.is_active && (
                        <span
                          className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0"
                          title="Not shown on the public website"
                        >
                          Hidden
                        </span>
                      )}
                      {member.can_login === false && (
                        <span
                          className="flex items-center gap-1 text-[10px] text-destructive border border-destructive/30 rounded px-1.5 py-0.5 shrink-0"
                          title="This person cannot log in"
                        >
                          <Ban className="h-2.5 w-2.5" />
                          No access
                        </span>
                      )}
                      {member.can_login === null && (
                        <span
                          className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0"
                          title="No login account exists for this person yet"
                        >
                          No account
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{member.role}</span>
                      {member.email && (
                        <span className="hidden sm:inline truncate">· {member.email}</span>
                      )}
                    </div>
                  </div>
                </div>

                <span className="hidden lg:block flex-1 min-w-0 text-xs text-muted-foreground truncate">
                  {member.bio || "—"}
                </span>

                <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border-border max-w-4xl rounded-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
          <div className="flex gap-6">
          <div
            className="hidden md:flex w-1/2 shrink-0 py-4 cursor-pointer"
            onClick={() => previewFileInputRef.current?.click()}
          >
            <TeamMemberCard
              name={formData.name || "Name"}
              role={formData.role || "Role"}
              avatar_url={formData.avatar_url || null}
              preview_image_url={formData.preview_image_url || null}
              className="w-full aspect-auto h-full"
            />
            <input ref={previewFileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => openCropFromFile(e, 3 / 4, "preview")} />
          </div>
          <div className="w-full md:w-1/2 min-w-0 grid gap-4 py-4 content-start">
            <div className="flex items-center gap-4">
              <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <Avatar className="h-16 w-16">
                  <AvatarImage src={formData.avatar_url || undefined} />
                  <AvatarFallback className="bg-secondary text-foreground text-lg font-medium">
                    {formData.name ? getInitials(formData.name) : "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {isUploading ? <Loader2 className="h-5 w-5 text-white animate-spin" /> : <Camera className="h-5 w-5 text-white" />}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => openCropFromFile(e, 1, "avatar")} />
              </div>
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Profile picture</p>
                <p className="text-xs">Click to upload (max 5MB)</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Full name" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Role</label>
                <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAM_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="email@example.com" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Bio</label>
              <Textarea value={formData.bio} onChange={(e) => setFormData({ ...formData, bio: e.target.value })} placeholder="Short bio or description" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">LinkedIn URL</label>
                <Input value={formData.linkedin_url} onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/..." />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">GitHub URL</label>
                <Input value={formData.github_url} onChange={(e) => setFormData({ ...formData, github_url: e.target.value })} placeholder="https://github.com/..." />
              </div>
            </div>

            {isOwner && (
            <>
            <div className="flex items-center justify-between pt-3 border-t border-border">
              <div className="pr-4">
                <p className="text-sm font-medium">Show on website</p>
                <p className="text-xs text-muted-foreground">
                  Puts this person on the public team page. Does not affect logging in.
                </p>
              </div>
              <Button
                type="button"
                variant={formData.is_active ? "default" : "outline"}
                size="sm"
                onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                className="gap-1.5 shrink-0"
                data-testid="toggle-show-on-website"
              >
                {formData.is_active ? (
                  <><Globe className="h-3.5 w-3.5" /> Shown</>
                ) : (
                  <><EyeOff className="h-3.5 w-3.5" /> Hidden</>
                )}
              </Button>
            </div>

            {editingLive && (
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <div className="pr-4">
                  <p className="text-sm font-medium">Can log in</p>
                  <p className="text-xs text-muted-foreground">
                    {editingLive.can_login === null
                      ? "No login account yet. Add an email address and save to create one."
                      : editingLive.can_login
                      ? "Turning this off signs them out everywhere, right away."
                      : "This person cannot sign in. Saved logins on their devices were removed."}
                  </p>
                </div>
                <Button
                  type="button"
                  variant={editingLive.can_login ? "default" : "outline"}
                  size="sm"
                  disabled={editingLive.can_login === null || isSettingLoginAccess}
                  onClick={() => handleToggleLogin(editingLive)}
                  className="gap-1.5 shrink-0"
                  data-testid="toggle-can-log-in"
                >
                  {isSettingLoginAccess ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <KeyRound className="h-3.5 w-3.5" />
                  )}
                  {editingLive.can_login === null
                    ? "No account"
                    : editingLive.can_login
                    ? "Allowed"
                    : "Blocked"}
                </Button>
              </div>
            )}
            </>
            )}
          </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              <X className="h-4 w-4 mr-2" /> Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageCropDialog
        open={!!cropSrc}
        imageSrc={cropSrc}
        aspect={cropAspect}
        onClose={() => setCropSrc(null)}
        onCropped={handleCropped}
      />
    </div>
  );
};

export default AdminTeam;
