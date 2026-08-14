import { useState, useRef } from "react";
import {
  Plus,
  Pencil,
  Save,
  X,
  Loader2,
  Linkedin,
  Camera,
  Github,
  GripVertical,
  Eye,
  EyeOff,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { upload } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAdminTeam, type TeamMember } from "@/hooks/useAdminTeam";
import { PageHeader, StatStrip, Stat, Empty } from "./_ui";

const AdminTeam = () => {
  const { toast } = useToast();
  const {
    members,
    isLoading,
    createMember,
    updateMember,
    reorderMembers,
    isSaving,
  } = useAdminTeam();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [localOrder, setLocalOrder] = useState<TeamMember[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showInactive, setShowInactive] = useState(false);

  const allMembers = localOrder || members;
  const displayMembers = showInactive ? allMembers : allMembers.filter((m) => m.is_active);
  const inactiveCount = allMembers.filter((m) => !m.is_active).length;
  const activeCount = allMembers.filter((m) => m.is_active).length;

  const [formData, setFormData] = useState({
    name: "",
    role: "",
    email: "",
    avatar_url: "",
    bio: "",
    linkedin_url: "",
    github_url: "",
    is_active: true,
    penalty_point_count: 0,
  });

  const handleDragStart = (idx: number) => setDraggedIdx(idx);

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) return;
    const next = [...displayMembers];
    const [moved] = next.splice(draggedIdx, 1);
    next.splice(idx, 0, moved);
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
      bio: "",
      linkedin_url: "",
      github_url: "",
      is_active: true,
      penalty_point_count: 0,
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
      bio: member.bio || "",
      linkedin_url: member.linkedin_url || "",
      github_url: member.github_url || "",
      is_active: member.is_active,
      penalty_point_count: member.penalty_point_count ?? 0,
    });
    setIsDialogOpen(true);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "Please select an image file", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "Image must be under 5MB", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const result = await upload(file, "avatars");
      if (result.error) {
        toast({ title: "Upload failed", description: result.error, variant: "destructive" });
        return;
      }
      setFormData({ ...formData, avatar_url: result.url });
      toast({ title: "Uploaded", description: "Photo uploaded successfully" });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unable to upload photo",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

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
      bio: formData.bio || null,
      linkedin_url: formData.linkedin_url || null,
      github_url: formData.github_url || null,
      is_active: formData.is_active,
      ...(editingMember && {
        penalty_point_count: Math.max(0, Math.floor(Number(formData.penalty_point_count) || 0)),
      }),
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
                {inactiveCount} inactive
              </Button>
            )}
            <Button
              size="sm"
              onClick={openCreateDialog}
              className="h-9 gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Plus className="h-4 w-4" />
              Add member
            </Button>
          </div>
        }
      />

      <StatStrip cols={3}>
        <Stat label="Members" value={String(allMembers.length)} />
        <Stat label="Active" value={String(activeCount)} accent />
        <Stat label="Inactive" value={String(inactiveCount)} />
      </StatStrip>

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
          <div className="flex items-center gap-3 px-3 h-9 border-b border-border text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
            <span className="w-4 shrink-0" />
            <span className="flex-1 min-w-0">Member</span>
            <span className="hidden lg:block flex-1 min-w-0">Bio</span>
            <span className="hidden sm:block w-16 shrink-0 text-right">Pts</span>
            <span className="hidden md:block w-44 shrink-0">Links</span>
            <span className="w-4 shrink-0" />
          </div>

          {/* Rows */}
          <div className="divide-y divide-border">
            {displayMembers.map((member, index) => (
              <div
                key={member.team_member_id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 px-3 h-14 text-sm hover:bg-secondary/40 transition-colors cursor-grab active:cursor-grabbing ${
                  draggedIdx === index ? "opacity-50" : ""
                }`}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />

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
                        <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">
                          Inactive
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

                <span
                  className={`hidden sm:block w-16 shrink-0 text-right tabular-nums text-xs font-medium ${
                    member.penalty_point_count > 0 ? "text-destructive" : "text-muted-foreground"
                  }`}
                  title="Penalty points (manual; auto-accrual deferred)"
                >
                  {member.penalty_point_count}
                </span>

                <div className="hidden md:flex w-44 shrink-0 items-center gap-3 text-xs">
                  {member.linkedin_url ? (
                    <a
                      href={member.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Linkedin className="h-3 w-3" /> LinkedIn
                    </a>
                  ) : null}
                  {member.github_url ? (
                    <a
                      href={member.github_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Github className="h-3 w-3" /> GitHub
                    </a>
                  ) : null}
                  {!member.linkedin_url && !member.github_url && (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </div>

                <button
                  onClick={() => openEditDialog(member)}
                  className="w-4 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Edit member"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg rounded-lg">
          <DialogHeader>
            <DialogTitle>{editingMember ? "Edit Team Member" : "Add Team Member"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
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
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
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
                <Input value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} placeholder="e.g. Developer" />
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

            {editingMember && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Penalty points</label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={formData.penalty_point_count}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      penalty_point_count: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Manual tally only. Automatic accrual is deferred (rules open).
                </p>
              </div>
            )}

            {/* Active / Inactive toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div>
                <p className="text-sm font-medium">Status</p>
                <p className="text-xs text-muted-foreground">
                  Inactive members are hidden from all admin views
                </p>
              </div>
              <Button
                type="button"
                variant={formData.is_active ? "default" : "outline"}
                size="sm"
                onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                className="gap-1.5"
              >
                {formData.is_active ? (
                  <><Eye className="h-3.5 w-3.5" /> Active</>
                ) : (
                  <><EyeOff className="h-3.5 w-3.5" /> Inactive</>
                )}
              </Button>
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
    </div>
  );
};

export default AdminTeam;
