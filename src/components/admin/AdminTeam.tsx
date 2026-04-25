import { useState, useEffect, useRef } from "react";
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
import { get, post, patch, upload } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface TeamMember {
  team_member_id: number;
  name: string;
  role: string;
  email: string | null;
  avatar_url: string | null;
  bio: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  is_active: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMember(m: any): TeamMember {
  return {
    team_member_id: m.teamMemberId ?? m.team_member_id,
    name: m.name,
    role: m.role,
    email: m.email,
    avatar_url: m.avatarUrl ?? m.avatar_url,
    bio: m.bio,
    linkedin_url: m.linkedinUrl ?? m.linkedin_url,
    github_url: m.githubUrl ?? m.github_url,
    is_active: m.isActive ?? m.is_active ?? true,
  };
}

const AdminTeam = () => {
  const { toast } = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: "",
    role: "",
    email: "",
    avatar_url: "",
    bio: "",
    linkedin_url: "",
    github_url: "",
  });

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    setIsLoading(true);
    const [teamRes, orderRes] = await Promise.all([
      get<unknown[]>("/api/team"),
      get<{ value: unknown }>("/api/settings/team_order"),
    ]);
    const mapped = (teamRes.data || []).map(mapMember);
    // Apply custom order if exists
    if (orderRes.data?.value) {
      const order = (typeof orderRes.data.value === "string"
        ? JSON.parse(orderRes.data.value)
        : orderRes.data.value) as number[];
      mapped.sort((a, b) => {
        const ai = order.indexOf(a.team_member_id);
        const bi = order.indexOf(b.team_member_id);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
    }
    setMembers(mapped);
    setIsLoading(false);
  };

  const handleDragStart = (idx: number) => setDraggedIdx(idx);

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) return;
    const next = [...members];
    const [moved] = next.splice(draggedIdx, 1);
    next.splice(idx, 0, moved);
    setMembers(next);
    setDraggedIdx(idx);
  };

  const handleDragEnd = async () => {
    setDraggedIdx(null);
    const order = members.map((m) => m.team_member_id);
    const res = await post("/api/team/reorder", { order });
    if (res.error) {
      toast({ title: "Error", description: "Failed to save order", variant: "destructive" });
      fetchMembers();
    } else {
      toast({ title: "Order saved" });
    }
  };

  const openCreateDialog = () => {
    setEditingMember(null);
    setFormData({ name: "", role: "", email: "", avatar_url: "", bio: "", linkedin_url: "", github_url: "" });
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

    setIsSaving(true);
    const payload = {
      name: formData.name,
      role: formData.role,
      email: formData.email || null,
      avatarUrl: formData.avatar_url || null,
      bio: formData.bio || null,
      linkedinUrl: formData.linkedin_url || null,
      githubUrl: formData.github_url || null,
    };

    if (editingMember) {
      const res = await patch(`/api/team/${editingMember.team_member_id}`, payload);
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
      } else {
        toast({ title: "Updated", description: `${formData.name} updated` });
        setIsDialogOpen(false);
        fetchMembers();
      }
    } else {
      const res = await post("/api/team", payload);
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
      } else {
        toast({ title: "Created", description: `${formData.name} added to team` });
        setIsDialogOpen(false);
        fetchMembers();
      }
    }
    setIsSaving(false);
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
        <Button onClick={openCreateDialog} className="rounded-full bg-foreground text-background hover:bg-foreground/90">
          <Plus className="h-4 w-4 mr-2" />
          Add Member
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((member, index) => (
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
