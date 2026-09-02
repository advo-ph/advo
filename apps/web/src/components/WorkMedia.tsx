import { getWorkMedia } from "@/data/work-media";

interface WorkMediaProps {
  slug: string | null;
  title: string;
  /** The CMS screenshot, used alone when the slug has no captured media. */
  fallback: string | null;
}

/**
 * One product's media as a card: the share frame on top, two inner-page
 * screenshots along the bottom. Used by the work grid on `/` and by the
 * case-study header, so both show the same thing.
 */
const WorkMedia = ({ slug, title, fallback }: WorkMediaProps) => {
  const media = getWorkMedia(slug);

  if (!media) {
    return (
      <div className="landing-work-media is-single">
        <div className="landing-still landing-work-og">
          <img src={fallback ?? ""} alt={`${title} screenshot`} loading="lazy" />
        </div>
      </div>
    );
  }

  return (
    <div className="landing-work-media">
      <div className="landing-still landing-work-og">
        <img src={media.og} alt={`${title} share image`} loading="lazy" />
      </div>
      <div className="landing-work-strip">
        {media.shot.map((src, index) => (
          <div className="landing-still" key={src}>
            <img src={src} alt={`${title} screen ${index + 1}`} loading="lazy" />
          </div>
        ))}
      </div>
    </div>
  );
};

export default WorkMedia;
