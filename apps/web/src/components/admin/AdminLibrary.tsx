import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Loader2, ExternalLink, Save } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { get, patch as apiPatch } from "@/lib/api";
import {
  type LibraryEntry,
  DEFAULT_LIBRARY_ENTRY,
  parseLibraryValue,
  newLibraryEntryId,
} from "@/lib/library";
import { PageHeader, Panel, Empty, Table, THead, TBody, TRow } from "@/components/admin/_ui";

const SETTINGS_KEY = "library";

const emptyForm = () => ({
  title: "",
  url: "",
  tag: "",
  note: "",
});

const AdminLibrary = () => {
  const { toast } = useToast();
  const [entry, setEntry] = useState<LibraryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await get<{ key?: string; value: unknown }>(`/api/settings/${SETTINGS_KEY}`);
      if (res.error || res.data == null) {
        // Missing key or network — seed defaults for MVP (not persisted until save)
        setEntry(DEFAULT_LIBRARY_ENTRY.map((e) => ({ ...e })));
        return;
      }
      const parsed = parseLibraryValue(res.data.value);
      setEntry(parsed.length > 0 ? parsed : DEFAULT_LIBRARY_ENTRY.map((e) => ({ ...e })));
    } catch {
      setEntry(DEFAULT_LIBRARY_ENTRY.map((e) => ({ ...e })));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const persist = async (next: LibraryEntry[]) => {
    setIsSaving(true);
    try {
      const res = await apiPatch(`/api/settings/${SETTINGS_KEY}`, { value: next });
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
        return false;
      }
      setEntry(next);
      return true;
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unable to save library",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdd = async () => {
    const title = form.title.trim();
    const url = form.url.trim();
    if (!title && !url) {
      toast({ title: "Title or URL required", variant: "destructive" });
      return;
    }
    const next: LibraryEntry = {
      id: newLibraryEntryId(),
      title: title || url,
      url,
      tag: form.tag.trim(),
      note: form.note.trim(),
    };
    const ok = await persist([...entry, next]);
    if (ok) {
      toast({ title: "Entry added" });
      setIsAddOpen(false);
      setForm(emptyForm());
    }
  };

  const handleDelete = async (id: string) => {
    const next = entry.filter((e) => e.id !== id);
    const ok = await persist(next);
    if (ok) toast({ title: "Entry removed" });
  };

  const handleSaveAll = async () => {
    const ok = await persist(entry);
    if (ok) toast({ title: "Library saved" });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-40 bg-secondary animate-pulse rounded" />
        <div className="h-24 bg-secondary animate-pulse rounded-lg" />
        <div className="h-24 bg-secondary animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Library"
        meta={`${entry.length} reference asset${entry.length === 1 ? "" : "s"}`}
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveAll}
              disabled={isSaving}
              className="h-9"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
            <Button
              size="sm"
              onClick={() => setIsAddOpen(true)}
              className="h-9 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>
        }
      />

      <Panel title="Reference assets" meta="Persisted via site settings">
        {entry.length === 0 ? (
          <Empty text="No library entries yet. Add a website, prompt, or doc reference." />
        ) : (
          <Table className="border-0 rounded-none">
            <THead>
              <span className="w-[22%] shrink-0">Title</span>
              <span className="flex-1 min-w-0">URL</span>
              <span className="w-[12%] shrink-0">Tag</span>
              <span className="w-[22%] shrink-0 hidden sm:block">Note</span>
              <span className="w-10 shrink-0" />
            </THead>
            <TBody>
              {entry.map((row) => (
                <TRow key={row.id} className="h-auto min-h-11 py-2">
                  <span className="w-[22%] shrink-0 font-medium truncate" title={row.title}>
                    {row.title}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-muted-foreground">
                    {row.url ? (
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 hover:text-accent truncate max-w-full"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="truncate">{row.url}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                      </a>
                    ) : (
                      "—"
                    )}
                  </span>
                  <span className="w-[12%] shrink-0">
                    {row.tag ? (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {row.tag}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </span>
                  <span
                    className="w-[22%] shrink-0 hidden sm:block truncate text-muted-foreground text-xs"
                    title={row.note}
                  >
                    {row.note || "—"}
                  </span>
                  <span className="w-10 shrink-0 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(row.id)}
                      disabled={isSaving}
                      aria-label={`Delete ${row.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </span>
                </TRow>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add library entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Title</label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Stripe pricing page"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">URL</label>
              <Input
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Tag</label>
              <Input
                value={form.tag}
                onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))}
                placeholder="website · prompt · module · asset · doc"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Note</label>
              <Textarea
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Why this is useful"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={isSaving}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Add entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminLibrary;
