import { useState, useRef } from "react";
import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FileViewerDialogProps {
  url: string;
  fileName: string;
  mimeType?: string;
  onRename?: (newName: string) => Promise<void> | void;
  onDelete: () => void;
  onClose: () => void;
}

const WORD_MIMES = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export function FileViewerDialog({
  url,
  fileName,
  mimeType,
  onRename,
  onDelete,
  onClose,
}: FileViewerDialogProps) {
  const [name, setName] = useState(fileName);
  const [isSavingName, setIsSavingName] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isWord = mimeType ? WORD_MIMES.includes(mimeType) : false;

  const commitRename = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === fileName) return;
    if (!onRename) return;
    setIsSavingName(true);
    try {
      await onRename(trimmed);
    } finally {
      setIsSavingName(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-4xl flex-col gap-0 p-0">
        <DialogHeader className="flex flex-row items-center gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {onRename ? (
              <Input
                ref={inputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    inputRef.current?.blur();
                  }
                }}
                disabled={isSavingName}
                className="h-8 text-sm font-medium"
                aria-label="File name"
              />
            ) : (
              <DialogTitle className="truncate text-sm font-medium">{name}</DialogTitle>
            )}
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden">
          {isWord ? (
            <div className="flex h-64 items-center justify-center p-6 text-sm text-muted-foreground">
              Word files cannot be previewed in the browser. Download to view.
            </div>
          ) : (
            <iframe
              src={url}
              title={name}
              className="h-full min-h-[60vh] w-full border-0"
            />
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
          >
            Delete
          </Button>
          <a href={url} download={name}>
            <Button size="sm" variant="outline">
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download
            </Button>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default FileViewerDialog;
