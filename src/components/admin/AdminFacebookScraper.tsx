import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Loader2,
  MapPin,
  Phone,
  Mail,
  Globe,
  Clock,
  Users,
  Heart,
  MessageSquare,
  Share2,
  Image,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ExternalLink,
  Tag,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { get, post } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface FBPageInfo {
  name: string | null;
  category: string | null;
  followers: string | null;
  likes: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  hours: string | null;
  profileImage: string | null;
  coverImage: string | null;
}

interface FBPost {
  text: string;
  date: string | null;
  likes: string | null;
  comments: string | null;
  shares: string | null;
  images: string[];
  imageUrl?: string | null;
}

interface FBData {
  url: string;
  name: string | null;
  description: string | null;
  profileImage: string | null;
  followers: string | null;
  likes: string | null;
  categories: string[];
  info: Record<string, string>;
  contact: {
    links: { type: string; value: string }[];
    addresses: string[];
    hours: string[];
  };
  posts: FBPost[];
  photos: string[];
}

const SectionCard = ({
  title,
  icon: Icon,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ElementType;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full p-4 flex items-center justify-between hover:bg-secondary/30 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-blue-500" />
          </div>
          <span className="font-medium text-sm">{title}</span>
          {count !== undefined && <Badge variant="secondary" className="text-xs">{count}</Badge>}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-4 pb-4 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const CopyBtn = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="p-1 rounded hover:bg-secondary/50" title="Copy">
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
    </button>
  );
};

interface ScrapeHistoryItem {
  scrapeResultId: number;
  url: string;
  type: string;
  createdAt: string;
}

