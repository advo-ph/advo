/**
 * Facebook page scraper — shared types.
 * Naming follows the house rule: singular everywhere (`post: Post[]`, not `posts`).
 */

export type PostKind = "photo" | "video" | "reel" | "link" | "album" | "text" | "share" | "event" | "unknown";

export interface ReactionBreakdown {
  /** localized reaction name -> count, e.g. { Like: 5, Love: 1 } */
  [name: string]: number;
}

export interface Comment {
  comment_id: string;
  post_id: string;
  parent_comment_id: string | null;
  depth: number;
  author_id: string | null;
  author_name: string | null;
  is_page_author: boolean;
  text: string;
  created_at: string | null;
  reaction_count: number | null;
  reply_count: number | null;
  permalink: string | null;
  /** Id of the Feedback thread the comment was read from; used to reject comments of a neighbouring reel. */
  feedback_id?: string | null;
}

export interface Post {
  /** Numeric FB post id when known, else pfbid token, else `h:<hash>` synthetic key. */
  post_id: string;
  /** Every alias seen for the same post (numeric id, pfbid, synthetic hash). */
  alias: string[];
  permalink: string | null;
  kind: PostKind;
  text: string;
  created_at: string | null;
  created_unix: number | null;
  author_id: string | null;
  author_name: string | null;
  reaction_count: number | null;
  reaction_breakdown: ReactionBreakdown;
  comment_count: number | null;
  share_count: number | null;
  view_count: number | null;
  image_url: string[];
  video_url: string | null;
  external_url: string[];
  hashtag: string[];
  mention: string[];
  is_sponsored: boolean;
  is_pinned: boolean;
  /** Sources that contributed to this record: ssr | graphql | dom | permalink */
  source: string[];
  /** Comments actually captured for this post. */
  comment: Comment[];
}

export interface PageInfo {
  page_id: string | null;
  name: string | null;
  username: string | null;
  category: string | null;
  description: string | null;
  bio: string | null;
  vision: string | null;
  mission: string | null;
  follower_count: number | null;
  like_count: number | null;
  following_count: number | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  hour: string | null;
  rating: string | null;
  creation_date: string | null;
  is_verified: boolean | null;
  profile_image: string | null;
  cover_image: string | null;
  external_link: string[];
  source: string[];
}

export interface ExtractResult {
  post: Post[];
  comment: Comment[];
  page: Partial<PageInfo>;
  /** Pagination cursor found in this blob, if any. */
  cursor: string | null;
  has_next_page: boolean | null;
  /** Non-fatal FB-side errors in the blob (rate limit, etc.). */
  error: { code: number | null; message: string }[];
}
