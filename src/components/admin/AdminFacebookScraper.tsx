import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Loader2,
  MapPin,
  Phone,
  Mail,
  Globe,
  Users,
  Heart,
  MessageSquare,
  Share2,
  Image,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Radio,
  Zap,
  Download,
  Copy,
  Check,
  Filter,
  Hash,
  Link2,
  FileText,
  BarChart3,
  ArrowUpDown,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { get } from "@/lib/api";
import { getAccessToken } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

// Resolve image URLs — local uploads need API prefix, FB CDN URLs stay as-is
function resolveImgUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("/uploads/")) return `${API_URL}${url}`;
  return url;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  postId: string;
  text: string;
  date: string | null;
  timestamp: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  images: string[];
  videoUrl: string | null;
  authorName: string | null;
}

interface ScrapeHistoryItem {
  scrapeResultId: number;
  url: string;
  type: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w\u00C0-\u024F]+/g);
  return matches ? matches.map((t) => t.toLowerCase()) : [];
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)">]+/g);
  return matches || [];
}

function extractMentions(text: string): string[] {
  const matches = text.match(/@[\w.]+/g);
  return matches ? matches.map((m) => m.toLowerCase()) : [];
}

function getStopWords(): Set<string> {
  return new Set([
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it",
    "for", "not", "on", "with", "he", "as", "you", "do", "at", "this",
    "but", "his", "by", "from", "they", "we", "say", "her", "she", "or",
    "an", "will", "my", "one", "all", "would", "there", "their", "what",
    "so", "up", "out", "if", "about", "who", "get", "which", "go", "me",
    "when", "make", "can", "like", "time", "no", "just", "him", "know",
    "take", "people", "into", "year", "your", "good", "some", "could",
    "them", "see", "other", "than", "then", "now", "look", "only", "come",
    "its", "over", "think", "also", "back", "after", "use", "two", "how",
    "our", "work", "first", "well", "way", "even", "new", "want", "because",
    "any", "these", "give", "day", "most", "us", "is", "are", "was", "were",
    "been", "has", "had", "did", "does", "am", "being", "here", "very",
    "more", "may", "na", "sa", "ang", "ng", "mga", "po", "ko", "ka",
    "naman", "lang", "yung", "din", "rin", "pa", "ba", "mo", "nila",
    "siya", "ito", "kami", "natin", "tayo", "para", "kung", "at",
  ]);
}

function getWordFrequency(texts: string[]): { word: string; count: number }[] {
  const stopWords = getStopWords();
  const freq: Record<string, number> = {};
  for (const text of texts) {
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/);
    for (const w of words) {
      if (w.length > 2 && !stopWords.has(w)) {
        freq[w] = (freq[w] || 0) + 1;
      }
    }
  }
  return Object.entries(freq)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);
}

