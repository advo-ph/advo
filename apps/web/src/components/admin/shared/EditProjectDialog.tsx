import { useState } from "react";
import { Loader2, Save } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { updateProject } from "@/lib/db";
import { useToast } from "@/hooks/use-toast";
import type { ProjectStatus } from "@/types/admin";
import { STATUS_OPTIONS } from "@/types/admin";
import type { MergedProject } from "@/hooks/useOrgProjects";

interface EditProjectDialogProps {
  project: MergedProject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditProjectDialog({ project, open, onOpenChange, onSaved }: EditProjectDialogProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
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

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast({ title: "Error", description: "Title is required", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await updateProject(project.project_id, {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        repository_name: formData.repository_name.trim() || null,
        preview_url: formData.preview_url.trim() || null,
        contract_url: formData.contract_url.trim() || null,
        project_status: formData.project_status,
        total_value_cents: formData.total_value_cents,
        amount_paid_cents: formData.amount_paid_cents,
        tech_stack: formData.tech_stack.split(",").map((s) => s.trim()).filter(Boolean),
      });

      if (error) {
        toast({ title: "Error", description: error, variant: "destructive" });
      } else {
        toast({ title: "Saved", description: "Project updated" });
        onOpenChange(false);
        onSaved();
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg rounded-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Project title"
            />
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
              <label className="text-sm font-medium">GitHub repo name</label>
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
              <label className="text-sm font-medium">Total value (PHP)</label>
              <Input
                type="number"
                value={formData.total_value_cents / 100}
                onChange={(e) =>
                  setFormData({ ...formData, total_value_cents: parseFloat(e.target.value) * 100 || 0 })
                }
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Amount paid (PHP)</label>
              <Input
                type="number"
                value={formData.amount_paid_cents / 100}
                onChange={(e) =>
                  setFormData({ ...formData, amount_paid_cents: parseFloat(e.target.value) * 100 || 0 })
                }
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Tech stack (comma-separated)</label>
            <Input
              value={formData.tech_stack}
              onChange={(e) => setFormData({ ...formData, tech_stack: e.target.value })}
              placeholder="React, Postgres, Stripe"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