const AdminFacebookScraper = () => {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<FBData | null>(null);
  const [history, setHistory] = useState<ScrapeHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load history on mount
  useState(() => {
    get<ScrapeHistoryItem[]>("/api/scrape/history?type=facebook").then(res => {
      if (res.data) setHistory(res.data);
    });
  });

  const loadFromHistory = async (id: number) => {
    const res = await get<{ data: FBData }>(`/api/scrape/history/${id}`);
    if (res.data) {
      setResult((res.data as unknown as { data: FBData }).data);
      setShowHistory(false);
      toast({ title: "Loaded from history" });
    }
  };

  const saveToHistory = async (scrapeUrl: string, data: FBData) => {
    await post("/api/scrape/save", { url: scrapeUrl, type: "facebook", data });
    const histRes = await get<ScrapeHistoryItem[]>("/api/scrape/history?type=facebook");
    if (histRes.data) setHistory(histRes.data);
  };

  const handleScrape = async () => {
    if (!url) return;
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http")) normalizedUrl = `https://${normalizedUrl}`;
    if (!normalizedUrl.includes("facebook.com")) {
      toast({ title: "Invalid URL", description: "Please enter a Facebook page URL", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setResult(null);
    // Try authenticated endpoint first (gets all posts), fallback to public
    const res = await post<FBData>("/api/scrape/facebook-full", { url: normalizedUrl });
    if (res.error) {
      // Fallback to public scraper
      const fallback = await post<FBData>("/api/scrape/facebook", { url: normalizedUrl });
      if (fallback.error) {
        toast({ title: "Scrape failed", description: fallback.error, variant: "destructive" });
      } else if (fallback.data) {
        setResult(fallback.data);
        await saveToHistory(normalizedUrl, fallback.data);
        toast({ title: "Scrape complete (public)", description: `${fallback.data.posts.length} posts captured. Login to FB on VPS for full history.` });
      }
    } else if (res.data) {
      // Map the full response to our FBData shape
      const fullData: FBData = {
        url: res.data.url,
        name: (res.data as unknown as { pageInfo: FBPageInfo }).pageInfo?.name || null,
        description: (res.data as unknown as { pageInfo: FBPageInfo }).pageInfo?.description || null,
        profileImage: (res.data as unknown as { pageInfo: FBPageInfo }).pageInfo?.profileImage || null,
        followers: (res.data as unknown as { pageInfo: FBPageInfo }).pageInfo?.followers || null,
        likes: (res.data as unknown as { pageInfo: FBPageInfo }).pageInfo?.likes || null,
        categories: [],
        info: {},
        contact: {
          links: [],
          addresses: [],
          hours: [],
        },
        posts: (res.data as unknown as { posts: FBPost[] }).posts || [],
        photos: (res.data as unknown as { photos: string[] }).photos || [],
      };
      // Fill contact from pageInfo
      const pi = (res.data as unknown as { pageInfo: FBPageInfo }).pageInfo;
      if (pi?.website) fullData.contact.links.push({ type: "website", value: pi.website });
      if (pi?.phone) fullData.contact.links.push({ type: "phone", value: pi.phone });
      if (pi?.email) fullData.contact.links.push({ type: "email", value: pi.email });
      if (pi?.address) fullData.contact.addresses.push(pi.address);
      if (pi?.category) fullData.categories.push(pi.category);

      setResult(fullData);
      await saveToHistory(normalizedUrl, fullData);
      toast({ title: "Full scrape complete", description: `${fullData.posts.length} posts, ${fullData.photos.length} photos captured` });
    }
    setIsLoading(false);
  };

  const contactIcon = (type: string) => {
    switch (type) {
      case "phone": return Phone;
      case "email": return Mail;
      case "website": return Globe;
      case "instagram": case "tiktok": case "twitter": case "youtube": case "linkedin": return Share2;
      default: return Link2;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Facebook Scraper</h1>
        <p className="text-muted-foreground">
          Extract business info, posts, and photos from any public Facebook page
        </p>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Facebook page URL (e.g. facebook.com/FourlinQofficial)"
            value={url} onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleScrape()} className="pl-9" />
        </div>
        <Button onClick={handleScrape} disabled={isLoading || !url}
          className="rounded-full bg-[#1877F2] text-white hover:bg-[#1877F2]/90 min-w-[120px]">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
          {isLoading ? "Scraping..." : "Scrape"}
        </Button>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div>
          <button onClick={() => setShowHistory(!showHistory)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {history.length} saved scrapes
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5 max-h-[200px] overflow-y-auto">
              {history.map((h) => (
                <button key={h.scrapeResultId} onClick={() => loadFromHistory(h.scrapeResultId)}
                  className="w-full text-left p-2.5 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors flex items-center justify-between">
                  <span className="text-sm truncate flex-1">{h.url.replace(/^https?:\/\/(www\.)?facebook\.com\//, "")}</span>
                  <span className="text-xs text-muted-foreground ml-3 flex-shrink-0">
                    {new Date(h.createdAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-[#1877F2]" />
          <p className="text-sm text-muted-foreground">Loading Facebook page with stealth browser...</p>
          <p className="text-xs text-muted-foreground">This may take 15-30 seconds</p>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Overview */}
          <div className="p-5 bg-card border border-border rounded-xl shadow-card">
            <div className="flex items-start gap-4">
              {result.profileImage && (
                <img src={result.profileImage} alt="" className="w-16 h-16 rounded-xl object-cover"
                  onError={(e) => (e.currentTarget.style.display = "none")} />
              )}
              <div className="flex-1">
                <h2 className="font-bold text-lg">{result.name || "Unknown Page"}</h2>
                {result.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{result.description}</p>
                )}
                <div className="flex items-center gap-4 mt-2">
                  {result.followers && (
                    <div className="flex items-center gap-1 text-sm">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{result.followers}</span>
                      <span className="text-muted-foreground">followers</span>
                    </div>
                  )}
                  {result.likes && (
                    <div className="flex items-center gap-1 text-sm">
                      <Heart className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{result.likes}</span>
                      <span className="text-muted-foreground">likes</span>
                    </div>
                  )}
                  <a href={result.url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-[#1877F2] hover:underline flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> View on Facebook
                  </a>
                </div>
                {result.categories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {result.categories.map((cat, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] gap-1">
                        <Tag className="h-2.5 w-2.5" /> {cat}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Posts", value: result.posts.length, icon: MessageSquare },
              { label: "Photos", value: result.photos.length, icon: Image },
              { label: "Contacts", value: result.contact.links.length, icon: Phone },
              { label: "Locations", value: result.contact.addresses.length, icon: MapPin },
            ].map((stat) => (
              <div key={stat.label} className="p-4 bg-card border border-border rounded-xl text-center">
                <stat.icon className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-lg font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Contact & Links */}
          {(result.contact.links.length > 0 || result.contact.addresses.length > 0) && (
            <SectionCard title="Contact Info" icon={Phone} count={result.contact.links.length} defaultOpen>
              <div className="space-y-2">
                {result.contact.links.map((link, i) => {
                  const Icon = contactIcon(link.type);
                  return (
                    <div key={i} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground capitalize">{link.type}</p>
                          <p className="text-sm font-mono truncate max-w-[400px]">{link.value}</p>
                        </div>
                      </div>
                      <CopyBtn text={link.value} />
                    </div>
                  );
                })}
                {result.contact.addresses.map((addr, i) => (
                  <div key={`addr-${i}`} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Address</p>
                        <p className="text-sm">{addr}</p>
                      </div>
                    </div>
                    <CopyBtn text={addr} />
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Business Hours */}
          {result.contact.hours.length > 0 && (
            <SectionCard title="Business Hours" icon={Clock} count={result.contact.hours.length}>
              <div className="space-y-1">
                {result.contact.hours.map((h, i) => (
                  <p key={i} className="text-sm font-mono">{h}</p>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Extra Info */}
          {Object.keys(result.info).length > 0 && (
            <SectionCard title="Business Info" icon={Tag} count={Object.keys(result.info).length} defaultOpen>
              <div className="space-y-2">
                {Object.entries(result.info).map(([key, val]) => (
                  <div key={key} className="flex items-start justify-between p-3 bg-secondary/30 rounded-lg">
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground capitalize">{key}</p>
                      <p className="text-sm mt-0.5">{val}</p>
                    </div>
                    <CopyBtn text={val} />
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Posts */}
          {result.posts.length > 0 && (
            <SectionCard title="Posts" icon={MessageSquare} count={result.posts.length} defaultOpen>
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                {result.posts.map((p, i) => (
                  <div key={i} className="p-4 bg-secondary/30 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      {p.date && <span className="text-xs text-muted-foreground">{p.date}</span>}
                      <CopyBtn text={p.text} />
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{p.text}</p>
                    {p.images && p.images.length > 0 && (
                      <div className="flex gap-2 mt-3 overflow-x-auto">
                        {p.images.map((src, j) => (
                          <a key={j} href={src} target="_blank" rel="noopener noreferrer"
                            className="flex-shrink-0 w-24 h-24 rounded-lg border border-border overflow-hidden hover:border-blue-500/50">
                            <img src={src} alt="" className="w-full h-full object-cover"
                              onError={(e) => (e.currentTarget.parentElement!.style.display = "none")} />
                          </a>
                        ))}
                      </div>
                    )}
                    {(p.likes || p.comments || p.shares) && (
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        {p.likes && <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {p.likes}</span>}
                        {p.comments && <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {p.comments}</span>}
                        {p.shares && <span className="flex items-center gap-1"><Share2 className="h-3 w-3" /> {p.shares}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Photos */}
          {result.photos.length > 0 && (
            <SectionCard title="Photos" icon={Image} count={result.photos.length}>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2 max-h-[400px] overflow-y-auto">
                {result.photos.map((src, i) => (
                  <a key={i} href={src} target="_blank" rel="noopener noreferrer"
                    className="block aspect-square rounded-lg border border-border overflow-hidden hover:border-blue-500/50 transition-colors">
                    <img src={src} alt="" className="w-full h-full object-cover"
                      onError={(e) => (e.currentTarget.parentElement!.style.display = "none")} />
                  </a>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {!isLoading && !result && (
        <div className="text-center py-16 bg-card border border-border rounded-xl">
          <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground font-medium">Enter a Facebook page URL</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Extract company info, contact details, recent posts, and photos from any public Facebook business page.
            Perfect for client onboarding and competitive research.
          </p>
        </div>
      )}
    </div>
  );
};

export default AdminFacebookScraper;
