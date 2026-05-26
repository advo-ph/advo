/**
 * Brand Analysis Service
 *
 * Takes raw FB page scrape data and builds a brand intelligence profile:
 * 1. Post analytics (engagement rates, frequency, best times)
 * 2. Gemini vision analysis (colors, logo, content type, OCR)
 * 3. Brand identity extraction (style, industry, services)
 * 4. Portfolio curation (best images scored by Gemini)
 *
 * Cost: ~$0.01/image × 50 images = ~$0.50 per full analysis
 */

import { VertexAI } from "@google-cloud/vertexai";

// ─── Types ────────────────────────────────────────────

interface FBPostData {
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
  profileImage: string | null;
  coverImage: string | null;
}

interface ImageAnalysis {
  imageUrl: string;
  brandColors: string[];
  contentType: string;
  hasLogo: boolean;
  logoDescription: string | null;
  ocrText: string | null;
  portfolioScore: number;
  industrySignals: string[];
  visualStyle: string;
  description: string;
}

interface PostAnalytics {
  totalPosts: number;
  postsWithText: number;
  postsWithImages: number;
  postsWithVideo: number;
  avgLikes: number;
  avgComments: number;
  avgShares: number;
  engagementRate: number;
  postsPerWeek: number;
  bestPostingDay: string;
  bestPostingHour: number;
  topPosts: Array<{ text: string; likes: number; comments: number; images: string[] }>;
  contentTypes: Record<string, number>;
  postingSchedule: { dayOfWeek: number[]; hourOfDay: number[] };
}

interface BrandProfile {
  pageInfo: FBPageInfo;
  analytics: PostAnalytics;
  brand: {
    name: string;
    industry: string;
    colors: string[];
    style: string;
    logoDescription: string | null;
    tagline: string | null;
    services: string[];
    technologies: string[];
  };
  portfolio: Array<{
    imageUrl: string;
    caption: string;
    score: number;
    contentType: string;
  }>;
  imageAnalyses: ImageAnalysis[];
  analyzedAt: string;
}

// ─── Post Analytics (no AI needed) ───────────────────

export function analyzePostEngagement(posts: FBPostData[], pageInfo: FBPageInfo): PostAnalytics {
  const withText = posts.filter(p => p.text && p.text.length > 10 && p.text !== "[Image/Video post]");
  const withImages = posts.filter(p => p.images.length > 0);
  const withVideo = posts.filter(p => p.videoUrl);

  const likes = posts.map(p => p.likes || 0);
  const comments = posts.map(p => p.comments || 0);
  const shares = posts.map(p => p.shares || 0);

  const avgLikes = likes.length > 0 ? Math.round(likes.reduce((a, b) => a + b, 0) / likes.length) : 0;
  const avgComments = comments.length > 0 ? Math.round(comments.reduce((a, b) => a + b, 0) / comments.length) : 0;
  const avgShares = shares.length > 0 ? Math.round(shares.reduce((a, b) => a + b, 0) / shares.length) : 0;

  // Engagement rate = (likes + comments + shares) / followers
  const followers = parseInt(String(pageInfo.followers || pageInfo.likes || "0").replace(/[^0-9]/g, "")) || 1;
  const totalEngagement = likes.reduce((a, b) => a + b, 0) + comments.reduce((a, b) => a + b, 0) + shares.reduce((a, b) => a + b, 0);
  const engagementRate = Math.round(totalEngagement / posts.length / followers * 10000) / 100;

  // Posting frequency
  const timestamps = posts.filter(p => p.timestamp).map(p => p.timestamp!).sort();
  let postsPerWeek = 0;
  if (timestamps.length >= 2) {
    const span = timestamps[timestamps.length - 1] - timestamps[0];
    const weeks = Math.max(1, span / (7 * 24 * 60 * 60));
    postsPerWeek = Math.round(posts.length / weeks * 10) / 10;
  }

  // Best posting time
  const dayCount = new Array(7).fill(0);
  const hourCount = new Array(24).fill(0);
  const dayEngagement = new Array(7).fill(0);
  const hourEngagement = new Array(24).fill(0);

  for (const post of posts) {
    if (!post.timestamp) continue;
    const d = new Date(post.timestamp * 1000);
    const day = d.getUTCDay();
    const hour = d.getUTCHours();
    const eng = (post.likes || 0) + (post.comments || 0) + (post.shares || 0);
    dayCount[day]++;
    hourCount[hour]++;
    dayEngagement[day] += eng;
    hourEngagement[hour] += eng;
  }

  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const bestDayIdx = dayEngagement.indexOf(Math.max(...dayEngagement));
  const bestHour = hourEngagement.indexOf(Math.max(...hourEngagement));

  // Content categorization (keyword-based)
  const contentTypes: Record<string, number> = {};
  for (const post of withText) {
    const text = post.text.toLowerCase();
    let type = "general";
    if (text.match(/testimonial|review|thank|feedback|client said/)) type = "testimonial";
    else if (text.match(/project|completed|delivered|built|designed|developed/)) type = "project_showcase";
    else if (text.match(/hiring|join|career|opportunity|looking for/)) type = "hiring";
    else if (text.match(/event|webinar|workshop|seminar|conference/)) type = "event";
    else if (text.match(/sale|discount|promo|offer|free|limited/)) type = "promotion";
    else if (text.match(/tip|tutorial|how to|guide|learn/)) type = "educational";
    else if (text.match(/happy|merry|christmas|new year|holiday|birthday|anniversary/)) type = "seasonal";
    else if (text.match(/team|office|culture|behind the scenes|day in/)) type = "behind_the_scenes";
    contentTypes[type] = (contentTypes[type] || 0) + 1;
  }

  // Top posts by engagement
  const topPosts = [...posts]
    .filter(p => p.text && p.text.length > 10)
    .sort((a, b) => ((b.likes || 0) + (b.comments || 0)) - ((a.likes || 0) + (a.comments || 0)))
    .slice(0, 10)
    .map(p => ({
      text: p.text.slice(0, 200),
      likes: p.likes || 0,
      comments: p.comments || 0,
      images: p.images.slice(0, 3),
    }));

  return {
    totalPosts: posts.length,
    postsWithText: withText.length,
    postsWithImages: withImages.length,
    postsWithVideo: withVideo.length,
    avgLikes,
    avgComments,
    avgShares,
    engagementRate,
    postsPerWeek,
    bestPostingDay: days[bestDayIdx],
    bestPostingHour: bestHour,
    topPosts,
    contentTypes,
    postingSchedule: { dayOfWeek: dayCount, hourOfDay: hourCount },
  };
}

