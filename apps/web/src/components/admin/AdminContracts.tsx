import { useMemo, useState } from "react";
import { Plus, Trash2, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { PageHeader, StatStrip, Stat, Table, THead, TBody, TRow, Empty, Dot } from "./_ui";
import { useContracts, type Contract, type ContractInput } from "@/hooks/useContracts";
import { formatCurrency, type Client } from "@/types/admin";

/* Contract types + statuses must match the app-side enums in contracts.routes.ts. */
const TYPES = [
  { value: "contract", label: "Contract" },
  { value: "moa", label: "MOA" },
  { value: "sow", label: "SOW" },
  { value: "nda", label: "NDA" },
  { value: "retainer", label: "Retainer" },
];

const STATUSES = [
  { value: "draft", label: "Draft", dot: "bg-muted-foreground" },
  { value: "sent", label: "Sent", dot: "bg-blue-500" },
  { value: "signed", label: "Signed", dot: "bg-teal-500" },
  { value: "active", label: "Active", dot: "bg-emerald-500" },
  { value: "expired", label: "Expired", dot: "bg-amber-500" },
  { value: "terminated", label: "Terminated", dot: "bg-rose-500" },
];

const typeLabel = (v: string) => TYPES.find((t) => t.value === v)?.label ?? v;
const statusMeta = (v: string) =>
  STATUSES.find((s) => s.value === v) ?? { value: v, label: v, dot: "bg-muted-foreground" };

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";
const dateInput = (iso: string | null) => (iso ? new Date(iso).toISOString().split("T")[0] : "");
const toIso = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : null);

interface FormState {
  id: number | null; // null = create
  clientId: string;
  title: string;
  contractType: string;
  status: string;
  value: string; // peso amount as typed
  signedAt: string; // YYYY-MM-DD
  expiresAt: string;
  documentUrl: string;
  notes: string;
}

const emptyForm = (): FormState => ({
  id: null,
  clientId: "",
  title: "",
  contractType: "contract",
  status: "draft",
  value: "",
  signedAt: "",
  expiresAt: "",
  documentUrl: "",
  notes: "",
});

