import { useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  GitBranch,
  ExternalLink,
  Loader2,
  MessageSquarePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import * as db from "@/lib/db";
import { useToast } from "@/hooks/use-toast";
import type { Project, Client, ProjectStatus } from "@/types/admin";
import { STATUS_OPTIONS, formatCurrency } from "@/types/admin";

interface AdminProjectsProps {
  projects: Project[];
  clients: Client[];
  isLoading: boolean;
  onRefresh: () => Promise<void>;
}

const AdminProjects = ({ projects, clients, isLoading, onRefresh }: AdminProjectsProps) => {
  const { toast } = useToast();

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [updatingProject, setUpdatingProject] = useState<Project | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    client_id: "",
    title: "",
    description: "",
    repository_name: "",
    preview_url: "",
    project_status: "discovery" as ProjectStatus,
    total_value_cents: 0,
    amount_paid_cents: 0,
    tech_stack: "",
  });

  const [updateFormData, setUpdateFormData] = useState({
    update_title: "",
    update_body: "",
    commit_sha_reference: "",
  });

  const openCreateDialog = () => {
    setEditingProject(null);
    setFormData({
      client_id: "",
      title: "",
      description: "",
      repository_name: "",
      preview_url: "",
      project_status: "discovery",
      total_value_cents: 0,
      amount_paid_cents: 0,
      tech_stack: "",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (project: Project) => {
    setEditingProject(project);
    setFormData({
      client_id: project.client_id.toString(),
      title: project.title,
      description: project.description || "",
      repository_name: project.repository_name || "",
      preview_url: project.preview_url || "",
      project_status: project.project_status,
      total_value_cents: project.total_value_cents,
      amount_paid_cents: project.amount_paid_cents,
      tech_stack: project.tech_stack.join(", "),
    });
    setIsDialogOpen(true);
  };

  const openUpdateDialog = (project: Project) => {
    setUpdatingProject(project);
    setUpdateFormData({
      update_title: "",
      update_body: "",
      commit_sha_reference: "",
    });
    setIsUpdateDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.client_id || !formData.title) {
      toast({ title: "Error", description: "Client and title are required", variant: "destructive" });
      return;
    }

    setIsSaving(true);

    const projectData = {
      client_id: parseInt(formData.client_id),
      title: formData.title,
      description: formData.description || null,
      repository_name: formData.repository_name || null,
      preview_url: formData.preview_url || null,
      project_status: formData.project_status,
      total_value_cents: formData.total_value_cents,
      amount_paid_cents: formData.amount_paid_cents,
      tech_stack: formData.tech_stack.split(",").map(s => s.trim()).filter(Boolean),
    };

    if (editingProject) {
      const { error } = await db.updateProject(editingProject.project_id, projectData);
      if (error) {
        toast({ title: "Error", description: error, variant: "destructive" });
      } else {
        toast({ title: "Success", description: "Project updated" });
        setIsDialogOpen(false);
        onRefresh();
      }
    } else {
      const { error } = await db.createProject(projectData);
      if (error) {
        toast({ title: "Error", description: error, variant: "destructive" });
      } else {
        toast({ title: "Success", description: "Project created" });
        setIsDialogOpen(false);
        onRefresh();
      }
    }

    setIsSaving(false);
  };

  const handlePostUpdate = async () => {
    if (!updatingProject || !updateFormData.update_title) {
      toast({ title: "Error", description: "Title is required", variant: "destructive" });
      return;
    }

    setIsSaving(true);

    const { error } = await db.createProgressUpdate({
      project_id: updatingProject.project_id,
      update_title: updateFormData.update_title,
      update_body: updateFormData.update_body || null,
      commit_sha_reference: updateFormData.commit_sha_reference || null,
    });

    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
    } else {
      toast({ title: "Update posted", description: "The update is now visible to the client" });
      setIsUpdateDialogOpen(false);
      onRefresh();
    }

    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!deletingProject) return;

    const { error } = await db.deleteProject(deletingProject.project_id);

    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "Project deleted" });
      setIsDeleteDialogOpen(false);
      setDeletingProject(null);
      onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-2">Projects</h1>
          <p className="text-muted-foreground">Manage client projects</p>
        </div>
        <Button onClick={openCreateDialog} className="rounded-full bg-foreground text-background hover:bg-foreground/90">
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((project, index) => (
            <motion.div
              key={project.project_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className="p-6 bg-card border border-border rounded-xl shadow-card hover:border-accent/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold">{project.title}</h3>
                    <Badge
                      variant="outline"
                      className={`font-mono text-xs ${
                        project.project_status === "shipped" ? "text-accent border-accent/30" : ""
                      }`}
                    >
                      {project.project_status}
                    </Badge>
                  </div>

                  <p className="text-sm text-muted-foreground mb-3">
                    {project.client?.company_name || project.client?.contact_email || "No client"}
                  </p>

                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">
                      <span className="text-accent">{formatCurrency(project.amount_paid_cents)}</span>
                      {" / "}
                      {formatCurrency(project.total_value_cents)}
                    </span>

                    {project.repository_name && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <GitBranch className="h-3 w-3" />
                        {project.repository_name}
                      </span>
                    )}

                    {project.preview_url && (
                      <a
                        href={project.preview_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-accent hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Preview
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => openUpdateDialog(project)}
                  >
                    <MessageSquarePlus className="h-4 w-4 mr-2" />
                    Post Update
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditDialog(project)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDeletingProject(project);
                      setIsDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create/Edit Project Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border-border max-w-2xl rounded-xl">
          <DialogHeader>
            <DialogTitle>
              {editingProject ? "Edit Project" : "Create Project"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Client</label>
                <Select
                  value={formData.client_id}
                  onValueChange={(v) => setFormData({ ...formData, client_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.client_id} value={c.client_id.toString()}>
                        {c.company_name || c.contact_email || `Client ${c.client_id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select
                  value={formData.project_status}
                  onValueChange={(v) => setFormData({ ...formData, project_status: v as ProjectStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Project title"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">GitHub Repo Name</label>
                <Input
                  value={formData.repository_name}
                  onChange={(e) => setFormData({ ...formData, repository_name: e.target.value })}
                  placeholder="e.g. my-project"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Preview URL</label>
                <Input
                  value={formData.preview_url}
                  onChange={(e) => setFormData({ ...formData, preview_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Total Value (PHP)</label>
                <Input
                  type="number"
                  value={formData.total_value_cents / 100}
                  onChange={(e) => setFormData({ ...formData, total_value_cents: parseFloat(e.target.value) * 100 })}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Amount Paid (PHP)</label>
                <Input
                  type="number"
                  value={formData.amount_paid_cents / 100}
                  onChange={(e) => setFormData({ ...formData, amount_paid_cents: parseFloat(e.target.value) * 100 })}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tech Stack (comma-separated)</label>
              <Input
                value={formData.tech_stack}
                onChange={(e) => setFormData({ ...formData, tech_stack: e.target.value })}
                placeholder="Next.js, Supabase, Stripe"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post Update Dialog */}
      <Dialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Post Update to {updatingProject?.title}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Update Title</label>
              <Input
                value={updateFormData.update_title}
                onChange={(e) => setUpdateFormData({ ...updateFormData, update_title: e.target.value })}
                placeholder="e.g. Design approved by client"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Details (optional)</label>
              <Textarea
                value={updateFormData.update_body}
                onChange={(e) => setUpdateFormData({ ...updateFormData, update_body: e.target.value })}
                placeholder="Additional context for the client..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Link to Commit SHA (optional)</label>
              <Input
                value={updateFormData.commit_sha_reference}
                onChange={(e) => setUpdateFormData({ ...updateFormData, commit_sha_reference: e.target.value })}
                placeholder="e.g. abc1234"
                className="font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUpdateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePostUpdate} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <MessageSquarePlus className="h-4 w-4 mr-2" />
              )}
              Post Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deletingProject?.title}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminProjects;
