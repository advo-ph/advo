/**
 * ProjectInvoicesPanel — left column of the Finance tab.
 *
 * Shows a list of uploaded invoice PDFs for a single project.
 * Each row: file name | amount | phase status toggle | paid status cycle | View file | Delete.
 *
 * Designed with an optional `mode` prop so Phase 9 can drop this into the
 * all-projects Finance page with a project label column if needed.
 */

import { useState, useRef, useEffect } from "react";
import { Upload, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, Empty } from "@/components/admin/_ui";
import { FileViewerDialog } from "@/components/admin/shared/FileViewerDialog";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import { formatCurrency } from "@/types/admin";
import { get, post, patch, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────

export interface InvoiceFile {
  invoiceFileId: number;
  projectId: number;
  recurringFeeId: number | null;
  fileUrl: string;
  fileName: string;
  fileNumber: number;
  billingMonth: string | null;
  totalCents: number | null;
  phaseStatus: "downpayment" | "full";
  paidStatus: "unpaid" | "paid" | "overdue";
  createdAt: string;
}

// ─── Status styling ───────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  downpayment: "Downpayment",
  full: "Full",
};

const PAID_LABELS: Record<string, string> = {
  unpaid: "Unpaid",
  paid: "Paid",
  overdue: "Overdue",
};

const PAID_NEXT: Record<string, "unpaid" | "paid" | "overdue"> = {
  unpaid: "paid",
  paid: "overdue",
  overdue: "unpaid",
};

const PAID_VARIANT: Record<string, string> = {
  unpaid: "outline",
  paid: "default",
  overdue: "destructive",
};

// ─── Component ────────────────────────────────────────

interface ProjectInvoicesPanelProps {
  projectId: number;
  /** Called when the paid status changes so the parent can refresh stat cards. */
  onFilesChange?: (files: InvoiceFile[]) => void;
}

export function ProjectInvoicesPanel({ projectId, onFilesChange }: ProjectInvoicesPanelProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<InvoiceFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [viewerFile, setViewerFile] = useState<InvoiceFile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InvoiceFile | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const fetchFiles = () => {
    setIsLoading(true);
    get<InvoiceFile[]>(`/api/invoices/files?projectId=${projectId}`)
      .then((res) => {
        if (res.data && !res.error) {
          setFiles(res.data);
          onFilesChange?.(res.data);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("projectId", String(projectId));
      formData.append("file", file);

      const res = await post<InvoiceFile>("/api/invoices/files/upload", formData);
      if (res.error || !res.data) {
        toast({ title: "Upload failed", description: res.error ?? "Unknown error", variant: "destructive" });
        return;
      }
      const updated = [...files, res.data].sort((a, b) => a.fileNumber - b.fileNumber);
      setFiles(updated);
      onFilesChange?.(updated);
      toast({ title: "Invoice uploaded." });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const togglePhase = async (file: InvoiceFile) => {
    const next = file.phaseStatus === "downpayment" ? "full" : "downpayment";
    setTogglingId(file.invoiceFileId);
    const { error } = await patch(`/api/invoices/files/${file.invoiceFileId}`, { phaseStatus: next });
    setTogglingId(null);
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
      return;
    }
    const updated: InvoiceFile[] = files.map((f) =>
      f.invoiceFileId === file.invoiceFileId ? { ...f, phaseStatus: next } : f,
    );
    setFiles(updated);
    onFilesChange?.(updated);
  };

  const togglePaid = async (file: InvoiceFile) => {
    const next = PAID_NEXT[file.paidStatus];
    setTogglingId(file.invoiceFileId);
    const { error } = await patch(`/api/invoices/files/${file.invoiceFileId}`, { paidStatus: next });
    setTogglingId(null);
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
      return;
    }
    const updated = files.map((f) =>
      f.invoiceFileId === file.invoiceFileId ? { ...f, paidStatus: next } : f,
    );
    setFiles(updated);
    onFilesChange?.(updated);
  };

  const handleRename = async (fileId: number, fileName: string) => {
    const { error } = await patch(`/api/invoices/files/${fileId}`, { fileName });
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
      return;
    }
    const updated = files.map((f) => (f.invoiceFileId === fileId ? { ...f, fileName } : f));
    setFiles(updated);
    onFilesChange?.(updated);
    if (viewerFile?.invoiceFileId === fileId) setViewerFile((v) => (v ? { ...v, fileName } : v));
  };

  const handleDelete = async (fileId: number) => {
    const { error } = await del(`/api/invoices/files/${fileId}`);
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
      return;
    }
    const updated = files.filter((f) => f.invoiceFileId !== fileId);
    setFiles(updated);
    onFilesChange?.(updated);
    setDeleteTarget(null);
    if (viewerFile?.invoiceFileId === fileId) setViewerFile(null);
    toast({ title: "Invoice deleted." });
  };

  const uploadButton = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleFileSelect}
      />
      <Button
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
      >
        {isUploading ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="mr-1.5 h-3.5 w-3.5" />
        )}
        Upload invoice
      </Button>
    </>
  );

  return (
    <>
      <Panel title="Project invoices" action={uploadButton}>
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : files.length === 0 ? (
          // The header already carries "Upload invoice"; a second copy here read
          // as two different actions.
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <Empty text="No invoices uploaded yet." />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {files.map((f) => (
              <div
                key={f.invoiceFileId}
                className="flex flex-wrap items-center gap-2 px-4 py-2.5"
              >
                {/* File name */}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.fileName}</span>

                {/* Amount */}
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {f.totalCents != null ? formatCurrency(f.totalCents) : "—"}
                </span>

                {/* Phase status toggle */}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 text-xs"
                  disabled={togglingId === f.invoiceFileId}
                  onClick={() => void togglePhase(f)}
                >
                  {PHASE_LABELS[f.phaseStatus] ?? f.phaseStatus}
                </Button>

                {/* Paid status cycle */}
                <Button
                  size="sm"
                  variant={PAID_VARIANT[f.paidStatus] as "outline" | "default" | "destructive"}
                  className="h-7 px-2.5 text-xs"
                  disabled={togglingId === f.invoiceFileId}
                  onClick={() => void togglePaid(f)}
                >
                  {PAID_LABELS[f.paidStatus] ?? f.paidStatus}
                </Button>

                {/* View file */}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setViewerFile(f)}
                >
                  View file
                </Button>

                {/* Delete */}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteTarget(f)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {viewerFile && (
        <FileViewerDialog
          url={viewerFile.fileUrl}
          fileName={viewerFile.fileName}
          mimeType="application/pdf"
          onRename={(newName) => handleRename(viewerFile.invoiceFileId, newName)}
          onDelete={() => {
            setViewerFile(null);
            setDeleteTarget(viewerFile);
          }}
          onClose={() => setViewerFile(null)}
        />
      )}

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={() => { if (deleteTarget) void handleDelete(deleteTarget.invoiceFileId); }}
        name={deleteTarget?.fileName}
        noun="invoice"
      />
    </>
  );
}

export default ProjectInvoicesPanel;