// ─── Gemini Vision Analysis ──────────────────────────

let geminiModel: any = null;

function initGemini(): boolean {
  try {
    const project = process.env.VERTEX_PROJECT_ID || "sisia-2";
    const location = process.env.VERTEX_LOCATION || "global";
    const opts: any = { project, location };
    if (location === "global") opts.apiEndpoint = "aiplatform.googleapis.com";
    const vertexAI = new VertexAI(opts);
    geminiModel = vertexAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    });
    return true;
  } catch (err) {
    console.error("[BrandAnalysis] Gemini init failed:", err);
    return false;
  }
}

async function analyzeImage(imageUrl: string): Promise<ImageAnalysis | null> {
  if (!geminiModel) return null;

  try {
    // Download image and convert to base64
    const resp = await fetch(imageUrl, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) return null;
    const buffer = Buffer.from(await resp.arrayBuffer());
    const base64 = buffer.toString("base64");
    const mimeType = resp.headers.get("content-type") || "image/jpeg";

    const prompt = `Analyze this image from a business Facebook page. Return JSON:
{
  "brandColors": ["#hex1", "#hex2", "#hex3"],  // Top 3-5 dominant colors as hex
  "contentType": "project_showcase|team_photo|product|event|infographic|testimonial|promotional|logo|other",
  "hasLogo": boolean,
  "logoDescription": "Description of logo if visible, null otherwise",
  "ocrText": "All visible text in the image, null if none",
  "portfolioScore": 1-10,  // How good is this for a website portfolio? 10=professional showcase
  "industrySignals": ["real estate", "tech"],  // What industry does this suggest?
  "visualStyle": "modern|classic|minimal|bold|luxury|casual|corporate|creative",
  "description": "One sentence describing what's in this image"
}`;

    const result = await geminiModel.generateContent([
      prompt,
      { inlineData: { mimeType, data: base64 } },
    ]);

    const text = result.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(text);

    return {
      imageUrl,
      brandColors: parsed.brandColors || [],
      contentType: parsed.contentType || "other",
      hasLogo: parsed.hasLogo || false,
      logoDescription: parsed.logoDescription || null,
      ocrText: parsed.ocrText || null,
      portfolioScore: parsed.portfolioScore || 0,
      industrySignals: parsed.industrySignals || [],
      visualStyle: parsed.visualStyle || "other",
      description: parsed.description || "",
    };
  } catch (err) {
    console.error(`[BrandAnalysis] Image analysis failed: ${err}`);
    return null;
  }
}

