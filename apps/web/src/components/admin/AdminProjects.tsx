import { useState } from "react";
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
  GitCommitHorizontal,
  GitPullRequest,
  Clock,
  FolderKanban,
  LayoutDashboard,
  ArrowLeft,
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
import { projectFormMode } from "@/lib/project-form";
import { useToast } from "@/hooks/use-toast";
import type { Client, ProjectStatus } from "@/types/admin";
import { STATUS_OPTIONS, formatCurrency } from "@/types/admin";
import type { MergedProject } from "@/hooks/useOrgProjects";
import ProjectCommandCenter from "./ProjectCommandCenter";
import { PageHeader, StatStrip, Stat, Dot, Empty, Panel } from "./_ui";

const STATUS_DOT: Record<string, string> = {
  discovery: "bg-blue-500",
  architecture: "bg-purple-500",
  development: "bg-orange-500",
  testing: "bg-yellow-500",
  shipped: "bg-green-500",
};

interface AdminProjectsProps {
  projects: MergedProject[];
  clients: Client[];
  isLoading: boolean;
  onRefresh: () => void;
}

const AdminProjects = ({ projects, clients, isLoading, onRefresh }: AdminProjectsProps) => {
  const { toast } = useToast();

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<MergedProject | null>(null);
  const [deletingProject, setDeletingProject] = useState<MergedProject | null>(null);
  const [updatingProject, setUpdatingProject] = useState<MergedProject | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Command-center view: keep the id and re-derive from the live list so it
  // stays fresh after edits/refetch (and falls back to the list if deleted).
  const [openProjectId, setOpenProjectId] = useState<number | null>(null);
  const openProject =
    openProjectId != null ? projects.find((p) => p.project_id === openProjectId) ?? null : null;

  // Form state
  const [formData, setFormData] = useState({
    client_id: "",
    title: "",
    description: "",
    repository_name: "",
    preview_url: "",
    contract_url: "",
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
      contract_url: "",
      project_status: "discovery",
      total_value_cents: 0,
      amount_paid_cents: 0,
      tech_stack: "",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (project: MergedProject) => {
    setEditingProject(project);
    setFormData({
      client_id: project.client_id?.toString() ?? "",
      title: project.title,
      description: project.description || "",
      repository_name: project.repository_name || "",
      preview_url: project.preview_url || "",
      contract_url: project.contract_url || "",
      project_status: project.project_status as ProjectStatus,
      total_value_cents: project.total_value_cents,
      amount_paid_cents: project.amount_paid_cents,
      tech_stack: project.tech_stack.join(", "),
    });
    setIsDialogOpen(true);
  };

  const openUpdateDialog = (project: MergedProject) => {
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
      contract_url: formData.contract_url || null,
      project_status: formData.project_status,
      total_value_cents: formData.total_value_cents,
      amount_paid_cents: formData.amount_paid_cents,
      tech_stack: formData.tech_stack.split(",").map(s => s.trim()).filter(Boolean),
    };

    try {
      let error: string | null;
      if (editingProject) {
        ({ error } = await db.updateProject(editingProject.project_id, projectData));
        if (error) {
          toast({ title: "Error", description: error, variant: "destructive" });
        } else {
          toast({ title: "Success", description: "Project updated" });
          setIsDialogOpen(false);
          onRefresh();
        }
      } else {
        ({ error } = await db.createProject(projectData));
        if (error) {
          toast({ title: "Error", description: error, variant: "destructive" });
        } else {
          toast({ title: "Success", description: "Project created" });
          setIsDialogOpen(false);
          onRefresh();
        }
      }
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unable to save project",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePostUpdate = async () => {
    if (!updatingProject || !updateFormData.update_title) {
      toast({ title: "Error", description: "Title is required", variant: "destructive" });
      return;
    }

    setIsSaving(true);

    try {
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
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unable to post update",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingProject) return;

    try {
      const { error } = await db.deleteProject(deletingProject.project_id);

      if (error) {
        toast({ title: "Error", description: error, variant: "destructive" });
      } else {
        toast({ title: "Deleted", description: "Project deleted" });
        setIsDeleteDialogOpen(false);
        setDeletingProject(null);
        onRefresh();
      }
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unable to delete project",
        variant: "destructive",
      });
    }
  };

  if (openProject) {
    return <ProjectCommandCenter project={openProject} onBack={() => setOpenProjectId(null)} />;
  }

  const formMode = projectFormMode(isDialogOpen, editingProject);
  const closeForm = () => setIsDialogOpen(false);

  // Full-page create/edit form (replaces Dialog modal for high-field CRUD)
  if (formMode !== "closed") {
    return (
      <div className="space-y-5">
        <div>
          <button
            type="button"
            onClick={closeForm}
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to projects
          </button>
          <PageHeader
            title={formMode === "edit" ? "Edit project" : "New project"}
            meta={
              formMode === "edit" && editingProject
                ? editingProject.title
                : "Create a project for a client"
            }
            action={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-9" onClick={closeForm}>
                  <X className="h-4 w-4 mr-1.5" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-9 bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-1.5" />
                  )}
                  Save
                </Button>
              </div>
            }
          />
        </div>

        <Panel title="Project details">
          <div className="grid gap-4 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            <div className="space-y-2">
              <label className="text-sm font-medium">Contract URL</label>
              <Input
                value={formData.contract_url}
                onChange={(e) => setFormData({ ...formData, contract_url: e.target.value })}
                placeholder="https://link-to-contract.pdf"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Total Value (PHP)</label>
                <Input
                  type="number"
                  value={formData.total_value_cents / 100}
                  onChange={(e) =>
                    setFormData({ ...formData, total_value_cents: parseFloat(e.target.value) * 100 })
                  }
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Amount Paid (PHP)</label>
                <Input
                  type="number"
                  value={formData.amount_paid_cents / 100}
                  onChange={(e) =>
                    setFormData({ ...formData, amount_paid_cents: parseFloat(e.target.value) * 100 })
                  }
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tech Stack (comma-separated)</label>
              <Input
                value={formData.tech_stack}
                onChange={(e) => setFormData({ ...formData, tech_stack: e.target.value })}
                placeholder="React, Postgres, Stripe"
              />
            </div>

            {editingProject && (
              <div className="space-y-3 pt-3 border-t border-border">
                <label className="text-sm font-medium">Add Project Asset</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    id="asset-url"
                    placeholder="Asset URL (image or doc link)"
                    className="sm:col-span-2"
                  />
                  <Input id="asset-caption" placeholder="Caption (optional)" />
                  <Select defaultValue="progress_photo">
                    <SelectTrigger id="asset-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="progress_photo">Progress Photo</SelectItem>
                      <SelectItem value="completion_photo">Completion Photo</SelectItem>
                      <SelectItem value="document">Document</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={async () => {
                    const urlEl = document.getElementById("asset-url") as HTMLInputElement;
                    const captionEl = document.getElementById("asset-caption") as HTMLInputElement;
                    const typeEl = document.querySelector<HTMLButtonElement>("#asset-type");
                    const assetUrl = urlEl?.value?.trim();
                    if (!assetUrl || !editingProject) return;

                    const assetType = (typeEl?.textContent?.toLowerCase().replace(/ /g, "_") ||
                      "progress_photo") as "progress_photo" | "completion_photo" | "document";

                    try {
                      const { error } = await db.addProjectAsset({
                        project_id: editingProject.project_id,
                        asset_type: assetType,
                        url: assetUrl,
                        caption: captionEl?.value?.trim() || null,
                      });

                      if (error) {
                        toast({ title: "Error", description: error, variant: "destructive" });
                      } else {
                        toast({ title: "Added", description: "Asset uploaded" });
                        if (urlEl) urlEl.value = "";
                        if (captionEl) captionEl.value = "";
                        onRefresh();
                      }
                    } catch (err) {
                      toast({
                        title: "Error",
                        description: err instanceof Error ? err.message : "Unable to add asset",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Asset
                </Button>
              </div>
            )}
          </div>
        </Panel>
      </div>
    );
  }

  const activeCount = projects.filter((p) => p.project_status !== "shipped").length;
  const shippedCount = projects.filter((p) => p.project_status === "shipped").length;
  const totalPaid = projects.reduce((s, p) => s + p.amount_paid_cents, 0);
  const totalValue = projects.reduce((s, p) => s + p.total_value_cents, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Projects"
        meta={`${projects.length} total · ${activeCount} active · ${shippedCount} shipped`}
        action={
          <Button
            onClick={openCreateDialog}
            size="sm"
            className="h-9 bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New project
          </Button>
        }
      />

      {!isLoading && projects.length > 0 && (
        <StatStrip cols={3}>
          <Stat label="Active" value={String(activeCount)} sub={`${shippedCount} shipped`} />
          <Stat label="Collected" value={formatCurrency(totalPaid)} accent />
          <Stat label="Total value" value={formatCurrency(totalValue)} />
        </StatStrip>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12 border border-border rounded-lg bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <div className="border border-border rounded-lg bg-card">
          <Empty text="No projects yet" icon={FolderKanban} />
          <div className="flex justify-center pb-8">
            <Button
              onClick={openCreateDialog}
              size="sm"
              className="h-9 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New project
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((project) => (
            <div
              key={project.project_id}
              className="border border-border rounded-lg bg-card p-4 hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <Dot className={STATUS_DOT[project.project_status] ?? "bg-muted-foreground"} />
                    <h3 className="font-medium truncate">{project.title}</h3>
                    <span
                      className={`text-xs capitalize ${
                        project.project_status === "shipped" ? "text-accent" : "text-muted-foreground"
                      }`}
                    >
                      {project.project_status}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground mb-3 truncate">
                    {project.client?.company_name || project.client?.contact_email || "No client"}
                  </p>

                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground tabular-nums">
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

                  {/* GitHub enrichment row */}
                  {project.githubRepo && (
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                      <span className="flex items-center gap-1 tabular-nums">
                        <GitCommitHorizontal className="h-3 w-3" />
                        {project.commits.length} recent commits
                      </span>
                      <span className="flex items-center gap-1 tabular-nums">
                        <GitPullRequest className="h-3 w-3" />
                        {project.openPRs} open PRs
                      </span>
                      {project.lastPush && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last push {new Date(project.lastPush).toLocaleDateString()}
                        </span>
                      )}
                      {project.detectedTechStack.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          {project.detectedTechStack.slice(0, 4).map((t) => (
                            <Badge key={t.name} variant="secondary" className="text-[10px] px-1.5 py-0 rounded-md">
                              {t.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    className="h-8 bg-accent text-accent-foreground hover:bg-accent/90"
                    onClick={() => setOpenProjectId(project.project_id)}
                  >
                    <LayoutDashboard className="h-4 w-4 mr-1.5" />
                    Open
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => openUpdateDialog(project)}
                  >
                    <MessageSquarePlus className="h-4 w-4 mr-1.5" />
                    Post update
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => openEditDialog(project)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => {
                      setDeletingProject(project);
                      setIsDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Post Update Dialog (small modal — intentionally not full-page) */}
      <Dialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg rounded-lg">
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
                onChange={(e) =>
                  setUpdateFormData({ ...updateFormData, commit_sha_reference: e.target.value })
                }
                placeholder="e.g. abc1234"
                className="tabular-nums"
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
        <AlertDialogContent className="bg-card border-border rounded-lg">
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
