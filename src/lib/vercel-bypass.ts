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
