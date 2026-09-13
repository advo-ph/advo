/**
 * Headings, list bullets, fences, quotes or table rows at the start of a line: the text
 * was written as markdown. Only the first 20,000 characters are read, so a
 * multi-megabyte transcript costs nothing to classify.
 */
export const isMarkdownLike = (text: string) =>
  /^(#{1,6}\s|[-*+]\s|\d+\.\s|```|>\s|\|.*\|)/m.test(text.slice(0, 20_000));
