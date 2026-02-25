import { useState } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  Mail,
  FolderKanban,
  ExternalLink,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import * as db from "@/lib/db";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { Client } from "@/types/admin";

interface AdminClientsProps {
  clients: Client[];
  isLoading: boolean;
  onRefresh: () => Promise<void>;
}

const AdminClients = ({ clients, isLoading, onRefresh }: AdminClientsProps) => {
  const { toast } = useToast();
  const { user } = useAuth();

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
    if (!formData.company_name || !formData.contact_email) {
      toast({ title: "Error", description: "Company name and email are required", variant: "destructive" });
      return;
    }

    setIsSaving(true);

    if (editingClient) {
      const { error } = await db.updateClient(editingClient.client_id, {
          company_name: formData.company_name,
          contact_email: formData.contact_email,
          github_org_name: formData.github_org_name || null,
          brand_color_hex: formData.brand_color_hex,
        });

      if (error) {
        toast({ title: "Error", description: error, variant: "destructive" });
      } else {
        toast({ title: "Success", description: "Client updated" });
        setIsDialogOpen(false);
        onRefresh();
      }
    } else {
      // Creating a new client — associate with current user
      const { error } = await db.createClient({
        user_id: user?.id,
        company_name: formData.company_name,
        contact_email: formData.contact_email,
        github_org_name: formData.github_org_name || null,
        brand_color_hex: formData.brand_color_hex,
      });

      if (error) {
        toast({ title: "Error", description: error, variant: "destructive" });
      } else {
        toast({ title: "Success", description: "Client created" });
        setIsDialogOpen(false);
        onRefresh();
      }
    }

    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!deletingClient) return;

    const { error } = await db.deleteClient(deletingClient.client_id);

    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "Client deleted" });
      setIsDeleteDialogOpen(false);
      setDeletingClient(null);
      onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-2">Clients</h1>
          <p className="text-muted-foreground">Manage your client relationships</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-muted-foreground">
            {clients.length} total
          </span>
          <Button onClick={openCreateDialog} className="rounded-full bg-foreground text-background hover:bg-foreground/90">
            <Plus className="h-4 w-4 mr-2" />
            New Client
          </Button>
        </div>
      </div>

      {/* Client List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-secondary animate-pulse rounded-xl" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No clients yet</p>
          <p className="text-sm text-muted-foreground mt-2">
            Add your first client to get started
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {clients.map((client, index) => (
            <motion.div
              key={client.client_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="p-5 bg-card border border-border rounded-xl shadow-card hover:border-accent/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  {/* Color Badge */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${client.brand_color_hex || '#22C55E'}20` }}
                  >
                    <Building2
                      className="h-6 w-6"
                      style={{ color: client.brand_color_hex || '#22C55E' }}
                    />
                  </div>

                  <div>
                    <h3 className="font-semibold text-lg">
                      {client.company_name || "Unnamed Client"}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" />
                      {client.contact_email}
                    </div>
                    {client.github_org_name && (
                      <a
                        href={`https://github.com/${client.github_org_name}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 mt-2 text-xs text-accent hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        github.com/{client.github_org_name}
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="gap-1">
                    <FolderKanban className="h-3 w-3" />
                    {client.projectCount || 0} projects
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditDialog(client)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDeletingClient(client);
                      setIsDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create/Edit Client Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg rounded-xl">
          <DialogHeader>
            <DialogTitle>
              {editingClient ? "Edit Client" : "New Client"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Company Name</label>
              <Input
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                placeholder="Acme Corp"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Contact Email</label>
              <Input
                type="email"
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                placeholder="contact@company.com"
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
                  className="font-mono"
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
        <AlertDialogContent className="bg-card border-border rounded-xl">
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