const AdminContracts = ({ clients }: { clients: Client[] }) => {
  const { contracts, isLoading, createContract, updateContract, deleteContract, isSaving } =
    useContracts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const clientName = (id: number) =>
    clients.find((c) => c.client_id === id)?.company_name ?? "—";

  const totalValue = useMemo(
    () => contracts.reduce((s, c) => s + (c.valueCents || 0), 0),
    [contracts],
  );
  const activeCount = useMemo(
    () => contracts.filter((c) => c.status === "active" || c.status === "signed").length,
    [contracts],
  );

  const openCreate = () => {
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (c: Contract) => {
    setForm({
      id: c.contractId,
      clientId: String(c.clientId),
      title: c.title,
      contractType: c.contractType,
      status: c.status,
      value: c.valueCents ? String(c.valueCents / 100) : "",
      signedAt: dateInput(c.signedAt),
      expiresAt: dateInput(c.expiresAt),
      documentUrl: c.documentUrl ?? "",
      notes: c.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.clientId) return;
    const input: ContractInput = {
      clientId: Number(form.clientId),
      title: form.title.trim(),
      contractType: form.contractType,
      status: form.status,
      valueCents: form.value ? Math.round(parseFloat(form.value) * 100) : 0,
      signedAt: toIso(form.signedAt),
      expiresAt: toIso(form.expiresAt),
      documentUrl: form.documentUrl.trim() || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (form.id) await updateContract(form.id, input);
      else await createContract(input);
      setDialogOpen(false);
    } catch {
      // Hook surfaces the toast.
    }
  };

  const handleDelete = async () => {
    if (!form.id) return;
    try {
      await deleteContract(form.id);
      setDialogOpen(false);
    } catch {
      // Hook surfaces the toast.
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Contracts"
        meta={isLoading ? "loading…" : `${contracts.length} total`}
        action={
          <Button
            size="sm"
            className="h-8 bg-accent text-accent-foreground hover:bg-accent/90 gap-1.5"
            onClick={openCreate}
          >
            <Plus className="h-4 w-4" /> New contract
          </Button>
        }
      />

      <StatStrip cols={3}>
        <Stat label="Contracts" value={String(contracts.length)} />
        <Stat label="Active / signed" value={String(activeCount)} />
        <Stat label="Total value" value={formatCurrency(totalValue)} accent />
      </StatStrip>

      <Table>
        <THead>
          <span className="flex-1">Title</span>
          <span className="w-40 hidden md:block">Client</span>
          <span className="w-20">Type</span>
          <span className="w-28">Status</span>
          <span className="w-28 text-right hidden sm:block">Value</span>
          <span className="w-24 hidden lg:block">Signed</span>
          <span className="w-24 hidden lg:block">Expires</span>
        </THead>
        <TBody>
          {contracts.length === 0 ? (
            <Empty
              text="No contracts yet — add MOAs, SOWs and retainers to track signings and renewals on the calendar."
              icon={FileSignature}
            />
          ) : (
            contracts.map((c) => {
              const sm = statusMeta(c.status);
              return (
                <TRow key={c.contractId} onClick={() => openEdit(c)}>
                  <span className="flex-1 truncate font-medium">{c.title}</span>
                  <span className="w-40 truncate text-muted-foreground hidden md:block">
                    {clientName(c.clientId)}
                  </span>
                  <span className="w-20 text-muted-foreground">{typeLabel(c.contractType)}</span>
                  <span className="w-28 flex items-center gap-1.5">
                    <Dot className={sm.dot} />
                    {sm.label}
                  </span>
                  <span className="w-28 text-right tabular-nums hidden sm:block">
                    {c.valueCents ? formatCurrency(c.valueCents) : "—"}
                  </span>
                  <span className="w-24 text-muted-foreground tabular-nums hidden lg:block">
                    {fmtDate(c.signedAt)}
                  </span>
                  <span className="w-24 text-muted-foreground tabular-nums hidden lg:block">
                    {fmtDate(c.expiresAt)}
                  </span>
                </TRow>
              );
            })
          )}
        </TBody>
      </Table>

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit contract" : "New contract"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Title (e.g. Felici Gelato MOA)"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus
            />

            <div>
              <span className="eyebrow block mb-1">Client</span>
              <Select
                value={form.clientId}
                onValueChange={(v) => setForm((f) => ({ ...f, clientId: v }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.client_id} value={String(c.client_id)}>
                      {c.company_name ?? `Client #${c.client_id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="eyebrow block mb-1">Type</span>
                <Select
                  value={form.contractType}
                  onValueChange={(v) => setForm((f) => ({ ...f, contractType: v }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <span className="eyebrow block mb-1">Status</span>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <span className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                          {s.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <span className="eyebrow block mb-1">Value (₱)</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                className="h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="eyebrow block mb-1">Signed</span>
                <Input
                  type="date"
                  value={form.signedAt}
                  onChange={(e) => setForm((f) => ({ ...f, signedAt: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div>
                <span className="eyebrow block mb-1">Expires</span>
                <Input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>

            <Input
              placeholder="Document URL (optional)"
              value={form.documentUrl}
              onChange={(e) => setForm((f) => ({ ...f, documentUrl: e.target.value }))}
              className="h-9"
            />
            <Textarea
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="min-h-[64px] text-sm"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 sm:justify-between">
            {form.id ? (
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-destructive hover:bg-destructive/10"
                onClick={handleDelete}
                disabled={isSaving}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-9" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-9 bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={handleSave}
                disabled={isSaving || !form.title.trim() || !form.clientId}
              >
                {form.id ? "Save" : "Add contract"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminContracts;