async function analyzeBrandFromPosts(posts: FBPostData[], pageInfo: FBPageInfo): Promise<{
  industry: string;
  style: string;
  services: string[];
  tagline: string | null;
  technologies: string[];
}> {
  if (!geminiModel) return { industry: "Unknown", style: "Unknown", services: [], tagline: null, technologies: [] };

  // Combine top post texts for context
  const sampleTexts = posts
    .filter(p => p.text && p.text.length > 20 && p.text !== "[Image/Video post]")
    .slice(0, 20)
    .map(p => p.text.slice(0, 200))
    .join("\n---\n");

  const prompt = `Analyze these Facebook page posts from "${pageInfo.name || "a business"}".
Category: ${pageInfo.category || "Unknown"}
Description: ${pageInfo.description || "None"}
Website: ${pageInfo.website || "None"}

Sample posts:
${sampleTexts}

Return JSON:
{
  "industry": "The primary industry (e.g., 'Real Estate Development', 'Digital Marketing Agency', 'Restaurant')",
  "style": "Brand voice/style: professional|casual|luxury|fun|corporate|creative|technical",
  "services": ["Service 1", "Service 2"],  // What does this business offer? Max 5
  "tagline": "Their likely tagline or value proposition, null if unclear",
  "technologies": ["Tech 1"]  // Any tech/platforms mentioned (React, WordPress, Shopify, etc.)
}`;

  try {
    const result = await geminiModel.generateContent(prompt);
    const text = result.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return JSON.parse(text);
  } catch {
    return { industry: "Unknown", style: "Unknown", services: [], tagline: null, technologies: [] };
  }
}

// ─── Main Analysis Pipeline ──────────────────────────

export async function analyzeBrand(
  posts: FBPostData[],
  pageInfo: FBPageInfo,
  photos: string[],
  options: { maxImages?: number; skipGemini?: boolean } = {}
): Promise<BrandProfile> {
  const maxImages = options.maxImages || 30;
  const skipGemini = options.skipGemini || false;

  console.log(`[BrandAnalysis] Starting: ${pageInfo.name || "Unknown"}`);
  console.log(`  Posts: ${posts.length}, Photos: ${photos.length}, Gemini: ${skipGemini ? "skip" : "enabled"}`);

  // 1. Post analytics (always runs, no AI)
  const analytics = analyzePostEngagement(posts, pageInfo);
  console.log(`  Analytics: ${analytics.totalPosts} posts, ${analytics.engagementRate}% engagement, ${analytics.postsPerWeek}/week`);

  // 2. Gemini analysis
  let imageAnalyses: ImageAnalysis[] = [];
  let brandInfo = { industry: "Unknown", style: "Unknown", services: [] as string[], tagline: null as string | null, technologies: [] as string[] };

  if (!skipGemini) {
    const geminiReady = initGemini();
    if (geminiReady) {
      // Analyze brand from post texts
      console.log("  Analyzing brand identity from posts...");
      brandInfo = await analyzeBrandFromPosts(posts, pageInfo);
      console.log(`  Brand: ${brandInfo.industry} | ${brandInfo.style} | Services: ${brandInfo.services.join(", ")}`);

      // Collect unique images for vision analysis
      const allImages = new Set<string>();
      for (const post of posts) {
        for (const img of post.images) allImages.add(img);
      }
      for (const img of photos) allImages.add(img);

      const imagesToAnalyze = Array.from(allImages).slice(0, maxImages);
      console.log(`  Analyzing ${imagesToAnalyze.length} images with Gemini...`);

      for (let i = 0; i < imagesToAnalyze.length; i++) {
        process.stdout.write(`\r    [${i + 1}/${imagesToAnalyze.length}]`);
        const result = await analyzeImage(imagesToAnalyze[i]);
        if (result) imageAnalyses.push(result);
        await new Promise(r => setTimeout(r, 200)); // Rate limit
      }
      console.log(`\n  Analyzed ${imageAnalyses.length} images`);
    }
  }

  // 3. Aggregate brand colors
  const colorCounts: Record<string, number> = {};
  for (const img of imageAnalyses) {
    for (const color of img.brandColors) {
      colorCounts[color] = (colorCounts[color] || 0) + 1;
    }
  }
  const topColors = Object.entries(colorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([color]) => color);

  // 4. Logo detection
  const logoAnalyses = imageAnalyses.filter(img => img.hasLogo);
  const logoDescription = logoAnalyses.length > 0 ? logoAnalyses[0].logoDescription : null;

  // 5. Portfolio curation
  const portfolio = imageAnalyses
    .filter(img => img.portfolioScore >= 6)
    .sort((a, b) => b.portfolioScore - a.portfolioScore)
    .slice(0, 20)
    .map(img => ({
      imageUrl: img.imageUrl,
      caption: img.description,
      score: img.portfolioScore,
      contentType: img.contentType,
    }));

  // 6. Style consensus
  const styleCounts: Record<string, number> = {};
  for (const img of imageAnalyses) {
    styleCounts[img.visualStyle] = (styleCounts[img.visualStyle] || 0) + 1;
  }
  const dominantStyle = Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || brandInfo.style;

  return {
    pageInfo,
    analytics,
    brand: {
      name: pageInfo.name || "Unknown",
      industry: brandInfo.industry,
      colors: topColors,
      style: dominantStyle,
      logoDescription,
      tagline: brandInfo.tagline,
      services: brandInfo.services,
      technologies: brandInfo.technologies,
    },
    portfolio,
    imageAnalyses,
    analyzedAt: new Date().toISOString(),
  };
}
