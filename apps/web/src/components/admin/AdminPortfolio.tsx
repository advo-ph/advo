import { useState, useRef } from "react";
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
  Upload,
  GripVertical,
  Film,
  ChevronDown,
  ChevronUp,
  BookOpen,
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
import { upload } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  useAdminPortfolio,
  type CaseStudy,
  type PortfolioProject,
} from "@/hooks/useAdminPortfolio";

/* ─── Drag-and-drop media list ──────────────────── */

const isVideoUrl = (url: string) => /\.(mp4|webm|mov|ogg|ogv|m4v)(\?|$)/i.test(url);

const MediaList = ({
  items,
  onChange,
  onUpload,
  isUploading,
}: {
  items: string[];
  onChange: (urls: string[]) => void;
  onUpload: (file: File) => void;
  isUploading: boolean;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const next = [...items];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    onChange(next);
    setDragIdx(idx);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
  };

  const removeItem = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Media</label>
      <p className="text-xs text-muted-foreground">
        First item is the main thumbnail. Drag to reorder.
      </p>

      <div className="grid grid-cols-3 gap-2">
        {items.map((url, idx) => (
          <div
            key={`${url}-${idx}`}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
            className={`relative group rounded-lg overflow-hidden border-2 aspect-video cursor-grab active:cursor-grabbing ${
              idx === 0
                ? "border-accent ring-1 ring-accent/30"
                : "border-border"
            } ${dragIdx === idx ? "opacity-50" : ""}`}
          >
            {isVideoUrl(url) ? (
              <>
                <video
                  src={url}
                  muted
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover"
                  draggable={false}
                />
                <Film className="absolute bottom-1 right-1 h-3.5 w-3.5 text-white drop-shadow" />
              </>
            ) : (
              <img
                src={url}
                alt={`Media ${idx + 1}`}
                className="w-full h-full object-cover"
                draggable={false}
              />
            )}
            {idx === 0 && (
              <Badge className="absolute top-1 left-1 text-[9px] bg-accent text-white px-1.5 py-0">
                ★ Main
              </Badge>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
              <GripVertical className="h-4 w-4 text-white" />
              <button
                onClick={() => removeItem(idx)}
                className="p-1 rounded-full bg-destructive/80 hover:bg-destructive"
              >
                <X className="h-3 w-3 text-white" />
              </button>
            </div>
          </div>
        ))}

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex flex-col items-center justify-center aspect-video rounded-lg border-2 border-dashed border-border hover:border-accent/50 hover:bg-accent/5 transition-colors"
        >
          {isUploading ? (
            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
          ) : (
            <>
              <Upload className="h-5 w-5 text-muted-foreground mb-1" />
              <span className="text-[10px] text-muted-foreground">Add media</span>
            </>
          )}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/mp4,video/webm,video/quicktime,video/ogg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
};

/* ─── Main Component ─────────────────────────────── */

const AdminPortfolio = () => {
  const { toast } = useToast();
  const {
    projects,
    isLoading,
    createPortfolio,
    updatePortfolio,
    deletePortfolio,
    isSaving,
  } = useAdminPortfolio();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<PortfolioProject | null>(null);
  const [deletingProject, setDeletingProject] = useState<PortfolioProject | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [showCaseStudy, setShowCaseStudy] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    description: "",
    preview_url: "",
    image_urls: [] as string[],
    tech_stack: "",
    is_featured: false,
    display_order: 0,
    cs_overview: "",
    cs_challenge: "",
    cs_solution: "",
    cs_results: "",
    cs_github_url: "",
  });

  const openCreateDialog = () => {
    setEditingProject(null);
    setShowCaseStudy(false);
    setFormData({
      title: "",
      slug: "",
      description: "",
      preview_url: "",
      image_urls: [],
      tech_stack: "",
      is_featured: false,
      display_order: projects.length,
      cs_overview: "",
      cs_challenge: "",
      cs_solution: "",
      cs_results: "",
      cs_github_url: "",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (project: PortfolioProject) => {
    setEditingProject(project);

    // Merge image_urls and fallback to image_url
    let imgs = project.image_urls || [];
    if (imgs.length === 0 && project.image_url) {
      imgs = [project.image_url];
    }

    const cs = project.case_study || {};
    setShowCaseStudy(Boolean(cs.overview || cs.challenge || cs.solution));

    setFormData({
      title: project.title,
      slug: project.slug || "",
      description: project.description || "",
      preview_url: project.preview_url || "",
      image_urls: imgs,
      tech_stack: (project.tech_stack || []).join(", "),
      is_featured: project.is_featured,
      display_order: project.display_order,
      cs_overview: cs.overview || "",
      cs_challenge: cs.challenge || "",
      cs_solution: cs.solution || "",
      cs_results: (cs.results || []).join("\n"),
      cs_github_url: cs.github_url || "",
    });
    setIsDialogOpen(true);
  };

  const handleMediaUpload = async (file: File) => {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      toast({ title: "Error", description: "Please select an image or video file", variant: "destructive" });
      return;
    }
    const limit = file.type.startsWith("video/") ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > limit) {
      toast({ title: "Error", description: `File must be under ${limit / (1024 * 1024)}MB`, variant: "destructive" });
      return;
    }

    setIsUploading(true);

    const result = await upload(file, "portfolio");

    if (result.error) {
      toast({ title: "Upload failed", description: result.error, variant: "destructive" });
      setIsUploading(false);
      return;
    }

    setFormData((prev) => ({
      ...prev,
      image_urls: [...prev.image_urls, result.url],
    }));
    setIsUploading(false);
    toast({ title: "Uploaded", description: file.type.startsWith("video/") ? "Video added" : "Image added" });
  };

  const handleSave = async () => {
    if (!formData.title) {
      toast({ title: "Error", description: "Title is required", variant: "destructive" });
      return;
    }

    // Auto-generate slug from title if empty
    const slug = formData.slug.trim() || formData.title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-");

    const caseStudy: CaseStudy = {};
    if (formData.cs_overview) caseStudy.overview = formData.cs_overview;
    if (formData.cs_challenge) caseStudy.challenge = formData.cs_challenge;
    if (formData.cs_solution) caseStudy.solution = formData.cs_solution;
    if (formData.cs_results.trim()) caseStudy.results = formData.cs_results.split("\n").map(s => s.trim()).filter(Boolean);
    if (formData.cs_github_url) caseStudy.github_url = formData.cs_github_url;

    const input = {
      title: formData.title,
      slug,
      description: formData.description || undefined,
      preview_url: formData.preview_url || undefined,
      image_url: formData.image_urls[0] || undefined,
      image_urls: formData.image_urls,
      tech_stack: formData.tech_stack
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      is_featured: formData.is_featured,
      display_order: formData.display_order,
      case_study: Object.keys(caseStudy).length > 0 ? caseStudy : undefined,
    };

    setIsDialogOpen(false);

    try {
      if (editingProject) {
        await updatePortfolio(editingProject.portfolio_project_id, input);
      } else {
        await createPortfolio(input);
      }
    } catch {
      // Hook surfaces the toast; nothing extra to do here
    }
  };

  const handleDelete = async () => {
    if (!deletingProject) return;
    setIsDeleteDialogOpen(false);
    try {
      await deletePortfolio(deletingProject.portfolio_project_id);
      setDeletingProject(null);
    } catch {
      // Hook surfaces the toast
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
                  {(() => {
                    const thumb = project.image_urls?.[0] || project.image_url;
                    if (!thumb) return (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                        No media
                      </div>
                    );
                    if (isVideoUrl(thumb)) return (
                      <video src={thumb} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                    );
                    return (
                      <img src={thumb} alt={project.title} className="w-full h-full object-cover" />
                    );
                  })()}
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
                    {(project.image_urls?.length || 0) > 1 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {project.image_urls!.length} media
                      </Badge>
                    )}
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
        <DialogContent className="bg-card border-border max-w-xl rounded-xl max-h-[85vh] overflow-y-auto">
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

            {/* Media upload (images + videos) */}
            <MediaList
              items={formData.image_urls}
              onChange={(urls) => setFormData({ ...formData, image_urls: urls })}
              onUpload={handleMediaUpload}
              isUploading={isUploading}
            />

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
              <label className="text-sm font-medium">
                Tech Stack (comma-separated)
              </label>
              <Input
                value={formData.tech_stack}
                onChange={(e) =>
                  setFormData({ ...formData, tech_stack: e.target.value })
                }
                placeholder="React, Postgres, Tailwind"
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
            {/* Case Study Section */}
            <div className="border-t border-border pt-4 mt-2">
              <button
                type="button"
                onClick={() => setShowCaseStudy(!showCaseStudy)}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                <BookOpen className="h-4 w-4" />
                Case Study
                {showCaseStudy ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
              </button>

              {showCaseStudy && (
                <div className="grid gap-4 mt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">URL Slug</label>
                    <Input
                      value={formData.slug}
                      onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                      placeholder="auto-generated-from-title"
                    />
                    <p className="text-xs text-muted-foreground">Leave blank to auto-generate from title.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Overview</label>
                    <Textarea
                      value={formData.cs_overview}
                      onChange={(e) => setFormData({ ...formData, cs_overview: e.target.value })}
                      placeholder="A high-level overview of the project..."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">The Challenge</label>
                    <Textarea
                      value={formData.cs_challenge}
                      onChange={(e) => setFormData({ ...formData, cs_challenge: e.target.value })}
                      placeholder="What problem was the client facing?"
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Our Solution</label>
                    <Textarea
                      value={formData.cs_solution}
                      onChange={(e) => setFormData({ ...formData, cs_solution: e.target.value })}
                      placeholder="How we approached and solved it..."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Results (one per line)</label>
                    <Textarea
                      value={formData.cs_results}
                      onChange={(e) => setFormData({ ...formData, cs_results: e.target.value })}
                      placeholder={"Reduced patient wait time by 40%\nZero lost records\nStreamlined workflow"}
                      rows={4}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">GitHub URL</label>
                    <Input
                      value={formData.cs_github_url}
                      onChange={(e) => setFormData({ ...formData, cs_github_url: e.target.value })}
                      placeholder="https://github.com/..."
                    />
                  </div>
                </div>
              )}
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