// Unicode font detection — maps mathematical/fancy Unicode ranges to font names
function detectUnicodeFonts(text: string): { font: string; sample: string; count: number }[] {
  const ranges: [RegExp, string][] = [
    [/[\u{1D400}-\u{1D419}]/gu, "Bold Serif"],       // 𝐀-𝐙
    [/[\u{1D41A}-\u{1D433}]/gu, "Bold Serif"],       // 𝐚-𝐳
    [/[\u{1D434}-\u{1D44D}]/gu, "Italic Serif"],     // 𝐴-𝑍
    [/[\u{1D44E}-\u{1D467}]/gu, "Italic Serif"],     // 𝑎-𝑧
    [/[\u{1D468}-\u{1D481}]/gu, "Bold Italic"],      // 𝑨-𝒁
    [/[\u{1D482}-\u{1D49B}]/gu, "Bold Italic"],      // 𝒂-𝒛
    [/[\u{1D49C}-\u{1D4CF}]/gu, "Script"],           // 𝒜-𝓏
    [/[\u{1D4D0}-\u{1D503}]/gu, "Bold Script"],      // 𝓐-𝔃
    [/[\u{1D504}-\u{1D537}]/gu, "Fraktur"],          // 𝔄-𝔷
    [/[\u{1D538}-\u{1D56B}]/gu, "Double-Struck"],    // 𝔸-𝕫
    [/[\u{1D56C}-\u{1D59F}]/gu, "Bold Fraktur"],     // 𝕬-𝖟
    [/[\u{1D5A0}-\u{1D5B9}]/gu, "Sans-Serif"],       // 𝖠-𝖹
    [/[\u{1D5BA}-\u{1D5D3}]/gu, "Sans-Serif"],       // 𝖺-𝗓
    [/[\u{1D5D4}-\u{1D5ED}]/gu, "Sans Bold"],        // 𝗔-𝗭
    [/[\u{1D5EE}-\u{1D607}]/gu, "Sans Bold"],        // 𝗮-𝘇
    [/[\u{1D608}-\u{1D621}]/gu, "Sans Italic"],      // 𝘈-𝘡
    [/[\u{1D622}-\u{1D63B}]/gu, "Sans Italic"],      // 𝘢-𝘻
    [/[\u{1D63C}-\u{1D655}]/gu, "Sans Bold Italic"], // 𝘼-𝙕
    [/[\u{1D656}-\u{1D66F}]/gu, "Sans Bold Italic"], // 𝙖-𝙯
    [/[\u{1D670}-\u{1D689}]/gu, "Monospace"],        // 𝙰-𝚉
    [/[\u{1D68A}-\u{1D6A3}]/gu, "Monospace"],        // 𝚊-𝚣
    [/[\u24B6-\u24E9]/gu, "Circled"],                // Ⓐ-ⓩ
    [/[\uFF21-\uFF3A\uFF41-\uFF5A]/gu, "Fullwidth"],// Ａ-Ｚ
  ];

  const results: Record<string, { count: number; sample: string }> = {};
  for (const [regex, font] of ranges) {
    const matches = text.match(regex);
    if (matches && matches.length > 0) {
      if (!results[font]) {
        // Find a sample word using this font
        const sampleMatch = text.match(new RegExp(`(?:${regex.source}){2,}`, "gu"));
        results[font] = { count: matches.length, sample: sampleMatch?.[0]?.slice(0, 20) || matches.slice(0, 5).join("") };
      } else {
        results[font].count += matches.length;
      }
    }
  }

  return Object.entries(results)
    .map(([font, { count, sample }]) => ({ font, sample, count }))
    .sort((a, b) => b.count - a.count);
}

// Emoji extraction and frequency
function extractEmojis(text: string): { emoji: string; count: number }[] {
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1FA00}-\u{1FA9F}\u{200D}]/gu;
  const matches = text.match(emojiRegex);
  if (!matches) return [];

  const freq: Record<string, number> = {};
  for (const e of matches) {
    if (e === "\u200D" || e === "\uFE0F") continue; // skip joiners
    freq[e] = (freq[e] || 0) + 1;
  }
  return Object.entries(freq)
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count);
}

// CTA pattern detection
function extractCTAs(texts: string[]): { cta: string; count: number }[] {
  const ctaPatterns = [
    /(?:leave\s+us\s+a\s+message|send\s+us\s+a\s+message|message\s+us|dm\s+us)/gi,
    /(?:inquire\s+now|book\s+now|order\s+now|shop\s+now|buy\s+now|get\s+yours)/gi,
    /(?:visit\s+(?:us|our\s+\w+)|check\s+(?:us\s+)?out|come\s+visit)/gi,
    /(?:call\s+us|contact\s+us|reach\s+out|get\s+in\s+touch)/gi,
    /(?:follow\s+us|like\s+(?:us|our\s+page)|subscribe|join\s+us)/gi,
    /(?:link\s+in\s+bio|swipe\s+up|tap\s+the\s+link|click\s+the\s+link)/gi,
    /(?:free\s+(?:quote|quotation|consultation|estimate|shipping))/gi,
    /(?:limited\s+(?:time|offer|slots?|stocks?)|while\s+(?:stocks?|supplies?)\s+last)/gi,
    /(?:don'?t\s+miss|grab\s+yours|avail\s+now|claim\s+now)/gi,
  ];

  const freq: Record<string, number> = {};
  for (const text of texts) {
    for (const pattern of ctaPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (const m of matches) {
          const normalized = m.toLowerCase().trim();
          freq[normalized] = (freq[normalized] || 0) + 1;
        }
      }
    }
  }
  return Object.entries(freq)
    .map(([cta, count]) => ({ cta, count }))
    .sort((a, b) => b.count - a.count);
}

