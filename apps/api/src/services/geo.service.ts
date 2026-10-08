/**
 * Server-side, offline IP → city geolocation (visitor-analytics plan, §4.2).
 *
 * Reads a local MMDB file (DB-IP City Lite, CC BY 4.0 — attribution lives on
 * apps/web/src/pages/legal/Privacy.tsx). No external API call per request, and the raw
 * IP string is read, passed to the reader, and discarded inside resolveGeo — it is never
 * logged, never returned, never stored.
 *
 * Geo is ENRICHMENT, never a hard dependency: a missing or unreadable mmdb file degrades
 * every lookup to null rather than failing ingest. The file does not ship in git (it is
 * ~80 MB+ and gitignored under apps/api/data/geo/) — see scripts/update-geo-db.sh and
 * docs/SETUP.md for how an operator puts it on a box.
 */
import { readFileSync } from "node:fs";
import { Reader, type CityResponse } from "maxmind";
import { isPrivateAddress } from "../utils/client-ip.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("geo");

export interface GeoLocation {
  /** ISO 3166-1 alpha-2, e.g. "PH". */
  country: string | null;
  /** Subdivision name as the database returns it, e.g. "National Capital Region". */
  region: string | null;
  city: string | null;
  /** City-centroid precision only — rounded to 2 decimals at write time (routes/event.routes.ts). */
  lat: number | null;
  lon: number | null;
}

let reader: Reader<CityResponse> | null = null;
let isUnavailable = false;
let hasWarnedOnce = false;

function dbPath(): string {
  return process.env.GEO_DB_PATH || "./data/geo/dbip-city-lite.mmdb";
}

/** Test-only hook: lets geo.service.test.ts assert the file is opened at most once. */
export let openAttemptCount = 0;

function openReader(): Reader<CityResponse> | null {
  if (reader) return reader;
  if (isUnavailable) return null;

  openAttemptCount += 1;
  try {
    const buffer = readFileSync(dbPath());
    reader = new Reader<CityResponse>(buffer);
    return reader;
  } catch (err) {
    isUnavailable = true;
    if (!hasWarnedOnce) {
      hasWarnedOnce = true;
      log.warn(
        { path: dbPath(), err: err instanceof Error ? err.message : String(err) },
        "geo database unavailable — visitor geo will be null until it is restored",
      );
    }
    return null;
  }
}

/** Test-only reset so each test starts from a clean module state. */
export function _resetForTest(): void {
  reader = null;
  isUnavailable = false;
  hasWarnedOnce = false;
  openAttemptCount = 0;
}

/**
 * Resolves an IP to a coarse, city-level location, or null.
 *
 * Returns null immediately (no file read attempted) for a private/loopback address —
 * localhost dev traffic never gets a fake geo. Returns null for any lookup failure (file
 * missing, reader threw, IP not found in the database) — ingest must keep working with a
 * null geo, never an error.
 */
export function resolveGeo(ip: string): GeoLocation | null {
  if (isPrivateAddress(ip)) return null;

  const r = openReader();
  if (!r) return null;

  try {
    const result = r.get(ip);
    if (!result) return null;

    const country = result.country?.iso_code ?? null;
    const region = result.subdivisions?.[0]?.names?.en ?? null;
    const city = result.city?.names?.en ?? null;
    const lat = typeof result.location?.latitude === "number" ? result.location.latitude : null;
    const lon = typeof result.location?.longitude === "number" ? result.location.longitude : null;

    if (!country && !region && !city && lat === null && lon === null) return null;

    return { country, region, city, lat, lon };
  } catch {
    // A malformed/corrupt mmdb, or a lookup-time throw — degrade to null, do not crash
    // the request that triggered it.
    return null;
  }
}
