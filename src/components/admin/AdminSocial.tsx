import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Instagram, Linkedin, Twitter, Calendar, Clock, Image, Heart, MessageCircle, Share2, Plus, Trash2, Edit, Loader2, Upload, Grid3X3, Bookmark, MoreHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SocialPost {
  social_post_id: number;
  platform: string;
  content: string;
  image_url: string | null;
  scheduled_for: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
}

const platformConfig = {
  instagram: { icon: Instagram, color: "text-pink-500", bg: "bg-pink-500/10", label: "Instagram" },
  linkedin: { icon: Linkedin, color: "text-blue-600", bg: "bg-blue-600/10", label: "LinkedIn" },
  twitter: { icon: Twitter, color: "text-sky-500", bg: "bg-sky-500/10", label: "Twitter" },
};

// Current posts from the real @advo_ph profile
const existingPosts = [
  { id: "existing-1", image_url: "/advo-post-1.jpg", placeholder: "ACCEPTING CLIENTS, ACCEPTING CLIENTS" },
  { id: "existing-2", image_url: "/advo-post-2.jpg", placeholder: "REALITY, NOT DREAMS" },
  { id: "existing-3", image_url: "/advo-post-3.jpg", placeholder: "ADVO" },
];

const AdminSocial = () => {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
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

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    setIsLoading(true);
    const { data, error } = await (supabase as any)
      .from("social_post")
      .select("*")
      .order("scheduled_for", { ascending: true });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setPosts(data || []);
      // Set first post as preview if none selected
      const igPosts = (data || []).filter((p: SocialPost) => p.platform === "instagram" && !p.is_published);
      if (igPosts.length > 0 && !previewPost) {
        setPreviewPost(igPosts[0]);
      }
    }
    setIsLoading(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    setIsUploading(true);
    const fileName = `social/${Date.now()}_${file.name}`;
    
    const { data, error } = await supabase.storage
      .from("uploads")
      .upload(fileName, file);

    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setIsUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("uploads")
      .getPublicUrl(fileName);

    setFormData(prev => ({ ...prev, image_url: urlData.publicUrl }));
    setIsUploading(false);
    toast({ title: "Image uploaded", description: "Ready to use" });
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

    setIsSaving(true);
    
    const scheduledFor = formData.scheduled_date && formData.scheduled_time
      ? new Date(`${formData.scheduled_date}T${formData.scheduled_time}`).toISOString()
      : null;

    const postData = {
      platform: formData.platform,
      content: formData.content,
      image_url: formData.image_url || null,
      scheduled_for: scheduledFor,
    };

    if (selectedPost) {
      const { error } = await (supabase as any)
        .from("social_post")
        .update(postData)
        .eq("social_post_id", selectedPost.social_post_id);

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Updated", description: "Post updated successfully" });
        setIsDialogOpen(false);
        fetchPosts();
      }
    } else {
      const { error } = await (supabase as any)
        .from("social_post")
        .insert(postData);

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Created", description: "Post scheduled successfully" });
        setIsDialogOpen(false);
        fetchPosts();
      }
    }

    setIsSaving(false);
  };

  const handleDelete = async (postId: number) => {
    const { error } = await (supabase as any)
      .from("social_post")
      .delete()
      .eq("social_post_id", postId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "Post removed" });
      fetchPosts();
    }
  };

  const scheduledPosts = posts.filter(p => !p.is_published);
  const instagramPosts = scheduledPosts.filter(p => p.platform === "instagram");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-2">Social Media</h1>
          <p className="text-muted-foreground">Preview and manage social content</p>
        </div>
        <Button 
          onClick={openCreateDialog}
          className="rounded-full bg-foreground text-background hover:bg-foreground/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Post
        </Button>
      </div>

      {/* Platform Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(platformConfig).map(([platform, config], index) => {
          const PlatformIcon = config.icon;
          const stats = platform === "instagram" 
            ? { followers: "18", posts: "3" } 
            : platform === "linkedin" 
            ? { followers: "1.2K", posts: "0" } 
            : { followers: "856", posts: "0" };
          
          return (
            <motion.div
              key={platform}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="p-5 bg-card border border-border rounded-xl shadow-card"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center`}>
                  <PlatformIcon className={`h-5 w-5 ${config.color}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground capitalize">{platform}</p>
                  <p className="text-xl font-bold">{stats.followers} <span className="text-xs font-normal text-muted-foreground">followers</span></p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

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
        <TabsContent value="queue" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Scheduled Posts List */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Scheduled Posts ({scheduledPosts.length})
              </h3>
              
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : scheduledPosts.length === 0 ? (
                <div className="text-center py-8 bg-card border border-border rounded-xl">
                  <p className="text-muted-foreground">No scheduled posts yet</p>
                  <Button variant="link" onClick={openCreateDialog}>
                    Create your first post
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                  {scheduledPosts.map((post, index) => {
                    const platform = platformConfig[post.platform as keyof typeof platformConfig] || platformConfig.instagram;
                    const PlatformIcon = platform.icon;
                    const isSelected = previewPost?.social_post_id === post.social_post_id;
                    
                    return (
                      <motion.div
                        key={post.social_post_id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={() => setPreviewPost(post)}
                        className={`p-4 bg-card border rounded-xl shadow-card group cursor-pointer transition-all ${
                          isSelected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-muted-foreground/30"
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          {post.image_url ? (
                            <img
                              src={post.image_url}
                              alt="Post preview"
                              className="w-16 h-16 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-secondary flex items-center justify-center">
                              <Image className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className={`${platform.bg} ${platform.color} gap-1`}>
                                <PlatformIcon className="h-3 w-3" />
                                {post.platform}
                              </Badge>
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

                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                            <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); openEditDialog(post); }}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDelete(post.social_post_id); }}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Single Post Preview */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Instagram className="h-4 w-4" />
                Post Preview
              </h3>
              
              <div className="bg-card border border-border rounded-xl overflow-hidden shadow-card">
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
                
                {/* Actions */}
                <div className="p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-4">
                      <Heart className="h-6 w-6 hover:text-red-500 cursor-pointer transition-colors" />
                      <MessageCircle className="h-6 w-6 hover:text-primary cursor-pointer transition-colors" />
                      <Share2 className="h-6 w-6 hover:text-primary cursor-pointer transition-colors" />
                    </div>
                    <Bookmark className="h-6 w-6 hover:text-primary cursor-pointer transition-colors" />
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
        <TabsContent value="feed" className="mt-6">
          {/* Instagram Profile Preview */}
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-card max-w-2xl mx-auto">
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
                    <div><span className="font-semibold">{3 + instagramPosts.length}</span> posts</div>
                    <div><span className="font-semibold">18</span> followers</div>
                    <div><span className="font-semibold">5</span> following</div>
                  </div>
                  
                  <div className="text-sm">
                    <p className="font-semibold">Advo</p>
                    <p className="text-muted-foreground">We digitalize it for you.</p>
                    <p className="text-muted-foreground">for inquiries: contact@advo.ph</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Post Grid Tabs */}
            <div className="border-b border-border">
              <div className="flex justify-center">
                <button className="flex items-center gap-2 px-6 py-3 border-t-2 border-foreground">
                  <Grid3X3 className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-wider font-medium">Posts</span>
                </button>
              </div>
            </div>
            
            {/* Posts Grid - Shows scheduled posts first, then existing */}
            <div className="grid grid-cols-3 gap-0.5 bg-border">
              {/* Scheduled posts (upcoming) */}
              {instagramPosts.map((post) => (
                <motion.div
                  key={post.social_post_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`aspect-square bg-card relative cursor-pointer group ${
                    previewPost?.social_post_id === post.social_post_id ? "ring-2 ring-primary ring-inset" : ""
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
                    <Badge className="bg-orange-500 text-white text-[10px] px-1.5 py-0.5">
                      <Clock className="h-2.5 w-2.5 mr-1" />
                      Scheduled
                    </Badge>
                  </div>
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                    <div className="flex items-center gap-1 text-white">
                      <Heart className="h-5 w-5 fill-white" />
                      <span className="font-semibold">0</span>
                    </div>
                    <div className="flex items-center gap-1 text-white">
                      <MessageCircle className="h-5 w-5 fill-white" />
                      <span className="font-semibold">0</span>
                    </div>
                  </div>
                </motion.div>
              ))}
              
              {/* Existing posts (current profile) */}
              {existingPosts.map((post, index) => (
                <div
                  key={post.id}
                  className="aspect-square bg-card relative group"
                >
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 text-white p-4">
                    <span className="text-[10px] text-center font-medium leading-tight">
                      {post.placeholder}
                    </span>
                  </div>
                  {/* Live badge */}
                  <div className="absolute top-2 left-2">
                    <Badge className="bg-green-500 text-white text-[10px] px-1.5 py-0.5">
                      Live
                    </Badge>
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
