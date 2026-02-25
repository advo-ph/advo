import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  Loader2,
  Star,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PortfolioProject {
  portfolio_project_id: number;
  title: string;
  description: string | null;
  preview_url: string | null;
  image_url: string | null;
  tech_stack: string[] | null;
  is_featured: boolean;
  display_order: number;
  created_at: string;
}

const AdminPortfolio = () => {
  const { toast } = useToast();
  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<PortfolioProject | null>(null);
  const [deletingProject, setDeletingProject] = useState<PortfolioProject | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    preview_url: "",
    image_url: "",
    tech_stack: "",
    is_featured: false,
    display_order: 0,
  });

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("portfolio_project")
      .select("*")
      .order("display_order", { ascending: true });
    setProjects((data as PortfolioProject[]) || []);
    setIsLoading(false);
  };

  const openCreateDialog = () => {
    setEditingProject(null);
    setFormData({
      title: "",
      description: "",
      preview_url: "",
      image_url: "",
      tech_stack: "",
      is_featured: false,
      display_order: projects.length,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (project: PortfolioProject) => {
    setEditingProject(project);
    setFormData({
      title: project.title,
      description: project.description || "",
      preview_url: project.preview_url || "",
      image_url: project.image_url || "",
      tech_stack: (project.tech_stack || []).join(", "),
      is_featured: project.is_featured,
      display_order: project.display_order,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.title) {
      toast({ title: "Error", description: "Title is required", variant: "destructive" });
      return;
    }

    setIsSaving(true);

    const payload = {
      title: formData.title,
      description: formData.description || null,
      preview_url: formData.preview_url || null,
      image_url: formData.image_url || null,
      tech_stack: formData.tech_stack
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      is_featured: formData.is_featured,
      display_order: formData.display_order,
    };

    if (editingProject) {
      // Optimistic update
      const prev = [...projects];
      setProjects((p) =>
        p.map((proj) =>
          proj.portfolio_project_id === editingProject.portfolio_project_id
            ? { ...proj, ...payload }
            : proj
        )
      );
      setIsDialogOpen(false);

      const { error } = await supabase
        .from("portfolio_project")
        .update(payload)
        .eq("portfolio_project_id", editingProject.portfolio_project_id);

      if (error) {
        setProjects(prev);
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Updated", description: `${formData.title} updated` });
      }
    } else {
      setIsDialogOpen(false);

      const { data, error } = await supabase
        .from("portfolio_project")
        .insert(payload)
        .select()
        .single();

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        setProjects((p) => [...p, data as PortfolioProject]);
        toast({ title: "Created", description: `${formData.title} added to portfolio` });
      }
    }

    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!deletingProject) return;

    const prev = [...projects];
    setProjects((p) =>
      p.filter((proj) => proj.portfolio_project_id !== deletingProject.portfolio_project_id)
    );
    setIsDeleteDialogOpen(false);

    const { error } = await supabase
      .from("portfolio_project")
      .delete()
      .eq("portfolio_project_id", deletingProject.portfolio_project_id);

    if (error) {
      setProjects(prev);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: `${deletingProject.title} removed` });
      setDeletingProject(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-2">Portfolio</h1>
          <p className="text-muted-foreground">Manage portfolio showcase projects</p>
        </div>
        <Button
          onClick={openCreateDialog}
          className="rounded-full bg-foreground text-background hover:bg-foreground/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Project
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project, index) => (
            <motion.div
              key={project.portfolio_project_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className="flex items-center justify-between p-4 bg-card border border-border rounded-xl shadow-card hover:border-accent/30 transition-colors"
            >
              <div className="flex items-center gap-4">
                {/* Thumbnail */}
                <div className="w-16 h-12 rounded-lg bg-secondary overflow-hidden flex-shrink-0">
                  {project.image_url ? (
                    <img
                      src={project.image_url}
                      alt={project.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                      No img
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{project.title}</p>
                    {project.is_featured && (
                      <Badge className="text-[10px] bg-accent/10 text-accent border-accent/30 gap-1">
                        <Star className="h-2.5 w-2.5" />
                        Featured
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground font-mono">
                      #{project.display_order}
                    </span>
                  </div>
                  {project.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 max-w-md">
                      {project.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {(project.tech_stack || []).slice(0, 4).map((t) => (
                      <Badge
                        key={t}
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0"
                      >
                        {t}
                      </Badge>
                    ))}
                    {project.preview_url && (
                      <a
                        href={project.preview_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-accent hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Preview
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => openEditDialog(project)}>
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
            </motion.div>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg rounded-xl">
          <DialogHeader>
            <DialogTitle>
              {editingProject ? "Edit Portfolio Project" : "Add Portfolio Project"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
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
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Brief description"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Preview URL</label>
                <Input
                  value={formData.preview_url}
                  onChange={(e) =>
                    setFormData({ ...formData, preview_url: e.target.value })
                  }
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Image URL</label>
                <Input
                  value={formData.image_url}
                  onChange={(e) =>
                    setFormData({ ...formData, image_url: e.target.value })
                  }
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Tech Stack (comma-separated)
              </label>
              <Input
                value={formData.tech_stack}
                onChange={(e) =>
                  setFormData({ ...formData, tech_stack: e.target.value })
                }
                placeholder="Next.js, Supabase, Tailwind"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Display Order</label>
                <Input
                  type="number"
                  value={formData.display_order}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      display_order: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant={formData.is_featured ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setFormData({ ...formData, is_featured: !formData.is_featured })
                  }
                  className="gap-1.5"
                >
                  <Star
                    className={`h-3.5 w-3.5 ${
                      formData.is_featured ? "fill-current" : ""
                    }`}
                  />
                  {formData.is_featured ? "Featured" : "Not Featured"}
                </Button>
              </div>
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

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Portfolio Project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{deletingProject?.title}&quot;. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminPortfolio;
