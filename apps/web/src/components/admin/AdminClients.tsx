import { useState } from "react";
import {
  Building2,
  Plus,
  Trash2,
  Save,
  Loader2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import * as db from "@/lib/db";
import { useToast } from "@/hooks/use-toast";
import { useRoles } from "@/hooks/useRoles";
import type { Client } from "@/types/admin";
import { PageHeader, Table, TBody, Empty } from "./_ui";

type ClientFormData = {
  company_name: string;
  contact_email: string;
};

function ClientFormFields({
  formData,
  onChange,
}: {
  formData: ClientFormData;
  onChange: (next: ClientFormData) => void;
}) {
  return (
    <div className="grid gap-4 py-2">
      <div className="space-y-2">
        <label className="text-sm font-medium">Company Name</label>
        <Input
          value={formData.company_name}
          onChange={(e) => onChange({ ...formData, company_name: e.target.value })}
          placeholder="Acme Corp"
          autoComplete="organization"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Contact Email</label>
        <Input
          type="email"
          value={formData.contact_email}
          onChange={(e) => onChange({ ...formData, contact_email: e.target.value })}
          placeholder="contact@company.com"
          autoComplete="email"
        />
      </div>
    </div>
  );
}

interface AdminClientsProps {
  clients: Client[];
  isLoading: boolean;
  onRefresh: () => void | Promise<unknown>;
}

const AdminClients = ({ clients, isLoading, onRefresh }: AdminClientsProps) => {
  const { toast } = useToast();
  const { isOwner } = useRoles();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    company_name: "",
    contact_email: "",
  });

  const [searchQuery, setSearchQuery] = useState("");

  const filteredClients = clients.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (c.company_name || "").toLowerCase().includes(q) ||
      (c.contact_email || "").toLowerCase().includes(q);
  });

  const openCreateDialog = () => {
    setEditingClient(null);
    setFormData({
      company_name: "",
      contact_email: "",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (client: Client) => {
    setEditingClient(client);
    setFormData({
      company_name: client.company_name || "",
      contact_email: client.contact_email || "",
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.company_name) {
      toast({ title: "Error", description: "Company name is required", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      let error: string | null;

      if (editingClient) {
        ({ error } = await db.updateClient(editingClient.client_id, {
          company_name: formData.company_name,
          contact_email: formData.contact_email || undefined,
        }));

        if (error) {
          toast({ title: "Error", description: error, variant: "destructive" });
        } else {
          toast({ title: "Success", description: "Client updated" });
          setIsDialogOpen(false);
          onRefresh();
        }
      } else {
        ({ error } = await db.createClient({
          company_name: formData.company_name,
          contact_email: formData.contact_email || undefined,
        }));

        if (error) {
          toast({ title: "Error", description: error, variant: "destructive" });
        } else {
          toast({ title: "Success", description: "Client created" });
          setIsDialogOpen(false);
          onRefresh();
        }
      }
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unable to save client",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingClient) return;

    try {
      const { error } = await db.deleteClient(deletingClient.client_id);

      if (error) {
        toast({ title: "Error", description: error, variant: "destructive" });
      } else {
        toast({ title: "Deleted", description: "Client deleted" });
        setIsDeleteDialogOpen(false);
        setDeletingClient(null);
        onRefresh();
      }
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unable to delete client",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clients"
        meta={`${clients.length} total`}
        action={
          <Button
            onClick={openCreateDialog}
            size="sm"
            className="h-9 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New client
          </Button>
        }
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search clients…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {isLoading ? (
        <div className="border border-border rounded-lg bg-card overflow-hidden">
          <div className="divide-y divide-border">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-11 bg-secondary/40 animate-pulse" />
            ))}
          </div>
        </div>
      ) : filteredClients.length === 0 ? (
        <Table>
          <Empty
            text={searchQuery ? "No clients match your search" : "No clients yet. Add your first client to start tracking projects."}
            icon={Building2}
          />
          {!searchQuery && (
            <div className="flex justify-center pb-8">
              <Button
                onClick={openCreateDialog}
                size="sm"
                className="h-9 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                New client
              </Button>
            </div>
          )}
        </Table>
      ) : (
        <div className="border border-border rounded-lg bg-card overflow-hidden divide-y divide-border">
          {filteredClients.map((client) => {
            const name = client.company_name || "Unnamed Client";
            const initial = name.charAt(0).toUpperCase();
            const count = client.projectCount || 0;

            return (
              <div
                key={client.client_id}
                onClick={() => openEditDialog(client)}
                className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-secondary/40 transition-colors cursor-pointer"
              >
                <span className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold shrink-0">
                  {initial}
                </span>

                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{name}</span>
                  <span className="block text-xs text-muted-foreground truncate mt-0.5">
                    {client.contact_email || "No email"}
                  </span>
                </span>

                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {count} {count === 1 ? "project" : "projects"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg rounded-lg">
          <DialogHeader>
            <DialogTitle>{editingClient ? "Edit client" : "New client"}</DialogTitle>
          </DialogHeader>
          <ClientFormFields formData={formData} onChange={setFormData} />
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            {editingClient && isOwner ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => {
                  setDeletingClient(editingClient);
                  setIsDialogOpen(false);
                  setIsDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deletingClient?.company_name || "this client"}" and all associated projects. This action cannot be undone.
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

export default AdminClients;
