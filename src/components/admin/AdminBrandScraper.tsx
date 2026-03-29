import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Loader2,
  Palette,
  Type,
  Code2,
  Image,
  Link2,
  Layout,
  Zap,
  Globe,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Variable,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { get, post } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface BrandData {
  url: string;
  meta: {
    title: string | null;
    description: string | null;
    ogImage: string | null;
    ogTitle: string | null;
    favicon: string | null;
    themeColor: string | null;
    author: string | null;
    keywords: string[];
  };
  colors: { hex: string; source: string; count: number }[];
  fonts: { family: string; source: string }[];
  logos: { url: string; type: string; size: string | null }[];
  icons: { url: string; rel: string; sizes: string | null }[];
  techStack: string[];
  links: {
    navigation: { text: string; href: string }[];
    social: { platform: string; url: string }[];
    external: string[];
  };
  images: { src: string; alt: string | null; width: string | null; height: string | null }[];
  structure: {
    headings: { level: number; text: string }[];
    sections: string[];
    forms: number;
    buttons: string[];
    inputs: string[];
  };
  features: string[];
  cssVariables: { name: string; value: string }[];
  rawCssUrls: string[];
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
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-accent" />
          </div>
          <span className="font-medium text-sm">{title}</span>
          {count !== undefined && (
            <Badge variant="secondary" className="text-xs">{count}</Badge>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
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

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="p-1 rounded hover:bg-secondary/50 transition-colors"
      title="Copy"
    >
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

const AdminBrandScraper = () => {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<BrandData | null>(null);
  const [history, setHistory] = useState<ScrapeHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load history on mount
  useState(() => {
    get<ScrapeHistoryItem[]>("/api/scrape/history?type=brand").then(res => {
      if (res.data) setHistory(res.data);
    });
  });

  const loadFromHistory = async (id: number) => {
    const res = await get<{ data: BrandData }>(`/api/scrape/history/${id}`);
    if (res.data) {
      setResult((res.data as unknown as { data: BrandData }).data);
      setShowHistory(false);
      toast({ title: "Loaded from history" });
    }
  };

  const handleScrape = async () => {
    if (!url) return;

    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http")) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    setIsLoading(true);
    setResult(null);

    const res = await post<BrandData>("/api/scrape/brand", { url: normalizedUrl });

    if (res.error) {
      toast({ title: "Scrape failed", description: res.error, variant: "destructive" });
    } else if (res.data) {
      setResult(res.data);
      // Auto-save to history
      await post("/api/scrape/save", { url: normalizedUrl, type: "brand", data: res.data });
      // Refresh history
      const histRes = await get<ScrapeHistoryItem[]>("/api/scrape/history?type=brand");
      if (histRes.data) setHistory(histRes.data);
      toast({ title: "Scrape complete", description: `Found ${res.data.colors.length} colors, ${res.data.fonts.length} fonts, ${res.data.features.length} features` });
    }
    setIsLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Brand Scraper</h1>
        <p className="text-muted-foreground">
          Extract branding, design language, tech stack, and features from any website
        </p>
      </div>

      {/* URL Input */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Enter website URL (e.g. stripe.com)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleScrape()}
            className="pl-9"
          />
        </div>
        <Button onClick={handleScrape} disabled={isLoading || !url} className="rounded-full bg-foreground text-background hover:bg-foreground/90 min-w-[120px]">
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
                  <span className="text-sm truncate flex-1">{h.url.replace(/^https?:\/\//, "")}</span>
                  <span className="text-xs text-muted-foreground ml-3 flex-shrink-0">
                    {new Date(h.createdAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-accent" />
          <p className="text-sm text-muted-foreground">Fetching and analyzing website...</p>
          <p className="text-xs text-muted-foreground">Extracting colors, fonts, tech stack, features...</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Overview Card */}
          <div className="p-5 bg-card border border-border rounded-xl shadow-card">
            <div className="flex items-start gap-4">
              {result.meta.favicon && (
                <img src={result.meta.favicon} alt="" className="w-10 h-10 rounded-lg" onError={(e) => (e.currentTarget.style.display = "none")} />
              )}
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-lg truncate">{result.meta.ogTitle || result.meta.title || result.url}</h2>
                {result.meta.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{result.meta.description}</p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <a href={result.url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-accent hover:underline flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> {result.url}
                  </a>
                </div>
              </div>
              {result.meta.ogImage && (
                <img src={result.meta.ogImage} alt="" className="w-40 h-24 object-cover rounded-lg border border-border hidden md:block"
                  onError={(e) => (e.currentTarget.style.display = "none")} />
              )}
            </div>
            {result.meta.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {result.meta.keywords.slice(0, 10).map((kw, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">{kw}</Badge>
                ))}
              </div>
            )}
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Colors", value: result.colors.length, icon: Palette },
              { label: "Fonts", value: result.fonts.length, icon: Type },
              { label: "Tech", value: result.techStack.length, icon: Code2 },
              { label: "Images", value: result.images.length, icon: Image },
              { label: "Features", value: result.features.length, icon: Zap },
            ].map((stat) => (
              <div key={stat.label} className="p-4 bg-card border border-border rounded-xl text-center">
                <stat.icon className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-lg font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Colors */}
          <SectionCard title="Colors" icon={Palette} count={result.colors.length} defaultOpen>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {result.colors.map((color, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-secondary/30 rounded-lg">
                    <div className="w-8 h-8 rounded-md border border-border shadow-sm" style={{ backgroundColor: color.hex }} />
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-mono">{color.hex}</span>
                        <CopyButton text={color.hex} />
                      </div>
                      <span className="text-[10px] text-muted-foreground">used {color.count}x</span>
                    </div>
                  </div>
                ))}
              </div>
              {result.meta.themeColor && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-4 h-4 rounded border" style={{ backgroundColor: result.meta.themeColor }} />
                  Theme color: <span className="font-mono">{result.meta.themeColor}</span>
                </div>
              )}
            </div>
          </SectionCard>

          {/* CSS Variables */}
          {result.cssVariables.length > 0 && (
            <SectionCard title="CSS Variables" icon={Variable} count={result.cssVariables.length}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-[300px] overflow-y-auto">
                {result.cssVariables.map((v, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-secondary/30 rounded text-xs font-mono gap-2">
                    <span className="text-muted-foreground truncate">{v.name}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {v.value.match(/^#[0-9a-f]{3,8}$/i) && (
                        <div className="w-3 h-3 rounded border" style={{ backgroundColor: v.value }} />
                      )}
                      <span className="truncate max-w-[150px]">{v.value}</span>
                      <CopyButton text={`var(${v.name})`} />
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Fonts */}
          <SectionCard title="Fonts" icon={Type} count={result.fonts.length} defaultOpen>
            <div className="space-y-2">
              {result.fonts.map((font, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                  <div>
                    <p className="text-sm font-medium" style={{ fontFamily: font.family }}>{font.family}</p>
                    <p className="text-[10px] text-muted-foreground">{font.source}</p>
                  </div>
                  <CopyButton text={font.family} />
                </div>
              ))}
              {result.fonts.length === 0 && <p className="text-sm text-muted-foreground">No custom fonts detected</p>}
            </div>
          </SectionCard>

          {/* Tech Stack */}
          <SectionCard title="Tech Stack" icon={Code2} count={result.techStack.length} defaultOpen>
            <div className="flex flex-wrap gap-2">
              {result.techStack.map((tech, i) => (
                <Badge key={i} variant="outline" className="text-xs">{tech}</Badge>
              ))}
              {result.techStack.length === 0 && <p className="text-sm text-muted-foreground">No tech detected</p>}
            </div>
          </SectionCard>

          {/* Features */}
          <SectionCard title="Features Detected" icon={Zap} count={result.features.length} defaultOpen>
            <div className="flex flex-wrap gap-2">
              {result.features.map((feature, i) => (
                <Badge key={i} variant="secondary" className="text-xs gap-1">
                  <Zap className="h-3 w-3" /> {feature}
                </Badge>
              ))}
              {result.features.length === 0 && <p className="text-sm text-muted-foreground">No features detected</p>}
            </div>
          </SectionCard>

          {/* Logos & Icons */}
          {(result.logos.length > 0 || result.icons.length > 0) && (
            <SectionCard title="Logos & Icons" icon={Image} count={result.logos.length + result.icons.length}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {result.logos.map((logo, i) => (
                  <div key={i} className="p-3 bg-secondary/30 rounded-lg text-center">
                    <img src={logo.url} alt="" className="max-h-16 mx-auto mb-2 object-contain"
                      onError={(e) => (e.currentTarget.style.display = "none")} />
                    <p className="text-[10px] text-muted-foreground">{logo.type}</p>
                    {logo.size && <p className="text-[10px] text-muted-foreground">{logo.size}</p>}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Navigation & Social */}
          <SectionCard title="Links" icon={Link2} count={result.links.navigation.length + result.links.social.length}>
            <div className="space-y-4">
              {result.links.navigation.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Navigation</p>
                  <div className="flex flex-wrap gap-2">
                    {result.links.navigation.map((link, i) => (
                      <a key={i} href={link.href} target="_blank" rel="noopener noreferrer"
                        className="text-xs px-2 py-1 bg-secondary/50 rounded hover:bg-secondary transition-colors">
                        {link.text}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {result.links.social.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Social</p>
                  <div className="flex flex-wrap gap-2">
                    {result.links.social.map((link, i) => (
                      <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs px-2 py-1 bg-secondary/50 rounded hover:bg-secondary transition-colors">
                        <Globe className="h-3 w-3" /> {link.platform}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Page Structure */}
          <SectionCard title="Page Structure" icon={Layout} count={result.structure.headings.length}>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Content Hierarchy</p>
                <div className="space-y-1 max-h-[250px] overflow-y-auto">
                  {result.structure.headings.map((h, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm" style={{ paddingLeft: `${(h.level - 1) * 16}px` }}>
                      <Badge variant="outline" className="text-[10px] w-7 justify-center flex-shrink-0">H{h.level}</Badge>
                      <span className="truncate">{h.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {result.structure.buttons.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Buttons / CTAs</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.structure.buttons.map((btn, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{btn}</Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Sections: {result.structure.sections.length}</span>
                <span>Forms: {result.structure.forms}</span>
                <span>Inputs: {result.structure.inputs.length}</span>
              </div>
            </div>
          </SectionCard>

          {/* Images */}
          {result.images.length > 0 && (
            <SectionCard title="Images" icon={Image} count={result.images.length}>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2 max-h-[400px] overflow-y-auto">
                {result.images.map((img, i) => (
                  <a key={i} href={img.src} target="_blank" rel="noopener noreferrer"
                    className="block aspect-square rounded-lg border border-border overflow-hidden hover:border-accent/50 transition-colors">
                    <img src={img.src} alt={img.alt || ""} className="w-full h-full object-cover"
                      onError={(e) => (e.currentTarget.parentElement!.style.display = "none")} />
                  </a>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !result && (
        <div className="text-center py-16 bg-card border border-border rounded-xl">
          <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground font-medium">Enter a URL to scrape</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Extract colors, fonts, logos, tech stack, design patterns, and features from any website.
            Great for client onboarding and competitive analysis.
          </p>
        </div>
      )}
    </div>
  );
};

export default AdminBrandScraper;
