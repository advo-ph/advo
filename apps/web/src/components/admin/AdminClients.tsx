import { useState } from "react";
import {
  Building2,
  ExternalLink,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  Loader2,
  Search,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import * as db from "@/lib/db";
import { post } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { Client } from "@/types/admin";
import { PageHeader, Table, THead, TBody, TRow, Empty } from "./_ui";

interface AdminClientsProps {
  clients: Client[];
  isLoading: boolean;
  onRefresh: () => void | Promise<unknown>;
}

const AdminClients = ({ clients, isLoading, onRefresh }: AdminClientsProps) => {
  const { toast } = useToast();

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    company_name: "",
    contact_email: "",
    github_org_name: "",
    brand_color_hex: "#22C55E",
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [invitingClient, setInvitingClient] = useState<number | null>(null);

  const filteredClients = clients.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (c.company_name || "").toLowerCase().includes(q) ||
      (c.contact_email || "").toLowerCase().includes(q);
  });

  const handleInvite = async (client: Client) => {
    setInvitingClient(client.client_id);
    try {
      const res = await post(`/api/clients/${client.client_id}/invite`, {});
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" });
      } else {
        toast({ title: "Invite sent", description: `Welcome email sent to ${client.contact_email}` });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Unable to invite client",
        variant: "destructive",
      });
    } finally {
      setInvitingClient(null);
    }
  };

  const openCreateDialog = () => {
    setEditingClient(null);
    setFormData({
      company_name: "",
      contact_email: "",
      github_org_name: "",
      brand_color_hex: "#22C55E",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (client: Client) => {
    setEditingClient(client);
    setFormData({
      company_name: client.company_name || "",
      contact_email: client.contact_email || "",
      github_org_name: client.github_org_name || "",
      brand_color_hex: client.brand_color_hex || "#22C55E",
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
          github_org_name: formData.github_org_name || null,
          brand_color_hex: formData.brand_color_hex,
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
          github_org_name: formData.github_org_name || null,
          brand_color_hex: formData.brand_color_hex,
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
      {/* Header */}
      <PageHeader
        title="Clients"
        meta={`${clients.length} total`}
        action={
          <Button
            onClick={openCreateDialog}
            size="sm"
            className="h-9 bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New client
          </Button>
        }
      />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search clients…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* Client List */}
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
            text={searchQuery ? "No clients match your search" : "No clients yet"}
            icon={Building2}
          />
          {!searchQuery && (
            <div className="flex justify-center pb-8">
              <Button
                onClick={openCreateDialog}
                size="sm"
                className="h-9 bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                New client
              </Button>
            </div>
          )}
        </Table>
      ) : (
        <Table>
          <THead>
            <span className="flex-1 min-w-0">Client</span>
            <span className="hidden md:block flex-1 min-w-0">Email</span>
            <span className="hidden lg:block w-44 shrink-0">GitHub</span>
            <span className="w-20 shrink-0 text-right">Projects</span>
            <span className="w-[188px] shrink-0" />
          </THead>
          <TBody>
            {filteredClients.map((client) => (
              <TRow key={client.client_id}>
                <span className="flex-1 min-w-0 flex items-center gap-2.5">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: client.brand_color_hex || "#22C55E" }}
                  />
                  <span className="font-medium truncate">
                    {client.company_name || "Unnamed Client"}
                  </span>
                </span>

                <span className="hidden md:block flex-1 min-w-0 text-muted-foreground truncate">
                  {client.contact_email || "—"}
                </span>

                <span className="hidden lg:block w-44 shrink-0 truncate">
                  {client.github_org_name ? (
                    <a
                      href={`https://github.com/${client.github_org_name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-accent hover:underline"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate">{client.github_org_name}</span>
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </span>

                <span className="w-20 shrink-0 text-right text-muted-foreground tabular-nums">
                  {client.projectCount || 0}
                </span>

                <span className="w-[188px] shrink-0 flex items-center justify-end gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-accent hover:bg-accent/10"
                    disabled={invitingClient === client.client_id}
                    onClick={() => handleInvite(client)}
                  >
                    {invitingClient === client.client_id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="h-3.5 w-3.5" />
                    )}
                    Invite
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => openEditDialog(client)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => {
                      setDeletingClient(client);
                      setIsDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </span>
              </TRow>
            ))}
          </TBody>
        </Table>
      )}

      {/* Create/Edit Client Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg rounded-lg">
          <DialogHeader>
            <DialogTitle>
              {editingClient ? "Edit Client" : "New Client"}
            </DialogTitle>
            <DialogDescription>
              Save the client details used across admin projects, notifications, and invites.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Company Name</label>
              <Input
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                placeholder="Acme Corp"
                autoComplete="organization"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Contact Email</label>
              <Input
                type="email"
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                placeholder="contact@company.com"
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">GitHub Org (optional)</label>
              <Input
                value={formData.github_org_name}
                onChange={(e) => setFormData({ ...formData, github_org_name: e.target.value })}
                placeholder="acme-corp"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Brand Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.brand_color_hex}
                  onChange={(e) => setFormData({ ...formData, brand_color_hex: e.target.value })}
                  className="w-10 h-10 rounded-lg border border-border cursor-pointer"
                />
                <Input
                  value={formData.brand_color_hex}
                  onChange={(e) => setFormData({ ...formData, brand_color_hex: e.target.value })}
                  placeholder="#22C55E"
                  className="tabular-nums"
                />
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
