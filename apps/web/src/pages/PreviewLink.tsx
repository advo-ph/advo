import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const DEFAULT_API_BASE = "http://localhost:6407";

/** Build the backend preview resolve URL for a Show-Client-Now token. */
export function previewApiUrl(token: string, apiBase?: string): string {
  const base = (apiBase ?? import.meta.env.VITE_API_URL ?? DEFAULT_API_BASE).replace(
    /\/$/,
    "",
  );
  return `${base}/api/preview/${encodeURIComponent(token)}`;
}

/** Frontend-friendly public path (pretty link surface). */
export function previewPublicPath(token: string): string {
  return `/p/${token}`;
}

/**
 * Public branded gate at `/p/:token`.
 * Briefly shows ADVO branding, then hard-navigates to the API preview
 * resolver (`GET /api/preview/:token`), which 302s to the project preview_url.
 */
const PreviewLink = () => {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<"opening" | "missing">("opening");

  useEffect(() => {
    if (!token?.trim()) {
      setStatus("missing");
      return;
    }

    const target = previewApiUrl(token);
    const timer = window.setTimeout(() => {
      window.location.replace(target);
    }, 600);

    return () => window.clearTimeout(timer);
  }, [token]);

  if (status === "missing" || !token?.trim()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-[#fafafa]">
        <div className="max-w-md px-8 text-center">
          <strong className="text-[22px] tracking-wide">ADVO</strong>
          <h1 className="mt-6 text-xl font-semibold">Preview link not found</h1>
          <p className="mt-2 text-[#a1a1aa] leading-relaxed">
            This link is missing a token. Ask the ADVO team for a fresh preview link.
          </p>
          <a
            href="/"
            className="mt-6 inline-block text-sm text-[#fafafa] underline underline-offset-4 opacity-80 hover:opacity-100"
          >
            Return home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-[#fafafa]">
      <div className="max-w-md px-8 text-center">
        <strong className="text-[22px] tracking-wide">ADVO</strong>
        <h1 className="mt-6 text-xl font-semibold">Opening preview…</h1>
        <p className="mt-2 text-[#a1a1aa] leading-relaxed">
          Taking you to the live project preview.
        </p>
        <div
          className="mx-auto mt-8 h-1 w-24 overflow-hidden rounded-full bg-white/10"
          aria-hidden
        >
          <div className="h-full w-1/2 animate-pulse rounded-full bg-white/60" />
        </div>
      </div>
    </div>
  );
};

export default PreviewLink;
