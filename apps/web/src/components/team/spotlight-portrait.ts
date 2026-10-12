import { getResponsiveImageSrcSet } from "@/lib/image-urls";

/** The size the spotlight asks for. Shared with the preload so a tap on the
    roster warms exactly the file the overlay is about to draw. */
export const PORTRAIT_SIZES = "(max-width: 900px) 60vw, 480px";

interface PortraitSource {
  preview_image_url: string | null;
  avatar_url: string | null;
}

export const portraitOf = (member: PortraitSource) => member.preview_image_url || member.avatar_url;

/** Starts loading a member's spotlight portrait. Call it on pointerdown so the
    file is on its way before the click opens the overlay. */
export const preloadSpotlightPortrait = (member: PortraitSource) => {
  const source = portraitOf(member);
  if (!source || typeof Image === "undefined") return;
  const image = new Image();
  image.decoding = "async";
  image.sizes = PORTRAIT_SIZES;
  const srcSet = getResponsiveImageSrcSet(source);
  if (srcSet) image.srcset = srcSet;
  image.src = source;
};
