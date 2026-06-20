import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, del, post, upload } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export interface ProjectAsset {
  asset_id: number;
  asset_type: string;
  url: string;
  caption?: string | null;
  uploaded_at: string;
}

function mapAsset(a: Record<string, unknown>): ProjectAsset {
  return {
    asset_id: (a.projectAssetId ?? a.project_asset_id) as number,
    asset_type: (a.assetType ?? a.asset_type ?? "document") as string,
    url: a.url as string,
    caption: (a.caption ?? null) as string | null,
    uploaded_at: (a.uploadedAt ?? a.uploaded_at ?? "") as string,
  };
}

// Per-project file drive: list / upload (storage + record) / delete.
export function useProjectAssets(projectId: number) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const queryKey = ["projectAssets", projectId];

  const { data: assets = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await get<Record<string, unknown>[]>(`/api/projects/${projectId}/assets`);
      return (res.data || []).map(mapAsset);
    },
    staleTime: 60 * 1000,
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, caption }: { file: File; caption?: string }) => {
      const up = await upload(file, "assets");
      if (up.error || !up.url) throw new Error(up.error || "Upload failed");
      const assetType = file.type.startsWith("image/") ? "progress_photo" : "document";
      const res = await post(`/api/projects/${projectId}/assets`, {
        url: up.url,
        caption: caption || null,
        assetType,
      });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast({ title: "Uploaded", description: "File added to the project" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (assetId: number) => {
      const res = await del(`/api/projects/${projectId}/assets/${assetId}`);
      if (res.error) throw new Error(res.error);
    },
    onMutate: async (assetId) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<ProjectAsset[]>(queryKey);
      qc.setQueryData<ProjectAsset[]>(queryKey, (old = []) => old.filter((a) => a.asset_id !== assetId));
      return { prev };
    },
    onError: (e: Error, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
    onSuccess: () => toast({ title: "Deleted", description: "File removed" }),
  });

  return {
    assets,
    isLoading,
    uploadFile: (file: File, caption?: string) => uploadMutation.mutateAsync({ file, caption }),
    deleteAsset: deleteMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
  };
}
