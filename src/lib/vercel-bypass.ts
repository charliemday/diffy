/** Vercel Protection Bypass for Automation header / query name */
export const VERCEL_BYPASS_HEADER = "x-vercel-protection-bypass";

export function normalizeProtectionBypass(
  raw: string | undefined | null,
): string | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  if (s.length > 256 || /[\r\n\0]/.test(s)) {
    throw new Error("Invalid protection bypass secret");
  }
  return s;
}

export function bypassHeaders(
  secret: string | undefined,
): Record<string, string> {
  if (!secret) return {};
  return { [VERCEL_BYPASS_HEADER]: secret };
}

/** True when url is http(s) on the same host as the page (assets need bypass). */
export function isSameSiteAsset(assetUrl: string, pageUrl: string): boolean {
  try {
    const asset = new URL(assetUrl);
    const page = new URL(pageUrl);
    if (asset.protocol !== "http:" && asset.protocol !== "https:") return false;
    return asset.hostname === page.hostname;
  } catch {
    return false;
  }
}

export function toDiffyAssetUrl(
  assetUrl: string,
  runId: string,
  pageUrl: string,
): string {
  if (!isSameSiteAsset(assetUrl, pageUrl)) return assetUrl;
  const params = new URLSearchParams({
    runId,
    url: assetUrl,
  });
  return `/api/asset?${params.toString()}`;
}

/**
 * Rewrite url(...) / @import targets inside a stylesheet so they keep working
 * when the CSS itself is served from /api/asset (browser would otherwise
 * resolve relatives against Diffy's origin).
 */
export function rewriteCssAssetUrls(
  css: string,
  cssUrl: string,
  runId: string,
  pageUrl: string,
): string {
  let base: URL;
  try {
    base = new URL(cssUrl);
  } catch {
    return css;
  }

  const rewriteRef = (raw: string): string => {
    const v = raw.trim();
    if (!v) return v;
    const lower = v.toLowerCase();
    if (
      lower.startsWith("data:") ||
      lower.startsWith("blob:") ||
      lower.startsWith("#") ||
      lower.startsWith("/api/asset?")
    ) {
      return v;
    }
    try {
      const abs = new URL(v, base).toString();
      return toDiffyAssetUrl(abs, runId, pageUrl);
    } catch {
      return v;
    }
  };

  let out = css.replace(
    /url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi,
    (_m, quote: string, u: string) => {
      const next = rewriteRef(u);
      const q = quote || '"';
      return `url(${q}${next}${q})`;
    },
  );

  out = out.replace(
    /@import\s+(?:url\(\s*(['"]?)([^)'"]+)\1\s*\)|(['"])([^'"]+)\3)/gi,
    (_full, q1: string | undefined, u1: string | undefined, q2: string | undefined, u2: string | undefined) => {
      if (u1 != null) {
        const next = rewriteRef(u1);
        const q = q1 || '"';
        return `@import url(${q}${next}${q})`;
      }
      const next = rewriteRef(u2 ?? "");
      const q = q2 || '"';
      return `@import ${q}${next}${q}`;
    },
  );

  return out;
}