// Repeated phrases detection
function findRepeatedPhrases(texts: string[], minLength = 15, minCount = 2): { phrase: string; count: number }[] {
  const phrases: Record<string, number> = {};

  for (const text of texts) {
    // Split into sentences/lines
    const lines = text.split(/[.\n!?]+/).map(l => l.trim()).filter(l => l.length >= minLength);
    for (const line of lines) {
      const normalized = line.toLowerCase().replace(/\s+/g, " ").slice(0, 80);
      phrases[normalized] = (phrases[normalized] || 0) + 1;
    }
  }

  return Object.entries(phrases)
    .filter(([, count]) => count >= minCount)
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

// Post structure analysis
function analyzePostStructure(texts: string[]): {
  avgLines: number;
  avgParagraphs: number;
  hasEmojiHeaders: number;
  hasHashtagBlocks: number;
  hasCTA: number;
  capsHeaders: number;
} {
  let totalLines = 0, totalParagraphs = 0, emojiHeaders = 0, hashtagBlocks = 0, ctaCount = 0, capsCount = 0;

  for (const text of texts) {
    const lines = text.split("\n").filter(l => l.trim());
    totalLines += lines.length;
    totalParagraphs += text.split("\n\n").filter(p => p.trim()).length;

    // Emoji at start of line (emoji bullets)
    if (lines.some(l => /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}]/u.test(l.trim()))) emojiHeaders++;

    // Hashtag block at end
    if (text.match(/(#\w+\s*){3,}$/)) hashtagBlocks++;

    // Has CTA-like ending
    if (/message|inquire|contact|visit|call/i.test(text.slice(-100))) ctaCount++;

    // ALL CAPS first line
    const firstLine = lines[0] || "";
    if (firstLine.length > 5 && firstLine === firstLine.toUpperCase() && /[A-Z]/.test(firstLine)) capsCount++;
  }

  const n = texts.length || 1;
  return {
    avgLines: Math.round(totalLines / n),
    avgParagraphs: Math.round(totalParagraphs / n),
    hasEmojiHeaders: emojiHeaders,
    hasHashtagBlocks: hashtagBlocks,
    hasCTA: ctaCount,
    capsHeaders: capsCount,
  };
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl shadow-card overflow-hidden"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-4 flex items-center justify-between hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-blue-500" />
          </div>
          <span className="font-medium text-sm">{title}</span>
          {count !== undefined && (
            <Badge variant="secondary" className="text-xs">
              {count}
            </Badge>
          )}
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const CopyButton = ({ text, label }: { text: string; label?: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="text-xs gap-1.5"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {label || "Copy"}
    </Button>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const AdminFacebookScraper = () => {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [progress, setProgress] = useState(0);
  const [pageInfo, setPageInfo] = useState<FBPageInfo | null>(null);
  const [posts, setPosts] = useState<FBPost[]>([]);
  const [postsCount, setPostsCount] = useState(0);
  const [scrollCount, setScrollCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [history, setHistory] = useState<ScrapeHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const postsEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Posts section controls
  const [postSort, setPostSort] = useState<"newest" | "most-text" | "most-images">("newest");
  const [postFilter, setPostFilter] = useState("");
  const [postImagesOnly, setPostImagesOnly] = useState(false);

  useEffect(() => {
    get<ScrapeHistoryItem[]>("/api/scrape/history?type=facebook").then((res) => {
      if (res.data) setHistory(res.data);
    });
  }, []);

  const loadFromHistory = async (id: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await get<{ data: any }>(`/api/scrape/history/${id}`);
    if (res.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (res.data as any).data;
      setPageInfo(d.pageInfo || null);
      setPosts(d.posts || []);
      setPostsCount(d.totalPosts || d.posts?.length || 0);
      setIsComplete(true);
      setShowHistory(false);
      toast({ title: "Loaded from history" });
    }
  };

  const reset = () => {
    setPageInfo(null);
    setPosts([]);
    setPostsCount(0);
    setScrollCount(0);
    setProgress(0);
    setStatusText("");
    setIsComplete(false);
    setExpandedPost(null);
    setPostSort("newest");
    setPostFilter("");
    setPostImagesOnly(false);
  };

  const startStream = useCallback(async () => {
    if (!url) return;
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http")) normalizedUrl = `https://${normalizedUrl}`;
    if (!normalizedUrl.includes("facebook.com")) {
      normalizedUrl = `https://www.facebook.com/${normalizedUrl.replace(/^https?:\/\//, "")}`;
    }

    reset();
    setIsStreaming(true);
    setStatusText("Connecting...");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = getAccessToken();
      const response = await fetch(`${API_URL}/api/scrape/facebook-stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url: normalizedUrl }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const text = await response.text();
        try {
          const err = JSON.parse(text);
          toast({ title: "Error", description: err.error || `HTTP ${response.status}`, variant: "destructive" });
        } catch {
          toast({ title: "Error", description: `HTTP ${response.status}`, variant: "destructive" });
        }
        setIsStreaming(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ") && eventType) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (eventType) {
                case "status":
                  setStatusText(data.step || "");
                  if (data.progress) setProgress(data.progress);
                  break;

                case "pageInfo":
                  setPageInfo(data);
                  break;

                case "post":
                  setPosts((prev) => {
                    const exists = prev.some(
                      (p) => p.text.slice(0, 60) === data.text?.slice(0, 60)
                    );
                    if (exists) return prev;
                    return [...prev, data];
                  });
                  setPostsCount((prev) => prev + 1);
                  break;

                case "progress":
                  setPostsCount(data.postsFound || 0);
                  setScrollCount(data.scrollCount || 0);
                  if (data.progress) setProgress(data.progress);
                  setStatusText(data.step || "");
                  break;

                case "complete":
                  setIsComplete(true);
                  setProgress(100);
                  setStatusText(`Done! ${data.totalPosts} posts, ${data.totalPhotos} photos`);
                  get<ScrapeHistoryItem[]>("/api/scrape/history?type=facebook").then((res) => {
                    if (res.data) setHistory(res.data);
                  });
                  toast({ title: "Scrape complete", description: `${data.totalPosts} posts captured` });
                  break;

                case "error":
                  toast({ title: "Scrape error", description: data.message, variant: "destructive" });
                  setStatusText(`Error: ${data.message}`);
                  break;
              }
            } catch {
              /* skip malformed data */
            }
            eventType = "";
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        toast({ title: "Connection failed", description: (e as Error).message, variant: "destructive" });
      }
    }

    setIsStreaming(false);
  }, [url, toast]);

  const stopStream = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStatusText("Stopped by user");
  };

  // ---------------------------------------------------------------------------
  // Derived / computed data
  // ---------------------------------------------------------------------------

  const allImages = useMemo(() => {
    const seen = new Set<string>();
    const imgs: string[] = [];
    for (const p of posts) {
      for (const img of p.images) {
        if (!seen.has(img)) {
          seen.add(img);
          imgs.push(img);
        }
      }
    }
    return imgs;
  }, [posts]);

  const allCaptions = useMemo(() => posts.filter((p) => p.text.trim()).map((p) => p.text), [posts]);

  const allHashtags = useMemo(() => {
    const freq: Record<string, number> = {};
    for (const p of posts) {
      for (const tag of extractHashtags(p.text)) {
        freq[tag] = (freq[tag] || 0) + 1;
      }
    }
    return Object.entries(freq)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }, [posts]);

  const allUrlsFromPosts = useMemo(() => {
    const freq: Record<string, number> = {};
    for (const p of posts) {
      for (const u of extractUrls(p.text)) {
        freq[u] = (freq[u] || 0) + 1;
      }
    }
    return Object.entries(freq)
      .map(([url, count]) => ({ url, count }))
      .sort((a, b) => b.count - a.count);
  }, [posts]);

  const allMentions = useMemo(() => {
    const freq: Record<string, number> = {};
    for (const p of posts) {
      for (const m of extractMentions(p.text)) {
        freq[m] = (freq[m] || 0) + 1;
      }
    }
    return Object.entries(freq)
      .map(([mention, count]) => ({ mention, count }))
      .sort((a, b) => b.count - a.count);
  }, [posts]);

  const wordFreq = useMemo(() => getWordFrequency(allCaptions), [allCaptions]);

  const analytics = useMemo(() => {
    if (posts.length === 0) return null;

    const datedPosts = posts.filter((p) => p.date || p.timestamp);
    let postsPerWeek = 0;
    let postsPerMonth = 0;
    if (datedPosts.length >= 2) {
      const timestamps = datedPosts
        .map((p) => (p.timestamp ? p.timestamp * 1000 : p.date ? new Date(p.date).getTime() : 0))
        .filter(Boolean)
        .sort((a, b) => a - b);
      const rangeMs = timestamps[timestamps.length - 1] - timestamps[0];
      const rangeWeeks = Math.max(rangeMs / (7 * 24 * 60 * 60 * 1000), 1);
      const rangeMonths = Math.max(rangeWeeks / 4.33, 1);
      postsPerWeek = Math.round((datedPosts.length / rangeWeeks) * 10) / 10;
      postsPerMonth = Math.round((datedPosts.length / rangeMonths) * 10) / 10;
    }

    const avgTextLength = Math.round(
      posts.reduce((s, p) => s + p.text.length, 0) / posts.length
    );
    const withImages = posts.filter((p) => p.images.length > 0).length;
    const textOnly = posts.length - withImages;

    return { postsPerWeek, postsPerMonth, avgTextLength, withImages, textOnly };
  }, [posts]);

  // Sorted & filtered posts
  const filteredPosts = useMemo(() => {
    let result = [...posts];
    if (postImagesOnly) result = result.filter((p) => p.images.length > 0);
    if (postFilter.trim()) {
      const q = postFilter.toLowerCase();
      result = result.filter((p) => p.text.toLowerCase().includes(q));
    }
    switch (postSort) {
      case "newest":
        result.sort((a, b) => {
          const ta = a.timestamp || (a.date ? new Date(a.date).getTime() / 1000 : 0);
          const tb = b.timestamp || (b.date ? new Date(b.date).getTime() / 1000 : 0);
          return tb - ta;
        });
        break;
      case "most-text":
        result.sort((a, b) => b.text.length - a.text.length);
        break;
      case "most-images":
        result.sort((a, b) => b.images.length - a.images.length);
        break;
    }
    return result;
  }, [posts, postSort, postFilter, postImagesOnly]);

  // ---------------------------------------------------------------------------
  // hasResults — show result sections only when we have data
  // ---------------------------------------------------------------------------
  const hasResults = posts.length > 0 || isComplete;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Facebook Scraper</h1>
        <p className="text-muted-foreground">
          Extract posts, photos, and company data from Facebook pages — live streaming
        </p>
      </div>

      {/* URL Input */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Facebook page URL or username (e.g. butfirstcoffeeph)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !isStreaming && startStream()}
            className="pl-9"
            disabled={isStreaming}
          />
        </div>
        {isStreaming ? (
          <Button onClick={stopStream} variant="destructive" className="rounded-full min-w-[120px]">
            Stop
          </Button>
        ) : (
          <Button
            onClick={startStream}
            disabled={!url}
            className="rounded-full bg-blue-600 hover:bg-blue-700 text-white min-w-[120px]"
          >
            <Radio className="h-4 w-4 mr-2" />
            Live Scrape
          </Button>
        )}
      </div>

      {/* History */}
      {history.length > 0 && !isStreaming && (
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {history.length} saved scrapes
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5 max-h-[200px] overflow-y-auto">
              {history.map((h) => (
                <button
                  key={h.scrapeResultId}
                  onClick={() => loadFromHistory(h.scrapeResultId)}
                  className="w-full text-left p-2.5 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors flex items-center justify-between"
                >
                  <span className="text-sm truncate flex-1">
                    {h.url.replace(/^https?:\/\/(www\.)?facebook\.com\//, "")}
                  </span>
                  <span className="text-xs text-muted-foreground ml-3">
                    {new Date(h.createdAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Progress Bar */}
      {(isStreaming || (progress > 0 && progress < 100)) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              {isStreaming && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
              <span className="text-muted-foreground">{statusText}</span>
            </div>
            <div className="flex items-center gap-3 text-muted-foreground">
              {scrollCount > 0 && <span>Scroll {scrollCount}</span>}
              <span className="font-mono font-bold text-foreground">{postsCount} posts</span>
            </div>
          </div>
          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-blue-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 1. Company Profile Card (always visible, not collapsible)         */}
      {/* ================================================================= */}
      {pageInfo && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 bg-card border border-border rounded-xl shadow-card"
        >
          {/* Cover image */}
          {pageInfo.coverImage && (
            <div className="mb-4 -mx-5 -mt-5 rounded-t-xl overflow-hidden max-h-48">
              <img
                src={resolveImgUrl(pageInfo.coverImage || "")}
                alt=""
                className="w-full h-48 object-cover"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            </div>
          )}
          <div className="flex items-start gap-4">
            {pageInfo.profileImage && (
              <img
                src={resolveImgUrl(pageInfo.profileImage || "")}
                alt=""
                className="w-16 h-16 rounded-xl object-cover border-2 border-background shadow-md"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-lg">{pageInfo.name || "Facebook Page"}</h2>
              {pageInfo.category && (
                <Badge variant="secondary" className="text-xs mt-1">
                  {pageInfo.category}
                </Badge>
              )}
              {pageInfo.description && (
                <p className="text-sm text-muted-foreground mt-2">{pageInfo.description}</p>
              )}

              {/* Contact row */}
              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-muted-foreground">
                {pageInfo.website && (
                  <a
                    href={pageInfo.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-500 hover:underline"
                  >
                    <Globe className="h-3 w-3" /> {pageInfo.website}
                  </a>
                )}
                {pageInfo.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {pageInfo.phone}
                  </span>
                )}
                {pageInfo.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {pageInfo.email}
                  </span>
                )}
                {pageInfo.address && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {pageInfo.address}
                  </span>
                )}
              </div>

              {/* Stats row */}
              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs">
                {pageInfo.followers && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Users className="h-3 w-3" /> {pageInfo.followers} followers
                  </span>
                )}
                {pageInfo.likes && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Heart className="h-3 w-3" /> {pageInfo.likes} likes
                  </span>
                )}
                {posts.length > 0 && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <MessageSquare className="h-3 w-3" /> {posts.length} posts scraped
                  </span>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ================================================================= */}
      {/* 2. Analytics Overview                                             */}
      {/* ================================================================= */}
      {hasResults && analytics && (
        <SectionCard title="Analytics Overview" icon={BarChart3} defaultOpen>
          <div className="space-y-4">
            {/* Key metrics grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-secondary/30 rounded-lg text-center">
                <p className="text-lg font-bold">{analytics.postsPerWeek}</p>
                <p className="text-[10px] text-muted-foreground">Posts / week</p>
              </div>
              <div className="p-3 bg-secondary/30 rounded-lg text-center">
                <p className="text-lg font-bold">{analytics.postsPerMonth}</p>
                <p className="text-[10px] text-muted-foreground">Posts / month</p>
              </div>
              <div className="p-3 bg-secondary/30 rounded-lg text-center">
                <p className="text-lg font-bold">{analytics.avgTextLength}</p>
                <p className="text-[10px] text-muted-foreground">Avg text length</p>
              </div>
              <div className="p-3 bg-secondary/30 rounded-lg text-center">
                <p className="text-lg font-bold">
                  {analytics.withImages} / {analytics.textOnly}
                </p>
                <p className="text-[10px] text-muted-foreground">With images / text-only</p>
              </div>
            </div>

            {/* Top hashtags */}
            {allHashtags.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Hash className="h-3 w-3" /> Top Hashtags
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {allHashtags.slice(0, 15).map((h) => (
                    <Badge key={h.tag} variant="secondary" className="text-xs">
                      {h.tag}{" "}
                      <span className="ml-1 opacity-60">{h.count}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Top words */}
            {wordFreq.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Type className="h-3 w-3" /> Most Used Words in Captions
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {wordFreq.slice(0, 20).map((w) => (
                    <Badge key={w.word} variant="outline" className="text-xs">
                      {w.word}{" "}
                      <span className="ml-1 opacity-60">{w.count}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* ================================================================= */}
      {/* 2b. Brand Voice Analysis                                          */}
      {/* ================================================================= */}
      {posts.length > 0 && (() => {
        const allText = posts.map(p => p.text).join("\n");
        const unicodeFonts = detectUnicodeFonts(allText);
        const emojis = extractEmojis(allText);
        const ctas = extractCTAs(posts.map(p => p.text));
        const repeated = findRepeatedPhrases(posts.map(p => p.text));
        const structure = analyzePostStructure(posts.map(p => p.text));

        return (
          <SectionCard title="Brand Voice Analysis" icon={Type} defaultOpen>
            <div className="space-y-6">
              {/* Unicode Fonts Used */}
              {unicodeFonts.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Unicode / Special Fonts ({unicodeFonts.length} styles)
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {unicodeFonts.map((f, i) => (
                      <div key={i} className="p-3 bg-secondary/30 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant="outline" className="text-[10px]">{f.font}</Badge>
                          <span className="text-[10px] text-muted-foreground">{f.count}x</span>
                        </div>
                        <p className="text-sm font-medium truncate">{f.sample}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Emojis */}
              {emojis.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Top Emojis ({emojis.length} unique)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {emojis.slice(0, 25).map((e, i) => (
                      <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-secondary/30 rounded-full">
                        <span className="text-lg">{e.emoji}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{e.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CTAs */}
              {ctas.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Call-to-Action Phrases ({ctas.length})
                  </p>
                  <div className="space-y-1">
                    {ctas.map((c, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-secondary/30 rounded-lg">
                        <span className="text-sm">"{c.cta}"</span>
                        <Badge variant="secondary" className="text-[10px]">{c.count}x</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Repeated Phrases */}
              {repeated.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Repeated Phrases / Templates ({repeated.length})
                  </p>
                  <div className="space-y-1">
                    {repeated.slice(0, 10).map((r, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-secondary/30 rounded-lg">
                        <span className="text-xs truncate flex-1 mr-2">"{r.phrase}"</span>
                        <Badge variant="secondary" className="text-[10px]">{r.count}x</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Post Structure */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Post Structure Patterns
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {[
                    { label: "Avg lines/post", value: structure.avgLines },
                    { label: "Avg paragraphs", value: structure.avgParagraphs },
                    { label: "Posts with emoji headers", value: structure.hasEmojiHeaders },
                    { label: "Posts with hashtag blocks", value: structure.hasHashtagBlocks },
                    { label: "Posts with CTA ending", value: structure.hasCTA },
                    { label: "Posts with CAPS header", value: structure.capsHeaders },
                  ].map((s, i) => (
                    <div key={i} className="p-3 bg-secondary/30 rounded-lg text-center">
                      <p className="text-lg font-bold">{s.value}</p>
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>
        );
      })()}

      {/* ================================================================= */}
      {/* 3. Media Library                                                  */}
      {/* ================================================================= */}
      {hasResults && allImages.length > 0 && (
        <SectionCard title="Media Library" icon={Image} count={allImages.length} defaultOpen>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {allImages.length} unique images from all posts
              </p>
              <CopyButton
                text={allImages.join("\n")}
                label="Download All URLs"
              />
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5 max-h-[400px] overflow-y-auto">
              {allImages.map((img, i) => (
                <a
                  key={i}
                  href={resolveImgUrl(img)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aspect-square rounded-md overflow-hidden border border-border hover:border-blue-500/50 transition-colors"
                >
                  <img
                    src={resolveImgUrl(img)}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                </a>
              ))}
            </div>
          </div>
        </SectionCard>
      )}

      {/* ================================================================= */}
      {/* 4. All Captions                                                   */}
      {/* ================================================================= */}
      {hasResults && allCaptions.length > 0 && (
        <SectionCard title="All Captions" icon={FileText} count={allCaptions.length} defaultOpen={false}>
          <div className="space-y-3">
            <div className="flex items-center justify-end">
              <CopyButton
                text={allCaptions.join("\n---\n")}
                label="Copy All Captions"
              />
            </div>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {allCaptions.map((cap, i) => (
                <div key={i} className="p-3 bg-secondary/30 rounded-lg">
                  <p className="text-sm whitespace-pre-wrap">{cap}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{cap.length} chars</p>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      )}

      {/* ================================================================= */}
      {/* 5. Posts (sortable, filterable)                                    */}
      {/* ================================================================= */}
      {posts.length > 0 && (
        <SectionCard title="Posts" icon={MessageSquare} count={posts.length} defaultOpen>
          <div className="space-y-3">
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Search posts..."
                  value={postFilter}
                  onChange={(e) => setPostFilter(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <Button
                variant={postImagesOnly ? "default" : "outline"}
                size="sm"
                className="text-xs gap-1 h-8"
                onClick={() => setPostImagesOnly(!postImagesOnly)}
              >
                <Filter className="h-3 w-3" />
                Images only
              </Button>
              <div className="flex items-center gap-1">
                <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                {(["newest", "most-text", "most-images"] as const).map((s) => (
                  <Button
                    key={s}
                    variant={postSort === s ? "default" : "ghost"}
                    size="sm"
                    className="text-[10px] h-7 px-2"
                    onClick={() => setPostSort(s)}
                  >
                    {s === "newest" ? "Newest" : s === "most-text" ? "Most Text" : "Most Images"}
                  </Button>
                ))}
              </div>
            </div>

            {postFilter || postImagesOnly ? (
              <p className="text-[10px] text-muted-foreground">
                Showing {filteredPosts.length} of {posts.length} posts
              </p>
            ) : null}

            {/* Post list */}
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {filteredPosts.map((post, i) => {
                const isExpanded = expandedPost === post.postId;
                const preview = post.text.replace(/\n/g, " ").slice(0, 150);
                const hasMore = post.text.length > 150;

                return (
                  <motion.div
                    key={post.postId || i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    className="p-3 bg-secondary/30 rounded-lg"
                  >
                    <div className="flex gap-3">
                      {/* Thumbnail */}
                      {post.images.length > 0 && (
                        <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-border relative">
                          <img
                            src={resolveImgUrl(post.images[0])}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => (e.currentTarget.style.display = "none")}
                          />
                          {post.images.length > 1 && (
                            <div className="absolute bottom-0 right-0 bg-black/70 text-white text-[9px] px-1 rounded-tl">
                              +{post.images.length - 1}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="text-sm whitespace-pre-wrap">
                          {isExpanded ? post.text : preview}
                          {hasMore && !isExpanded && "..."}
                        </p>
                        {hasMore && (
                          <button
                            onClick={() => setExpandedPost(isExpanded ? null : post.postId)}
                            className="text-[10px] text-blue-500 hover:underline mt-1"
                          >
                            {isExpanded ? "Show less" : "Show more"}
                          </button>
                        )}

                        {/* Engagement + meta */}
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                          {post.likes != null && (
                            <span className="flex items-center gap-0.5">
                              <Heart className="h-2.5 w-2.5" /> {post.likes}
                            </span>
                          )}
                          {post.comments != null && (
                            <span className="flex items-center gap-0.5">
                              <MessageSquare className="h-2.5 w-2.5" /> {post.comments}
                            </span>
                          )}
                          {post.shares != null && (
                            <span className="flex items-center gap-0.5">
                              <Share2 className="h-2.5 w-2.5" /> {post.shares}
                            </span>
                          )}
                          {post.images.length > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Image className="h-2.5 w-2.5" /> {post.images.length}
                            </span>
                          )}
                          {post.date && <span>{new Date(post.date).toLocaleDateString()}</span>}
                        </div>

                        {/* Expanded images grid */}
                        {isExpanded && post.images.length > 1 && (
                          <div className="grid grid-cols-4 gap-1.5 mt-2">
                            {post.images.map((img, j) => (
                              <a
                                key={j}
                                href={resolveImgUrl(img)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="aspect-square rounded-md overflow-hidden border border-border hover:border-blue-500/50"
                              >
                                <img
                                  src={resolveImgUrl(img)}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  onError={(e) => (e.currentTarget.style.display = "none")}
                                />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={postsEndRef} />
            </div>
          </div>
        </SectionCard>
      )}

      {/* ================================================================= */}
      {/* 6. Links & Hashtags                                               */}
      {/* ================================================================= */}
      {hasResults && (allUrlsFromPosts.length > 0 || allHashtags.length > 0 || allMentions.length > 0) && (
        <SectionCard
          title="Links & Hashtags"
          icon={Link2}
          count={allUrlsFromPosts.length + allHashtags.length + allMentions.length}
          defaultOpen={false}
        >
          <div className="space-y-4">
            {/* URLs */}
            {allUrlsFromPosts.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> URLs Found ({allUrlsFromPosts.length})
                </p>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {allUrlsFromPosts.map((u, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-secondary/30 rounded-md text-xs">
                      <a
                        href={u.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline truncate flex-1 mr-2"
                      >
                        {u.url}
                      </a>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {u.count}x
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hashtags */}
            {allHashtags.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Hash className="h-3 w-3" /> Hashtags ({allHashtags.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {allHashtags.map((h) => (
                    <Badge key={h.tag} variant="secondary" className="text-xs">
                      {h.tag}{" "}
                      <span className="ml-1 opacity-60">{h.count}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Mentions */}
            {allMentions.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Users className="h-3 w-3" /> Mentions ({allMentions.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {allMentions.map((m) => (
                    <Badge key={m.mention} variant="secondary" className="text-xs">
                      {m.mention}{" "}
                      <span className="ml-1 opacity-60">{m.count}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* ================================================================= */}
      {/* 7. Export                                                          */}
      {/* ================================================================= */}
      {hasResults && posts.length > 0 && (
        <SectionCard title="Export" icon={Download} defaultOpen={false}>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => {
                const data = { pageInfo, posts, meta: { exportedAt: new Date().toISOString(), totalPosts: posts.length, totalImages: allImages.length } };
                downloadFile(JSON.stringify(data, null, 2), `facebook-scrape-${pageInfo?.name || "export"}.json`, "application/json");
              }}
            >
              <Download className="h-3 w-3" />
              Export as JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => {
                downloadFile(allCaptions.join("\n\n---\n\n"), `facebook-captions-${pageInfo?.name || "export"}.txt`, "text/plain");
              }}
            >
              <FileText className="h-3 w-3" />
              Export Captions as TXT
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => {
                downloadFile(allImages.join("\n"), `facebook-images-${pageInfo?.name || "export"}.txt`, "text/plain");
              }}
            >
              <Image className="h-3 w-3" />
              Export Image URLs as TXT
            </Button>
            <CopyButton
              text={JSON.stringify({ pageInfo, posts }, null, 2)}
              label="Copy All Data"
            />
          </div>
        </SectionCard>
      )}

      {/* Complete banner */}
      {isComplete && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center gap-3"
        >
          <Zap className="h-5 w-5 text-green-500" />
          <div>
            <p className="text-sm font-medium text-green-500">Scrape complete and saved</p>
            <p className="text-xs text-muted-foreground">
              {posts.length} posts captured. Load from history anytime.
            </p>
          </div>
        </motion.div>
      )}

      {/* Empty state */}
      {!isStreaming && posts.length === 0 && !isComplete && (
        <div className="text-center py-16 bg-card border border-border rounded-xl">
          <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground font-medium">Enter a Facebook page URL</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Posts stream in live as the page is scraped. No timeouts — captures everything.
          </p>
        </div>
      )}
    </div>
  );
};

export default AdminFacebookScraper;
