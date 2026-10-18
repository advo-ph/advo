/**
 * Visitor world map — dark, dot-matrix landmass with glowing markers sized by visitor
 * count, per the visitor-analytics plan's amendment (process/general-plans/active/
 * visitor-analytics_PLAN_09-10-26.md, "FUTURISTIC VISITOR MAP").
 *
 * Map geometry is bundled locally (world-atlas + topojson-client + d3-geo) — no runtime
 * CDN fetch, no network request for the basemap. The landmass dot grid is computed once,
 * lazily, on first mount (needs an offscreen <canvas> to rasterize the fill, so it cannot
 * run at module scope / during SSR) and cached at module level for every mount after that.
 *
 * Respects prefers-reduced-motion: the pulse and the arc-draw animation are both wrapped
 * in a `@media (prefers-reduced-motion: no-preference)` rule in VisitorWorldMap.css, so a
 * visitor who has asked for less motion gets the same map with every marker and arc fully
 * drawn and static.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { geoEquirectangular, geoInterpolate, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import landTopology from "world-atlas/land-110m.json";
import type { GeoCityRow } from "@/hooks/useVisitorStats";
import "./VisitorWorldMap.css";

const WIDTH = 960;
const HEIGHT = 480;
const DOT_SPACING = 7;

/** ADVO's home base — every arc converges here. */
const MANILA: [number, number] = [120.9842, 14.5995];

const landFeature = feature(
  landTopology as unknown as Parameters<typeof feature>[0],
  (landTopology as { objects: { land: unknown } }).objects.land as Parameters<typeof feature>[1],
);

const projection = geoEquirectangular().fitSize([WIDTH, HEIGHT], landFeature as GeoJSON.GeoJSON);
const path = geoPath(projection);

/** Computed once per page load (needs a real <canvas>, so it cannot run at module scope). */
let cachedLandDots: Array<[number, number]> | null = null;

function computeLandDots(): Array<[number, number]> {
  if (cachedLandDots) return cachedLandDots;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    cachedLandDots = [];
    return cachedLandDots;
  }

  const canvasPath = geoPath(projection, ctx);
  ctx.beginPath();
  canvasPath(landFeature as GeoJSON.GeoJSON);
  ctx.fillStyle = "#fff";
  ctx.fill();

  const dots: Array<[number, number]> = [];
  for (let y = DOT_SPACING / 2; y < HEIGHT; y += DOT_SPACING) {
    for (let x = DOT_SPACING / 2; x < WIDTH; x += DOT_SPACING) {
      if (ctx.isPointInPath(x, y)) dots.push([x, y]);
    }
  }
  cachedLandDots = dots;
  return dots;
}

/** Visitor-count -> marker radius, clamped so one outlier city cannot swallow the map. */
function markerRadius(viewCount: number, maxViewCount: number): number {
  if (maxViewCount <= 0) return 4;
  const scale = Math.sqrt(viewCount / maxViewCount);
  return 4 + scale * 10;
}

interface CityPoint extends GeoCityRow {
  x: number;
  y: number;
}

