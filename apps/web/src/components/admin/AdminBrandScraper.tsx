import { useState, useEffect } from "react";
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
  Monitor,
  Smartphone,
  Tablet,
  Shield,
  Gauge,
  Sparkles,
  FileText,
  Eye,
  Layers,
  GitCompare,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { get, post } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BrandData = Record<string, any>;

const SectionCard = ({
  title,
  icon: Icon,
  count,
  children,
  defaultOpen = false,
  accentColor,
}: {
  title: string;
  icon: React.ElementType;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accentColor?: string;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full p-4 flex items-center justify-between hover:bg-secondary/30 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accentColor || "bg-accent/10"}`}>
            <Icon className={`h-4 w-4 ${accentColor ? "text-white" : "text-accent"}`} />
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

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="p-1 rounded hover:bg-secondary/50 transition-colors" title="Copy">
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
    </button>
  );
};

const ScoreRing = ({ score, label, size = 60 }: { score: number; label: string; size?: number }) => {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={4}
          fill="none" className="text-secondary" />
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={4}
          fill="none" strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <span className="text-lg font-bold" style={{ color, marginTop: -(size / 2 + 8) }}>{score}</span>
      <span className="text-[10px] text-muted-foreground mt-2">{label}</span>
    </div>
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
  const [compareUrl, setCompareUrl] = useState("");
  const [showCompare, setShowCompare] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<BrandData | null>(null);
  const [history, setHistory] = useState<ScrapeHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [activeScreenshot, setActiveScreenshot] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [useFullScrape, setUseFullScrape] = useState(true);

  useEffect(() => {
    get<ScrapeHistoryItem[]>("/api/scrape/history?type=brand").then(res => {
      if (res.data) setHistory(res.data);
    });
  }, []);

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
    if (!normalizedUrl.startsWith("http")) normalizedUrl = `https://${normalizedUrl}`;

    setIsLoading(true);
    setResult(null);

    const endpoint = useFullScrape ? "/api/scrape/brand-full" : "/api/scrape/brand";
    const body: Record<string, unknown> = { url: normalizedUrl };
    if (useFullScrape && compareUrl) {
      let normCompare = compareUrl.trim();
      if (!normCompare.startsWith("http")) normCompare = `https://${normCompare}`;
      body.compareUrl = normCompare;
    }

    const res = await post<BrandData>(endpoint, body);
    if (res.error) {
      toast({ title: "Scrape failed", description: res.error, variant: "destructive" });
    } else if (res.data) {
      setResult(res.data);
      const saveRes = await post("/api/scrape/save", { url: normalizedUrl, type: "brand", data: res.data });
      if (saveRes.error) {
        toast({ title: "Scrape complete (not saved)", description: saveRes.error, variant: "destructive" });
      } else {
        toast({ title: "Scrape complete" });
      }
      const histRes = await get<ScrapeHistoryItem[]>("/api/scrape/history?type=brand");
      if (histRes.data) setHistory(histRes.data);
    }
    setIsLoading(false);
  };

  const screenshots = result?.screenshots as { viewport: string; width: number; height: number; dataUrl: string }[] | undefined;
  const activeShot = screenshots?.find(s => s.viewport === activeScreenshot);
  const palette = result?.colorPalette as { primary: string | null; secondary: string | null; accent: string[]; neutral: string[] } | undefined;
  const typography = result?.typography as { element: string; family: string; size: string; weight: string; lineHeight: string; letterSpacing: string }[] | undefined;
  const components = result?.components as { name: string; selector: string; count: number }[] | undefined;
  const seo = result?.seo as { score: number; checks: { name: string; passed: boolean; value: string }[] } | undefined;
  const perf = result?.performance as Record<string, number> | undefined;
  const animations = result?.animations as { type: string; source: string; details: string }[] | undefined;
  const accessibility = result?.accessibility as { score: number; checks: { name: string; passed: boolean; details: string }[] } | undefined;
  const crawledPages = result?.crawledPages as { url: string; title: string }[] | undefined;
  const comparison = result?.comparison as Record<string, unknown> | undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Brand Scraper</h1>
        <p className="text-muted-foreground">Extract branding, design system, performance, SEO, and accessibility from any website</p>
      </div>

      {/* URL Input */}
      <div className="space-y-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Enter website URL (e.g. stripe.com)" value={url}
              onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleScrape()} className="pl-9" />
          </div>
          <Button onClick={handleScrape} disabled={isLoading || !url}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90 min-w-[120px]">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
            {isLoading ? "Analyzing..." : "Analyze"}
          </Button>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={useFullScrape} onChange={(e) => setUseFullScrape(e.target.checked)}
              className="rounded border-border" />
            Full analysis (screenshots, SEO, performance, accessibility)
          </label>
          <button onClick={() => setShowCompare(!showCompare)} className="text-xs text-accent hover:underline flex items-center gap-1">
            <GitCompare className="h-3 w-3" /> {showCompare ? "Hide compare" : "Compare with another site"}
          </button>
        </div>
        {showCompare && (
          <div className="relative">
            <GitCompare className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Compare URL (e.g. competitor.com)" value={compareUrl}
              onChange={(e) => setCompareUrl(e.target.value)} className="pl-9" />
          </div>
        )}
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
                  <span className="text-xs text-muted-foreground ml-3 flex-shrink-0">{new Date(h.createdAt).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-accent" />
          <p className="text-sm text-muted-foreground">
            {useFullScrape ? "Full analysis: screenshots, crawling pages, testing SEO & performance..." : "Extracting brand data..."}
          </p>
          {useFullScrape && <p className="text-xs text-muted-foreground">This may take 30-60 seconds</p>}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Overview */}
          <div className="p-5 bg-card border border-border rounded-xl shadow-card">
            <div className="flex items-start gap-4">
              {result.meta?.favicon && (
                <img src={result.meta.favicon} alt="" className="w-10 h-10 rounded-lg" onError={(e) => (e.currentTarget.style.display = "none")} />
              )}
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-lg truncate">{result.meta?.ogTitle || result.meta?.title || result.url}</h2>
                {result.meta?.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{result.meta.description}</p>}
                <a href={result.url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-accent hover:underline flex items-center gap-1 mt-2">
                  <ExternalLink className="h-3 w-3" /> {result.url}
                </a>
              </div>
              {result.meta?.ogImage && (
                <img src={result.meta.ogImage} alt="" className="w-40 h-24 object-cover rounded-lg border border-border hidden md:block"
                  onError={(e) => (e.currentTarget.style.display = "none")} />
              )}
            </div>
          </div>

          {/* Scores Row (if full scrape) */}
          {(seo || accessibility || perf) && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {seo && <div className="p-4 bg-card border border-border rounded-xl flex justify-center"><ScoreRing score={seo.score} label="SEO" /></div>}
              {accessibility && <div className="p-4 bg-card border border-border rounded-xl flex justify-center"><ScoreRing score={accessibility.score} label="A11y" /></div>}
              {perf && <div className="p-4 bg-card border border-border rounded-xl flex justify-center">
                <ScoreRing score={Math.max(0, 100 - Math.round((perf.loadTimeMs || 0) / 100))} label="Speed" />
              </div>}
              <div className="p-4 bg-card border border-border rounded-xl text-center flex flex-col justify-center">
                <p className="text-2xl font-bold">{crawledPages?.length || 1}</p>
                <p className="text-xs text-muted-foreground">Pages Crawled</p>
              </div>
            </div>
          )}

          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Colors", value: result.colors?.length || 0, icon: Palette },
              { label: "Fonts", value: result.fonts?.length || 0, icon: Type },
              { label: "Tech", value: result.techStack?.length || 0, icon: Code2 },
              { label: "Images", value: result.images?.length || 0, icon: Image },
              { label: "Features", value: result.features?.length || 0, icon: Zap },
            ].map((stat) => (
              <div key={stat.label} className="p-4 bg-card border border-border rounded-xl text-center">
                <stat.icon className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-lg font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Screenshots */}
          {screenshots && screenshots.length > 0 && (
            <SectionCard title="Screenshots" icon={Monitor} defaultOpen>
              <div className="space-y-3">
                <div className="flex gap-2">
                  {[
                    { key: "desktop", icon: Monitor, label: "Desktop" },
                    { key: "tablet", icon: Tablet, label: "Tablet" },
                    { key: "mobile", icon: Smartphone, label: "Mobile" },
                  ].map(({ key, icon: Ic, label }) => (
                    <Button key={key} variant={activeScreenshot === key ? "default" : "outline"} size="sm"
                      onClick={() => setActiveScreenshot(key as "desktop" | "tablet" | "mobile")} className="gap-1.5">
                      <Ic className="h-3.5 w-3.5" /> {label}
                    </Button>
                  ))}
                </div>
                {activeShot?.dataUrl && (
                  <div className="border border-border rounded-lg overflow-hidden bg-secondary/20">
                    <img src={activeShot.dataUrl} alt={`${activeScreenshot} screenshot`}
                      className="w-full max-h-[600px] object-contain object-top" />
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* Color Palette */}
          {palette && (
            <SectionCard title="Color Palette" icon={Palette} defaultOpen accentColor="bg-gradient-to-br from-pink-500 to-violet-500">
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {palette.primary && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Primary</p>
                      <div className="h-16 rounded-lg border border-border" style={{ backgroundColor: palette.primary }} />
                      <div className="flex items-center gap-1"><span className="text-xs font-mono">{palette.primary}</span><CopyButton text={palette.primary} /></div>
                    </div>
                  )}
                  {palette.secondary && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Secondary</p>
                      <div className="h-16 rounded-lg border border-border" style={{ backgroundColor: palette.secondary }} />
                      <div className="flex items-center gap-1"><span className="text-xs font-mono">{palette.secondary}</span><CopyButton text={palette.secondary} /></div>
                    </div>
                  )}
                  {palette.accent?.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Accent</p>
                      <div className="flex gap-1">
                        {palette.accent.slice(0, 4).map((c: string, i: number) => (
                          <div key={i} className="flex-1 h-16 rounded-lg border border-border" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {palette.accent.slice(0, 4).map((c: string, i: number) => (
                          <span key={i} className="text-[10px] font-mono">{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {palette.neutral?.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Neutral</p>
                      <div className="flex gap-1">
                        {palette.neutral.slice(0, 4).map((c: string, i: number) => (
                          <div key={i} className="flex-1 h-16 rounded-lg border border-border" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {/* All colors grid */}
                <div className="flex flex-wrap gap-2">
                  {(result.colors || []).map((color: { hex: string; count: number }, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-secondary/30 rounded-lg">
                      <div className="w-6 h-6 rounded border border-border" style={{ backgroundColor: color.hex }} />
                      <span className="text-[10px] font-mono">{color.hex}</span>
                      <CopyButton text={color.hex} />
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>
          )}

          {/* Colors (basic mode) */}
          {!palette && result.colors?.length > 0 && (
            <SectionCard title="Colors" icon={Palette} count={result.colors.length} defaultOpen>
              <div className="flex flex-wrap gap-2">
                {result.colors.map((color: { hex: string; count: number }, i: number) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-secondary/30 rounded-lg">
                    <div className="w-8 h-8 rounded-md border border-border shadow-sm" style={{ backgroundColor: color.hex }} />
                    <div>
                      <div className="flex items-center gap-1"><span className="text-xs font-mono">{color.hex}</span><CopyButton text={color.hex} /></div>
                      <span className="text-[10px] text-muted-foreground">used {color.count}x</span>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Typography */}
          {typography && typography.length > 0 && (
            <SectionCard title="Typography Scale" icon={Type} count={typography.length} defaultOpen>
              <div className="space-y-2">
                {typography.map((t, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-[10px] w-10 justify-center font-mono">{t.element}</Badge>
                      <span className="text-sm" style={{ fontFamily: t.family.split(",")[0].replace(/"/g, ""), fontSize: Math.min(parseInt(t.size), 24), fontWeight: parseInt(t.weight) }}>
                        {t.family.split(",")[0].replace(/"/g, "")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                      <span>{t.size}</span>
                      <span>w{t.weight}</span>
                      <span>lh:{t.lineHeight}</span>
                      <CopyButton text={`font-family: ${t.family}; font-size: ${t.size}; font-weight: ${t.weight}; line-height: ${t.lineHeight};`} />
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Fonts (basic mode) */}
          {!typography && result.fonts?.length > 0 && (
            <SectionCard title="Fonts" icon={Type} count={result.fonts.length} defaultOpen>
              <div className="space-y-2">
                {result.fonts.map((font: { family: string; source: string }, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                    <div><p className="text-sm font-medium" style={{ fontFamily: font.family }}>{font.family}</p><p className="text-[10px] text-muted-foreground">{font.source}</p></div>
                    <CopyButton text={font.family} />
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Components */}
          {components && components.length > 0 && (
            <SectionCard title="UI Components" icon={Layers} count={components.length}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {components.map((c, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                    <span className="text-sm">{c.name}</span>
                    <Badge variant="secondary" className="text-xs">{c.count}x</Badge>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Tech Stack */}
          <SectionCard title="Tech Stack" icon={Code2} count={result.techStack?.length || 0} defaultOpen>
            <div className="flex flex-wrap gap-2">
              {(result.techStack || []).map((tech: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs">{tech}</Badge>
              ))}
            </div>
          </SectionCard>

          {/* Features */}
          <SectionCard title="Features" icon={Zap} count={result.features?.length || 0} defaultOpen>
            <div className="flex flex-wrap gap-2">
              {(result.features || []).map((f: string, i: number) => (
                <Badge key={i} variant="secondary" className="text-xs gap-1"><Zap className="h-3 w-3" /> {f}</Badge>
              ))}
            </div>
          </SectionCard>

          {/* Animations */}
          {animations && animations.length > 0 && (
            <SectionCard title="Animations" icon={Sparkles} count={animations.length}>
              <div className="space-y-2">
                {animations.map((a, i) => (
                  <div key={i} className="p-3 bg-secondary/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{a.type}</Badge>
                      <span className="text-xs text-muted-foreground">{a.source}</span>
                    </div>
                    <p className="text-xs mt-1">{a.details}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* SEO Audit */}
          {seo && (
            <SectionCard title="SEO Audit" icon={BarChart3} count={seo.checks.filter(c => c.passed).length}>
              <div className="space-y-2">
                {seo.checks.map((ch, i) => (
                  <div key={i} className={`flex items-start gap-3 p-2.5 rounded-lg ${ch.passed ? "bg-green-500/5" : "bg-red-500/5"}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${ch.passed ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"}`}>
                      {ch.passed ? <Check className="h-3 w-3" /> : <span className="text-xs">!</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{ch.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{ch.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Performance */}
          {perf && (
            <SectionCard title="Performance" icon={Gauge}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Load Time", value: `${((perf.loadTimeMs || 0) / 1000).toFixed(1)}s` },
                  { label: "DOM Nodes", value: perf.domNodes?.toLocaleString() },
                  { label: "JS Heap", value: `${(perf.jsHeapMB || 0).toFixed(1)}MB` },
                  { label: "Page Weight", value: `${((perf.estimatedPageWeightKB || 0) / 1024).toFixed(1)}MB` },
                  { label: "Requests", value: perf.totalRequests },
                  { label: "JS Files", value: perf.jsFiles },
                  { label: "CSS Files", value: perf.cssFiles },
                ].map((m, i) => (
                  <div key={i} className="p-3 bg-secondary/30 rounded-lg text-center">
                    <p className="text-sm font-bold">{m.value}</p>
                    <p className="text-[10px] text-muted-foreground">{m.label}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Accessibility */}
          {accessibility && (
            <SectionCard title="Accessibility" icon={Eye} count={accessibility.checks.filter(c => c.passed).length}>
              <div className="space-y-2">
                {accessibility.checks.map((ch, i) => (
                  <div key={i} className={`flex items-start gap-3 p-2.5 rounded-lg ${ch.passed ? "bg-green-500/5" : "bg-red-500/5"}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${ch.passed ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"}`}>
                      {ch.passed ? <Check className="h-3 w-3" /> : <span className="text-xs">!</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{ch.name}</p>
                      <p className="text-xs text-muted-foreground">{ch.details}</p>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Comparison */}
          {comparison && (
            <SectionCard title="Comparison" icon={GitCompare} defaultOpen>
              <div className="space-y-4">
                {Object.entries(comparison).map(([key, val]) => {
                  const v = val as { onlyInMain: string[]; onlyInCompare: string[]; shared: string[] };
                  return (
                    <div key={key}>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{key}</p>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground mb-1">Only in main ({v.onlyInMain?.length || 0})</p>
                          {v.onlyInMain?.slice(0, 8).map((item: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px] mr-1 mb-1">{item}</Badge>
                          ))}
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">Shared ({v.shared?.length || 0})</p>
                          {v.shared?.slice(0, 8).map((item: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-[10px] mr-1 mb-1">{item}</Badge>
                          ))}
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">Only in compare ({v.onlyInCompare?.length || 0})</p>
                          {v.onlyInCompare?.slice(0, 8).map((item: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px] mr-1 mb-1 border-orange-500/30 text-orange-500">{item}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* Logos & Icons */}
          {((result.logos?.length || 0) > 0 || (result.icons?.length || 0) > 0) && (
            <SectionCard title="Logos & Icons" icon={Image} count={(result.logos?.length || 0) + (result.icons?.length || 0)}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(result.logos || []).map((logo: { url: string; type: string; size: string | null }, i: number) => (
                  <div key={i} className="p-3 bg-secondary/30 rounded-lg text-center">
                    <img src={logo.url} alt="" className="max-h-16 mx-auto mb-2 object-contain" onError={(e) => (e.currentTarget.style.display = "none")} />
                    <p className="text-[10px] text-muted-foreground">{logo.type}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* CSS Variables */}
          {result.cssVariables?.length > 0 && (
            <SectionCard title="CSS Variables" icon={Variable} count={result.cssVariables.length}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-[300px] overflow-y-auto">
                {result.cssVariables.map((v: { name: string; value: string }, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-secondary/30 rounded text-xs font-mono gap-2">
                    <span className="text-muted-foreground truncate">{v.name}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {v.value.match(/^#[0-9a-f]{3,8}$/i) && <div className="w-3 h-3 rounded border" style={{ backgroundColor: v.value }} />}
                      <span className="truncate max-w-[150px]">{v.value}</span>
                      <CopyButton text={`var(${v.name})`} />
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Links */}
          <SectionCard title="Links" icon={Link2} count={(result.links?.navigation?.length || 0) + (result.links?.social?.length || 0)}>
            <div className="space-y-4">
              {result.links?.navigation?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Navigation</p>
                  <div className="flex flex-wrap gap-2">
                    {result.links.navigation.map((link: { text: string; href: string }, i: number) => (
                      <a key={i} href={link.href} target="_blank" rel="noopener noreferrer"
                        className="text-xs px-2 py-1 bg-secondary/50 rounded hover:bg-secondary transition-colors">{link.text}</a>
                    ))}
                  </div>
                </div>
              )}
              {result.links?.social?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Social</p>
                  <div className="flex flex-wrap gap-2">
                    {result.links.social.map((link: { platform: string; url: string }, i: number) => (
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
          <SectionCard title="Page Structure" icon={Layout} count={result.structure?.headings?.length || 0}>
            <div className="space-y-4">
              <div className="space-y-1 max-h-[250px] overflow-y-auto">
                {(result.structure?.headings || []).map((h: { level: number; text: string }, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm" style={{ paddingLeft: `${(h.level - 1) * 16}px` }}>
                    <Badge variant="outline" className="text-[10px] w-7 justify-center flex-shrink-0">H{h.level}</Badge>
                    <span className="truncate">{h.text}</span>
                  </div>
                ))}
              </div>
              {result.structure?.buttons?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">CTAs</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.structure.buttons.map((btn: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">{btn}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Crawled Pages */}
          {crawledPages && crawledPages.length > 1 && (
            <SectionCard title="Crawled Pages" icon={FileText} count={crawledPages.length}>
              <div className="space-y-1.5">
                {crawledPages.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-secondary/30 rounded-lg">
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline truncate flex-1">{p.url}</a>
                    <span className="text-[10px] text-muted-foreground ml-2 truncate max-w-[200px]">{p.title}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Images */}
          {result.images?.length > 0 && (
            <SectionCard title="Images" icon={Image} count={result.images.length}>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2 max-h-[400px] overflow-y-auto">
                {result.images.map((img: { src: string; alt: string | null }, i: number) => (
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
          <p className="text-muted-foreground font-medium">Enter a URL to analyze</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Extract colors, fonts, typography scale, tech stack, SEO audit, performance metrics, accessibility score, and responsive screenshots from any website.
          </p>
        </div>
      )}
    </div>
  );
};

export default AdminBrandScraper;
