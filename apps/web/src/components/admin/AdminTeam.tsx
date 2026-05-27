import { useState, useRef } from "react";
import { motion } from "framer-motion";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

  const [formData, setFormData] = useState({
    name: "",
    role: "",
    email: "",
    avatar_url: "",
    bio: "",
    linkedin_url: "",
    github_url: "",
    is_active: true,
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
    setFormData({ name: "", role: "", email: "", avatar_url: "", bio: "", linkedin_url: "", github_url: "", is_active: true });
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
    const result = await upload(file, "avatars");
    if (result.error) {
      toast({ title: "Upload failed", description: result.error, variant: "destructive" });
      setIsUploading(false);
      return;
    }
    setFormData({ ...formData, avatar_url: result.url });
    setIsUploading(false);
    toast({ title: "Uploaded", description: "Photo uploaded successfully" });
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-2">Team</h1>
          <p className="text-muted-foreground">Manage team members — drag to reorder</p>
        </div>
        <div className="flex items-center gap-2">
          {inactiveCount > 0 && (
            <Button
              variant={showInactive ? "default" : "outline"}
              size="sm"
              onClick={() => setShowInactive(!showInactive)}
              className="gap-1.5"
            >
              {showInactive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {inactiveCount} inactive
            </Button>
          )}
          <Button onClick={openCreateDialog} className="rounded-full bg-foreground text-background hover:bg-foreground/90">
            <Plus className="h-4 w-4 mr-2" />
            Add Member
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {displayMembers.map((member, index) => (
            <motion.div
              key={member.team_member_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`flex items-center justify-between p-4 bg-card border border-border rounded-xl shadow-card hover:border-accent/30 transition-colors cursor-grab active:cursor-grabbing ${
                draggedIdx === index ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-center gap-4">
                <GripVertical className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
                <Avatar className="h-10 w-10">
                  <AvatarImage src={member.avatar_url || undefined} />
                  <AvatarFallback className="bg-accent/10 text-accent text-sm font-bold">
                    {getInitials(member.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{member.name}</p>
                    <Badge variant="outline" className="text-[10px] font-mono">{member.role}</Badge>
                    {!member.is_active && (
                      <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                    )}
                  </div>
                  {member.bio && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 max-w-md">{member.bio}</p>
                  )}
                  <div className="flex items-center gap-3 mt-0.5">
                    {member.email && <span className="text-xs text-muted-foreground">{member.email}</span>}
                    {member.linkedin_url && (
                      <a href={member.linkedin_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-500 hover:underline">
                        <Linkedin className="h-3 w-3" /> LinkedIn
                      </a>
                    )}
                    {member.github_url && (
                      <a href={member.github_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
                        <Github className="h-3 w-3" /> GitHub
                      </a>
                    )}
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => openEditDialog(member)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg rounded-xl">
          <DialogHeader>
            <DialogTitle>{editingMember ? "Edit Team Member" : "Add Team Member"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex items-center gap-4">
              <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <Avatar className="h-16 w-16">
                  <AvatarImage src={formData.avatar_url || undefined} />
                  <AvatarFallback className="bg-accent/10 text-accent text-lg font-bold">
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