export function VisitorWorldMap({ cities }: { cities: GeoCityRow[] }) {
  const [landDots, setLandDots] = useState<Array<[number, number]> | null>(null);
  const [activeCity, setActiveCity] = useState<CityPoint | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLandDots(computeLandDots());
  }, []);

  const points = useMemo<CityPoint[]>(() => {
    return cities
      .filter((c) => c.lat !== null && c.lon !== null)
      .map((c) => {
        const projected = projection([c.lon as number, c.lat as number]);
        return projected ? { ...c, x: projected[0], y: projected[1] } : null;
      })
      .filter((c): c is CityPoint => c !== null);
  }, [cities]);

  const maxViewCount = useMemo(
    () => points.reduce((max, p) => Math.max(max, p.viewCount), 0),
    [points],
  );

  const manilaXY = projection(MANILA);

  const arcs = useMemo(() => {
    if (!manilaXY) return [];
    return points.map((p) => {
      const interpolate = geoInterpolate([p.lon as number, p.lat as number], MANILA);
      const segment = 24;
      const d: string[] = [];
      for (let i = 0; i <= segment; i += 1) {
        const [lon, lat] = interpolate(i / segment);
        const xy = projection([lon, lat]);
        if (!xy) continue;
        d.push(`${i === 0 ? "M" : "L"} ${xy[0].toFixed(1)} ${xy[1].toFixed(1)}`);
      }
      return { key: `${p.country}-${p.city}`, d: d.join(" ") };
    });
  }, [points, manilaXY]);

  return (
    <div ref={containerRef} className="visitor-map relative w-full overflow-hidden rounded-lg border border-border bg-[#060708]">
      <div className="visitor-map-scanline pointer-events-none absolute inset-0" aria-hidden />
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block w-full"
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
        role="img"
        aria-label="World map of visitor locations, with markers sized by visitor count"
      >
        {/* Reference grid: equator, tropics, and a few meridians -- a sensor-sweep accent, not cartographic precision. */}
        <g className="visitor-map-grid" stroke="currentColor" strokeWidth={0.5} fill="none">
          {[-60, -30, 0, 30, 60].map((lat) => {
            const a = projection([-180, lat]);
            const b = projection([180, lat]);
            if (!a || !b) return null;
            return <line key={`lat-${lat}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
          })}
          {[-120, -60, 0, 60, 120].map((lon) => {
            const a = projection([lon, -85]);
            const b = projection([lon, 85]);
            if (!a || !b) return null;
            return <line key={`lon-${lon}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
          })}
        </g>

        {/* Dot-matrix landmass. */}
        <g className="visitor-map-land" fill="currentColor">
          {(landDots ?? []).map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={1.1} />
          ))}
        </g>

        {/* Arcs from each visitor city to Manila. */}
        <g className="visitor-map-arcs" fill="none" stroke="hsl(var(--accent))" strokeWidth={0.8}>
          {arcs.map((arc) => (
            <path key={arc.key} d={arc.d} className="visitor-map-arc-path" />
          ))}
        </g>

        {/* Manila -- the destination every arc converges on. */}
        {manilaXY && (
          <g transform={`translate(${manilaXY[0]}, ${manilaXY[1]})`}>
            <circle r={3.5} fill="hsl(var(--accent))" />
            <circle r={6} fill="none" stroke="hsl(var(--accent))" strokeWidth={1} opacity={0.5} />
          </g>
        )}

        {/* Visitor city markers, sized by view count. */}
        <g>
          {points.map((p) => {
            const r = markerRadius(p.viewCount, maxViewCount);
            return (
              <g
                key={`${p.country}-${p.city}`}
                transform={`translate(${p.x}, ${p.y})`}
                className="visitor-map-marker"
                tabIndex={0}
                role="button"
                aria-label={`${p.city ?? "Unknown city"}, ${p.country ?? "Unknown country"}: ${p.viewCount} view${p.viewCount === 1 ? "" : "s"}`}
                onMouseEnter={() => setActiveCity(p)}
                onMouseLeave={() => setActiveCity((cur) => (cur === p ? null : cur))}
                onFocus={() => setActiveCity(p)}
                onBlur={() => setActiveCity((cur) => (cur === p ? null : cur))}
                onClick={() => setActiveCity((cur) => (cur === p ? null : p))}
              >
                <circle r={r + 5} className="visitor-map-marker-glow" fill="hsl(var(--accent))" opacity={0.18} />
                <circle r={r} className="visitor-map-marker-pulse" fill="hsl(var(--accent))" opacity={0.85} />
                <circle r={Math.max(1.5, r * 0.35)} fill="#fff" />
              </g>
            );
          })}
        </g>
      </svg>

      {activeCity && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: `${(activeCity.x / WIDTH) * 100}%`,
            top: `${(activeCity.y / HEIGHT) * 100}%`,
          }}
        >
          <p className="font-medium text-foreground">{activeCity.city ?? "Unknown city"}</p>
          <p className="text-muted-foreground">
            {activeCity.country ?? "Unknown country"} · {activeCity.viewCount} view
            {activeCity.viewCount === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  );
}

export default VisitorWorldMap;
