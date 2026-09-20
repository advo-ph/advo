import { useState, useRef } from "react";
import { Instagram, Linkedin, Twitter, Calendar, Clock, Image, Heart, MessageCircle, Share2, Plus, Trash2, Edit, Loader2, Upload, Grid3X3, Bookmark, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { upload } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAdminSocial, type SocialPost } from "@/hooks/useAdminSocial";
import { PageHeader, StatStrip, Stat, Panel } from "./_ui";

const platformConfig = {
  instagram: { icon: Instagram, color: "text-pink-500", bg: "bg-pink-500/10", label: "Instagram" },
  linkedin: { icon: Linkedin, color: "text-blue-600", bg: "bg-blue-600/10", label: "LinkedIn" },
  twitter: { icon: Twitter, color: "text-sky-500", bg: "bg-sky-500/10", label: "Twitter" },
};

const AdminSocial = () => {
  const { posts, isLoading, createPost, updatePost, deletePost, isSaving } = useAdminSocial();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);
  const [previewPost, setPreviewPost] = useState<SocialPost | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("queue");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    platform: "instagram",
    content: "",
    image_url: "",
    scheduled_date: "",
    scheduled_time: "",
  });

  // Auto-pick the first unpublished IG post for the preview pane
  if (!previewPost && posts.length > 0) {
    const firstIg = posts.find((p) => p.platform === "instagram" && !p.is_published);
    if (firstIg) setPreviewPost(firstIg);
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    setIsUploading(true);

    try {
      const result = await upload(file, "assets");

      if (result.error) {
        toast({ title: "Upload failed", description: result.error, variant: "destructive" });
        return;
      }

      setFormData(prev => ({ ...prev, image_url: result.url }));
      toast({ title: "Image uploaded", description: "Ready to use" });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unable to upload image",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const openCreateDialog = () => {
    setSelectedPost(null);
    setFormData({
      platform: "instagram",
      content: "",
      image_url: "",
      scheduled_date: "",
      scheduled_time: "",
    });
    setImagePreview(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (post: SocialPost) => {
    setSelectedPost(post);
    const scheduledDate = post.scheduled_for ? new Date(post.scheduled_for) : null;
    setFormData({
      platform: post.platform,
      content: post.content,
      image_url: post.image_url || "",
      scheduled_date: scheduledDate ? scheduledDate.toISOString().split("T")[0] : "",
      scheduled_time: scheduledDate ? scheduledDate.toTimeString().slice(0, 5) : "",
    });
    setImagePreview(post.image_url);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.content.trim()) {
      toast({ title: "Error", description: "Content is required", variant: "destructive" });
      return;
    }

    const scheduledFor = formData.scheduled_date && formData.scheduled_time
      ? new Date(`${formData.scheduled_date}T${formData.scheduled_time}`).toISOString()
      : undefined;

    const input = {
      platform: formData.platform,
      content: formData.content,
      image_url: formData.image_url || undefined,
      scheduled_for: scheduledFor,
    };

    // The dialog used to close HERE, before the await below. That made
    // `disabled={isSaving}` and the spinner in the footer unreachable code: the
    // dialog was already gone by the time either could render. Worse, a failed
    // save threw the user's typed caption away along with the dialog, leaving
    // only an error toast and nothing to retry with.
    //
    // Close only once the server has taken it. On failure the dialog stays open
    // with the text still in it, and the hook's onError provides the toast.
    try {
      if (selectedPost) {
        await updatePost(selectedPost.social_post_id, input);
      } else {
        await createPost(input);
      }
      setIsDialogOpen(false);
    } catch {
      // Hook surfaces the toast. The dialog deliberately stays open.
    }
  };

  const handleDelete = async (postId: number) => {
    try {
      await deletePost(postId);
    } catch {
      // Hook surfaces the toast
    }
  };

  const scheduledPosts = posts.filter(p => !p.is_published);
  const instagramPosts = scheduledPosts.filter(p => p.platform === "instagram");

  return (
    <div className="space-y-4">
      {/* Header */}
      <PageHeader
        title="Social Media"
        meta="Preview and manage social content"
        action={
          <Button
            onClick={openCreateDialog}
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Create post
          </Button>
        }
      />

      {/* Platform queue counts — not live follower stats */}
      <StatStrip cols={3}>
        {Object.entries(platformConfig).map(([platform]) => {
          const queueCount = posts.filter((p) => p.platform === platform && !p.is_published).length;
          return (
            <Stat
              key={platform}
              label={platformConfig[platform as keyof typeof platformConfig].label}
              value={String(queueCount)}
              sub="in queue"
            />
          );
        })}
      </StatStrip>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="queue" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Post Queue
          </TabsTrigger>
          <TabsTrigger value="feed" className="flex items-center gap-2">
            <Grid3X3 className="h-4 w-4" />
            Feed Preview
          </TabsTrigger>
        </TabsList>

        {/* Post Queue Tab */}
        <TabsContent value="queue" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Scheduled Posts List */}
            <Panel
              title="Scheduled posts"
              meta={`${scheduledPosts.length}`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : scheduledPosts.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm text-muted-foreground">No scheduled posts yet. Add one to get started.</p>
                  <Button variant="link" size="sm" className="text-accent-ink" onClick={openCreateDialog}>
                    Add a post
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
                  {scheduledPosts.map((post) => {
                    const platform = platformConfig[post.platform as keyof typeof platformConfig] || platformConfig.instagram;
                    const PlatformIcon = platform.icon;
                    const isSelected = previewPost?.social_post_id === post.social_post_id;

                    return (
                      <div
                        key={post.social_post_id}
                        onClick={() => setPreviewPost(post)}
                        className={`group cursor-pointer transition-colors px-4 py-3 hover:bg-secondary/40 ${
                          isSelected ? "bg-accent/[0.06]" : ""
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {post.image_url ? (
                            <img
                              src={post.image_url}
                              alt="Post preview"
                              className="w-12 h-12 rounded-md object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-md bg-secondary flex items-center justify-center shrink-0">
                              <Image className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                <PlatformIcon className={`h-3.5 w-3.5 ${platform.color}`} />
                                {platform.label}
                              </span>
                              {post.scheduled_for && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {new Date(post.scheduled_for).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })}
                                </span>
                              )}
                            </div>
                            <p className="text-sm line-clamp-2">{post.content}</p>
                          </div>

                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 shrink-0">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEditDialog(post); }}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleDelete(post.social_post_id); }}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            {/* Single Post Preview */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Instagram className="h-4 w-4" />
                Post preview
              </h3>

              <div className="bg-card border border-border rounded-lg overflow-hidden">
                {/* Instagram Header */}
                <div className="p-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center">
                      <span className="text-white text-xs font-bold">A</span>
                    </div>
                    <span className="font-semibold text-sm">advo_ph</span>
                  </div>
                  <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                </div>
                
                {/* Image */}
                <div className="aspect-square bg-secondary">
                  {previewPost?.image_url ? (
                    <img
                      src={previewPost.image_url}
                      alt="Instagram preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                      <div className="text-center">
                        <Image className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Select a post to preview</p>
                      </div>
                    </div>
                  )}
                </div>
                
                {/*
                  Instagram's action row, drawn so the caption sits where it will
                  on the real post. These are NOT controls. They had
                  `cursor-pointer` and hover colours and no onClick, so they
                  invited a click and then did nothing, which is a large part of
                  "I press some buttons and it doesn't even work".

                  ADVO does not post to Instagram from here, so there is nothing
                  honest to wire them to. The affordance is removed instead: no
                  pointer cursor, no hover state, muted, and hidden from
                  assistive tech since they carry no information.
                */}
                <div className="p-3">
                  <div className="flex items-center justify-between mb-3" aria-hidden="true">
                    <div className="flex items-center gap-4">
                      <Heart className="h-6 w-6 text-muted-foreground/40" />
                      <MessageCircle className="h-6 w-6 text-muted-foreground/40" />
                      <Share2 className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                    <Bookmark className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm">
                    <span className="font-semibold">advo_ph</span>{" "}
                    <span>{previewPost?.content || "Your caption will appear here..."}</span>
                  </p>
                  {previewPost?.scheduled_for && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Scheduled for {new Date(previewPost.scheduled_for).toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Feed Preview Tab */}
        <TabsContent value="feed" className="mt-4">
          {/* Instagram Profile Preview */}
          <div className="bg-card border border-border rounded-lg overflow-hidden max-w-2xl mx-auto">
            {/* Profile Header */}
            <div className="p-6 border-b border-border">
              <div className="flex items-center gap-8">
                {/* Profile Picture */}
                <div className="w-20 h-20 rounded-full bg-black flex items-center justify-center shrink-0">
                  <img src="/advo-logo-white.png" alt="ADVO" className="w-12 h-12 object-contain" />
                </div>
                
                {/* Profile Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-3">
                    <h2 className="text-xl font-semibold">advo_ph</h2>
                    <Badge variant="outline" className="text-xs">Business</Badge>
                  </div>
                  
                  <div className="flex items-center gap-6 text-sm mb-3">
                    <div><span className="font-semibold">{instagramPosts.length}</span> scheduled</div>
                  </div>
                  
                  <div className="text-sm">
                    <p className="font-semibold">Advo</p>
                    <p className="text-muted-foreground">We digitalize it for you.</p>
                    <p className="text-muted-foreground">for inquiries: contact@advo.ph</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/*
              A one-item header, not a tab strip. It was a <button> with no
              onClick and no type, so it looked pressable, did nothing when
              pressed, and (having no type) would have submitted any enclosing
              form. There is only ever one grid here, so it is a label.
            */}
            <div className="border-b border-border">
              <div className="flex justify-center">
                <div className="flex items-center gap-2 px-6 py-3 border-t-2 border-foreground text-muted-foreground">
                  <Grid3X3 className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-wider font-medium">Posts</span>
                </div>
              </div>
            </div>
            
            {/* Posts Grid - Shows scheduled posts first, then existing */}
            <div className="grid grid-cols-3 gap-0.5 bg-border">
              {/* Scheduled posts (upcoming) */}
              {instagramPosts.map((post) => (
                <div
                  key={post.social_post_id}
                  className={`aspect-square bg-card relative cursor-pointer group ${
                    previewPost?.social_post_id === post.social_post_id ? "ring-2 ring-accent ring-inset" : ""
                  }`}
                  onClick={() => setPreviewPost(post)}
                >
                  {post.image_url ? (
                    <img
                      src={post.image_url}
                      alt="Scheduled post"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                      <Image className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  {/* Scheduled overlay */}
                  <div className="absolute top-2 left-2">
                    <Badge className="bg-accent text-accent-foreground text-[10px] px-1.5 py-0.5">
                      <Clock className="h-2.5 w-2.5 mr-1" />
                      Scheduled
                    </Badge>
                  </div>
                  {/*
                    This overlay used to show a like count and a comment count,
                    both hard-coded to 0. ADVO never reads engagement from
                    Instagram, so those were not "no engagement yet", they were
                    two numbers presented as data that no source stands behind.
                    The tile's click sets the preview pane, so it says that.
                  */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-xs uppercase tracking-wider font-medium text-white">
                      Preview
                    </span>
                  </div>
                </div>
              ))}
              
            </div>
            
            {/* Empty slots preview */}
            {instagramPosts.length === 0 && (
              <div className="p-8 text-center">
                <p className="text-muted-foreground text-sm">
                  Schedule Instagram posts to see how your feed will look
                </p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedPost ? "Edit Post" : "Create Post"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Platform */}
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select
                value={formData.platform}
                onValueChange={(value) => setFormData(prev => ({ ...prev, platform: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(platformConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <config.icon className={`h-4 w-4 ${config.color}`} />
                        {config.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Image Upload */}
            <div className="space-y-2">
              <Label>Image</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              {imagePreview ? (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="absolute top-2 right-2"
                    onClick={() => {
                      setImagePreview(null);
                      setFormData(prev => ({ ...prev, image_url: "" }));
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full h-32 border-dashed"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-6 w-6" />
                      <span>Click to upload image</span>
                    </div>
                  )}
                </Button>
              )}
            </div>

            {/* Content */}
            <div className="space-y-2">
              <Label>Caption</Label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                placeholder="What's on your mind?"
                rows={4}
              />
            </div>

            {/* Schedule */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduled_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={formData.scheduled_time}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduled_time: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {selectedPost ? "Update Post" : "Schedule Post"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSocial;
