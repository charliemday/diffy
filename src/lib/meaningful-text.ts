/**
 * Shared text/URL normalization so locating PR claims in HTML
 * ignores formatting-only churn (entities, whitespace, cache-bust queries).
 */

/** Collapse whitespace for display / loose equality. */
export function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Normalize for "did the words actually change?" checks.
 * Strips formatting noise: whitespace, entities, smart quotes, case.
 */
export function meaningfulText(s: string): string {
  return collapseWhitespace(s)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Compare image URLs ignoring cache-busting query/hash.
 * Absolute vs relative with the same pathname still counts as equal when
 * pathnames match.
 */
export function meaningfulImageSrc(src: string): string {
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith("data:")) return trimmed;
  try {
    const u = new URL(trimmed, "https://diffy.local");
    return `${u.pathname}`.toLowerCase();
  } catch {
    return trimmed.split("?")[0]?.split("#")[0]?.toLowerCase() ?? trimmed;
  }
}
