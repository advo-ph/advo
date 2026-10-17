import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { resolveSeo } from "./site";

const setMeta = (attribute: "name" | "property", key: string, content: string) => {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  tag.content = content;
};

const setCanonical = (href: string | null) => {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) {
    link?.remove();
    return;
  }
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = href;
};

/**
 * Keeps the tab title, description, canonical URL, and share tags in step with
 * the route. Google renders the page, so this is what it reads for any page the
 * build did not prerender. Private and unknown pages get noindex and no canonical.
 * Renders nothing.
 */
export default function RouteSeo() {
  const { pathname } = useLocation();

  useEffect(() => {
    const seo = resolveSeo(pathname);
    document.title = seo.title;
    setMeta("name", "description", seo.description);
    setMeta("name", "robots", seo.canonical ? "max-image-preview:large" : "noindex");
    setMeta("property", "og:title", seo.title);
    setMeta("property", "og:description", seo.description);
    setMeta("name", "twitter:title", seo.title);
    setMeta("name", "twitter:description", seo.description);
    if (seo.canonical) setMeta("property", "og:url", seo.canonical);
    setCanonical(seo.canonical);
  }, [pathname]);

  return null;
}
