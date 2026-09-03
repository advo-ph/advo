import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { del, get, post } from "@/lib/api";
import {
  emptyLibraryDraft,
  fieldsForType,
  filterLibraryItem,
  LIBRARY_ITEM_TYPE,
  normalizeTag,
  uniqueTag,
  type LibraryFilter,
  type LibraryItem,
  type LibraryItemDraft,
  type LibraryItemType,
} from "@/lib/library";
import { PageHeader, Empty } from "./_ui";

const TYPE_LABEL: Record<LibraryItemType, string> = {
  website: "Website",
  prompt: "Prompt",
  module: "Module",
  asset: "Asset",
  doc: "Doc",
};

const AdminLibrary = () => {
  const { toast } = useToast();
  const [item, setItem] = useState<LibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [draft, setDraft] = useState<LibraryItemDraft>(emptyLibraryDraft);
  const [tagInput, setTagInput] = useState("");
  const [openItem, setOpenItem] = useState<LibraryItem | null>(null);
  const [filter, setFilter] = useState<LibraryFilter>({
    itemType: "all",
    tag: [],
    search: "",
  });

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await get<LibraryItem[]>("/api/library");
      if (res.error || !res.data) {
        setItem([]);
        if (res.error) {
          toast({ title: "Library unavailable", description: res.error, variant: "destructive" });
        }
        return;
      }
      setItem(res.data);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => filterLibraryItem(item, filter), [item, filter]);
  const availableTag = useMemo(() => uniqueTag(item), [item]);
  const draftField = fieldsForType(draft.itemType);

  const handleAdd = async () => {
    if (!draft.title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const res = await post<LibraryItem>("/api/library", {
        itemType: draft.itemType,
        title: draft.title.trim(),
        url: draft.url.trim() || null,
        body: draft.body.trim() || null,
        thumbnailUrl: draft.thumbnailUrl.trim() || null,
        tag: draft.tag,
      });
      if (res.error || !res.data) {
        toast({ title: "Error", description: res.error || "Unable to add item", variant: "destructive" });
        return;
      }
      setItem((prev) => [res.data as LibraryItem, ...prev]);
      setIsAddOpen(false);
      setDraft(emptyLibraryDraft());
      setTagInput("");
      toast({ title: "Added to library" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (row: LibraryItem) => {
    setIsSaving(true);
    try {
      const res = await del(`/api/library/${row.libraryItemId}`);
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
        return;
      }
      setItem((prev) => prev.filter((i) => i.libraryItemId !== row.libraryItemId));
      if (openItem?.libraryItemId === row.libraryItemId) setOpenItem(null);
      toast({ title: "Removed" });
    } finally {
      setIsSaving(false);
    }
  };

  const copyBody = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copied" });
  };

  const toggleFilterTag = (value: string) => {
    setFilter((prev) => ({
      ...prev,
      tag: prev.tag.includes(value)
        ? prev.tag.filter((t) => t !== value)
        : [...prev.tag, value],
    }));
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Files"
        meta={`${item.length} item${item.length === 1 ? "" : "s"} · website / prompt / module / asset / doc`}
        action={
          <Button
            size="sm"
            className="h-9 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => {
              setDraft(emptyLibraryDraft());
              setTagInput("");
              setIsAddOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add item
          </Button>
        }
      />

      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search title, url, body, tag…"
            value={filter.search}
            onChange={(e) => setFilter((prev) => ({ ...prev, search: e.target.value }))}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilter((prev) => ({ ...prev, itemType: "all" }))}
            className={`h-7 px-2.5 rounded-md text-xs border transition-colors ${
              filter.itemType === "all"
                ? "bg-accent/10 text-accent-ink border-accent/30"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          {LIBRARY_ITEM_TYPE.map((itemType) => (
            <button
              key={itemType}
              type="button"
              onClick={() => setFilter((prev) => ({ ...prev, itemType }))}
              className={`h-7 px-2.5 rounded-md text-xs border capitalize transition-colors ${
                filter.itemType === itemType
                  ? "bg-accent/10 text-accent-ink border-accent/30"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {TYPE_LABEL[itemType]}
            </button>
          ))}
        </div>
        {availableTag.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {availableTag.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => toggleFilterTag(value)}
                className={`h-6 px-2 rounded-md text-[11px] border transition-colors ${
                  filter.tag.includes(value)
                    ? "bg-secondary text-foreground border-border"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 border border-border rounded-lg bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <div className="border border-border rounded-lg bg-card">
          <Empty text={item.length === 0 ? "No files yet. Add your first item to get started." : "No items match this filter"} icon={BookOpen} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((row) => (
            <button
              key={row.libraryItemId}
              type="button"
              onClick={() => setOpenItem(row)}
              className="group text-left border border-border rounded-lg bg-card overflow-hidden hover:bg-secondary/30 transition-colors"
            >
              <div className="aspect-[16/9] bg-secondary/40 overflow-hidden">
                {row.thumbnailUrl ? (
                  <img
                    src={row.thumbnailUrl}
                    alt=""
                    className="h-full w-full object-cover group-hover:opacity-90"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground capitalize">
                    {row.itemType} preview
                  </div>
                )}
              </div>
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px] font-normal capitalize">
                    {row.itemType}
                  </Badge>
                  <span className="font-medium text-sm truncate">{row.title}</span>
                </div>
                {row.tag.length > 0 && (
                  <p className="text-[11px] text-muted-foreground truncate">{row.tag.join(" · ")}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {openItem && (
        <div className="fixed inset-0 z-40 flex justify-end bg-background/60 backdrop-blur-sm" onClick={() => setOpenItem(null)}>
          <aside
            className="h-full w-full max-w-md border-l border-border bg-card p-5 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <Badge variant="secondary" className="text-[10px] font-normal capitalize mb-2">
                  {openItem.itemType}
                </Badge>
                <h2 className="text-lg font-semibold tracking-tight">{openItem.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpenItem(null)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {openItem.tag.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {openItem.tag.map((value) => (
                  <Badge key={value} variant="outline" className="text-[10px] font-normal">
                    {value}
                  </Badge>
                ))}
              </div>
            )}

            {openItem.body && (
              <pre className="mb-4 whitespace-pre-wrap text-sm text-muted-foreground bg-secondary/30 rounded-lg p-3 border border-border">
                {openItem.body}
              </pre>
            )}

            <div className="flex flex-wrap gap-2">
              {openItem.body && (
                <Button size="sm" variant="outline" className="h-8" onClick={() => copyBody(openItem.body || "")}>
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copy
                </Button>
              )}
              {openItem.url && (
                <Button size="sm" variant="outline" className="h-8" asChild>
                  <a href={openItem.url} target="_blank" rel="noopener noreferrer">
                    {openItem.itemType === "asset" ? (
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                    ) : (
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {openItem.itemType === "asset" ? "Download" : "Open"}
                  </a>
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-destructive"
                disabled={isSaving}
                onClick={() => handleDelete(openItem)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            </div>
          </aside>
        </div>
      )}

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="bg-card border-border max-w-lg rounded-lg">
          <DialogHeader>
            <DialogTitle>Add library item</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Type</label>
              <Select
                value={draft.itemType}
                onValueChange={(v) =>
                  setDraft((prev) => ({ ...prev, itemType: v as LibraryItemType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIBRARY_ITEM_TYPE.map((itemType) => (
                    <SelectItem key={itemType} value={itemType}>
                      {TYPE_LABEL[itemType]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Title</label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="e.g. Clinic landing prompt"
              />
            </div>
            {draftField.showUrl && (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">URL</label>
                <Input
                  value={draft.url}
                  onChange={(e) => setDraft((prev) => ({ ...prev, url: e.target.value }))}
                  placeholder="https://…"
                />
              </div>
            )}
            {draftField.showThumbnail && (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Thumbnail URL</label>
                <Input
                  value={draft.thumbnailUrl}
                  onChange={(e) => setDraft((prev) => ({ ...prev, thumbnailUrl: e.target.value }))}
                  placeholder="https://…"
                />
              </div>
            )}
            {draftField.showBody && (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  {draft.itemType === "prompt" ? "Prompt" : draft.itemType === "module" ? "Recipe" : "Body"}
                </label>
                <Textarea
                  value={draft.body}
                  onChange={(e) => setDraft((prev) => ({ ...prev, body: e.target.value }))}
                  rows={5}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Tags (comma-separated)</label>
              <Input
                value={tagInput}
                onChange={(e) => {
                  setTagInput(e.target.value);
                  setDraft((prev) => ({ ...prev, tag: normalizeTag(e.target.value) }));
                }}
                placeholder="clinic, seo"
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
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminLibrary;
