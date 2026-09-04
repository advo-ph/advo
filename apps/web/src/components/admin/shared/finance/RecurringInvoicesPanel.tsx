/**
 * RecurringInvoicesPanel — right column of the Finance tab.
 *
 * State A (no recurring fee configured):
 *   - "Start Billing Date" button → popup with calendar, frequency, amount field.
 *
 * State B (recurring fee configured):
 *   - Status selector: Active | Paused | Cancelled
 *   - Upload button: store recurring invoice PDFs linked to the recurring fee.
 *   - List of uploaded recurring invoice files.
 */

import { useState, useRef, useEffect } from "react";
import { Upload, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Panel, Empty } from "@/components/admin/_ui";
import { FileViewerDialog } from "@/components/admin/shared/FileViewerDialog";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import { formatCurrency } from "@/types/admin";
import { get, post, patch, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { InvoiceFile } from "./ProjectInvoicesPanel";

// ─── Types ────────────────────────────────────────────

export interface RecurringFee {
  recurringFeeId: number;
  projectId: number;
  label: string;
  amountCents: number;
  billingInterval: string;
  billingDayOfMonth: number;
  status: "active" | "paused" | "cancelled";
  startsOn: string;
  endsOn: string | null;
  nextRunOn: string;
  lastGeneratedOn: string | null;
  derived?: {
    nextRunOn?: string;
    isSuspensionJustified?: boolean;
  };
}

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  cancelled: "Cancelled",
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

// ─── Helpers ──────────────────────────────────────────

function toISODate(d: Date): string {
  // YYYY-MM-DD in local time
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Start Billing Dialog ─────────────────────────────

interface StartBillingDialogProps {
  onConfirm: (startDate: string, frequency: string, amountCents: number) => void;
  onClose: () => void;
  isConfirming: boolean;
}

function StartBillingDialog({ onConfirm, onClose, isConfirming }: StartBillingDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [frequency, setFrequency] = useState("monthly");
  const [amountRaw, setAmountRaw] = useState("");

  const handleConfirm = () => {
    const amount = parseInt(amountRaw.replace(/[^0-9]/g, ""), 10);
    if (!selectedDate) return;
    if (isNaN(amount) || amount <= 0) return;
    const startDate = toISODate(selectedDate);
    // Convert peso to cents
    onConfirm(startDate, frequency, amount * 100);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Start billing date</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Calendar */}
          <div>
            <p className="mb-1.5 text-sm font-medium">Start date</p>
            <div className="rounded-md border border-border">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                initialFocus
              />
            </div>
            {selectedDate && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {selectedDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            )}
          </div>

          {/* Frequency */}
          <div>
            <p className="mb-1.5 text-sm font-medium">Frequency</p>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="annual">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div>
            <p className="mb-1.5 text-sm font-medium">Amount</p>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm font-medium text-muted-foreground">₱</span>
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="3000"
                value={amountRaw}
                onChange={(e) => setAmountRaw(e.target.value)}
                className="h-9"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Whole pesos only.</p>
          </div>

          <Button
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleConfirm}
            disabled={isConfirming || !selectedDate || !amountRaw}
          >
            {isConfirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Component ────────────────────────────────────────

interface RecurringInvoicesPanelProps {
  projectId: number;
  /** Called when files change so the parent can refresh stat cards. */
  onFilesChange?: (files: InvoiceFile[]) => void;
  /** Called when the recurring fee itself changes. */
  onFeeChange?: (fee: RecurringFee | null) => void;
}

export function RecurringInvoicesPanel({
  projectId,
  onFilesChange,
  onFeeChange,
}: RecurringInvoicesPanelProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fee, setFee] = useState<RecurringFee | null>(null);
  const [files, setFiles] = useState<InvoiceFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [viewerFile, setViewerFile] = useState<InvoiceFile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InvoiceFile | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const fetchData = () => {
    setIsLoading(true);
    Promise.all([
      get<RecurringFee[]>(`/api/recurring-fee?projectId=${projectId}`),
      get<InvoiceFile[]>(`/api/invoices/files?projectId=${projectId}`),
    ])
      .then(([feeRes, fileRes]) => {
        const fees = (feeRes.data || []) as RecurringFee[];
        const activeFee = fees.find((f) => f.status !== "cancelled") ?? fees[0] ?? null;
        setFee(activeFee);
        onFeeChange?.(activeFee);

        // Only show files linked to this recurring fee
        const recurringFiles = (fileRes.data || []).filter(
          (f) => f.recurringFeeId != null,
        );
        setFiles(recurringFiles);
        onFilesChange?.(recurringFiles);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleStartBilling = async (startDate: string, frequency: string, amountCents: number) => {
    setIsConfirming(true);
    try {
      const res = await post<RecurringFee>("/api/recurring-fee", {
        projectId,
        label: "Recurring fee",
        amountCents,
        billingInterval: frequency,
        startsOn: startDate,
      });
      if (res.error || !res.data) {
        toast({ title: "Error", description: res.error ?? "Unknown error", variant: "destructive" });
        return;
      }
      setFee(res.data);
      onFeeChange?.(res.data);
      setShowStartDialog(false);
      toast({ title: "Billing started." });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsConfirming(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!fee) return;
    const { error } = await patch(`/api/recurring-fee/${fee.recurringFeeId}`, { status: newStatus });
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
      return;
    }
    const updated = { ...fee, status: newStatus as RecurringFee["status"] };
    setFee(updated);
    onFeeChange?.(updated);
    toast({ title: "Status updated." });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!fee) return;
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("projectId", String(projectId));
      formData.append("recurringFeeId", String(fee.recurringFeeId));
      formData.append("file", file);

      const res = await post<InvoiceFile>("/api/invoices/files/upload", formData);
      if (res.error || !res.data) {
        toast({ title: "Upload failed", description: res.error ?? "Unknown error", variant: "destructive" });
        return;
      }
      const updated = [...files, res.data].sort((a, b) => a.fileNumber - b.fileNumber);
      setFiles(updated);
      onFilesChange?.(updated);
      toast({ title: "Recurring invoice uploaded." });
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

  // ─── Panel header action ───────────────────────────

  const headerAction = fee ? (
    <div className="flex items-center gap-2">
      <Select value={fee.status} onValueChange={(v) => void handleStatusChange(v)}>
        <SelectTrigger className="h-7 w-[110px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="paused">Paused</SelectItem>
          <SelectItem value="cancelled">Cancelled</SelectItem>
        </SelectContent>
      </Select>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleFileSelect}
      />
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2.5 text-xs"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
      >
        {isUploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        <span className="ml-1.5">Upload</span>
      </Button>
    </div>
  ) : (
    <Button
      size="sm"
      onClick={() => setShowStartDialog(true)}
    >
      Start billing date
    </Button>
  );

  return (
    <>
      <Panel title="Recurring invoices" action={headerAction}>
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !fee ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <Empty text="No recurring billing set up yet." />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <Empty text="No recurring invoices uploaded yet." />
            <p className="text-xs text-muted-foreground">
              Status: <span className="font-medium">{STATUS_LABELS[fee.status]}</span>
              {" · "}
              {fee.amountCents ? formatCurrency(fee.amountCents) : "—"} / {fee.billingInterval}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {files.map((f) => (
              <div
                key={f.invoiceFileId}
                className="flex flex-wrap items-center gap-2 px-4 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.fileName}</span>

                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {f.totalCents != null ? formatCurrency(f.totalCents) : "—"}
                </span>

                <Button
                  size="sm"
                  variant={PAID_VARIANT[f.paidStatus] as "outline" | "default" | "destructive"}
                  className="h-7 px-2.5 text-xs"
                  disabled={togglingId === f.invoiceFileId}
                  onClick={() => void togglePaid(f)}
                >
                  {PAID_LABELS[f.paidStatus] ?? f.paidStatus}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setViewerFile(f)}
                >
                  View file
                </Button>

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

      {showStartDialog && (
        <StartBillingDialog
          onConfirm={handleStartBilling}
          onClose={() => setShowStartDialog(false)}
          isConfirming={isConfirming}
        />
      )}

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

export default RecurringInvoicesPanel;
