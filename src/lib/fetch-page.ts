import { assertSafePublicUrl, assertSafeResolvedHost } from "@/lib/ssrf";
import { bypassHeaders } from "@/lib/vercel-bypass";

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;

export type FetchedPage = {
  finalUrl: string;
  html: string;
  contentType: string;
};

export type FetchPageOptions = {
  /** Vercel Protection Bypass for Automation secret */
  protectionBypass?: string;
};

async function assertUrlFully(raw: string): Promise<URL> {
  const url = assertSafePublicUrl(raw);
  await assertSafeResolvedHost(url.hostname);
  return url;
}

function looksLikeVercelAuthWall(html: string, status: number): boolean {
  if (status === 401 || status === 403) return true;
  const sample = html.slice(0, 4000).toLowerCase();
  return (
    sample.includes("vercel authentication") ||
    sample.includes("authentication required") ||
    sample.includes("/_vercel/password") ||
    (sample.includes("deployment protection") && sample.includes("vercel"))
  );
}

export function lowercasePathname(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const lower = url.pathname.toLowerCase();
    if (lower === url.pathname) return null;
    url.pathname = lower;
    return url.toString();
  } catch {
    return null;
  }
}

class FetchPageError extends Error {
  status?: number;
  url: string;
  constructor(message: string, url: string, status?: number) {
    super(message);
    this.url = url;
    this.status = status;
  }
}

function fetchFailedMessage(status: number, url: string): string {
  let msg = `Fetch failed (${status}) for ${url}`;
  try {
    const parsed = new URL(url);
    if (parsed.pathname !== parsed.pathname.toLowerCase()) {
      msg += `. The preview may use ${parsed.pathname.toLowerCase()} instead.`;
    }
  } catch {
    /* ignore */
  }
  return msg;
}

async function fetchPageHtmlOnce(
  rawUrl: string,
  opts: FetchPageOptions,
  fetchImpl: typeof fetch,
): Promise<FetchedPage> {
  let current = await assertUrlFully(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const extra = bypassHeaders(opts.protectionBypass);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetchImpl(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "User-Agent": "DiffyBot/0.1 (+https://diffy.app; visual-review)",
          ...extra,
        },
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) {
          throw new Error(`Redirect without Location from ${current.hostname}`);
        }
        try {
          await res.arrayBuffer();
        } catch {
          /* ignore */
        }
        const next = new URL(loc, current);
        current = await assertUrlFully(next.toString());
        continue;
      }

      const contentType = res.headers.get("content-type") ?? "";
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) {
        throw new Error("Page HTML exceeds size limit (1.5MB)");
      }
      const html = new TextDecoder("utf-8").decode(buf);

      if (!res.ok || looksLikeVercelAuthWall(html, res.status)) {
        if (looksLikeVercelAuthWall(html, res.status)) {
          throw new FetchPageError(
            opts.protectionBypass
              ? `Preview still looks auth-gated (${res.status}). Check the Vercel bypass secret.`
              : `Preview is auth-gated (${res.status}). Add a Vercel Protection Bypass secret.`,
            current.toString(),
            res.status,
          );
        }
        throw new FetchPageError(
          fetchFailedMessage(res.status, current.toString()),
          current.toString(),
          res.status,
        );
      }

      await assertUrlFully(res.url || current.toString());

      if (
        contentType &&
        !/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)
      ) {
        throw new Error(`Expected HTML, got ${contentType.split(";")[0]}`);
      }

      return {
        finalUrl: res.url || current.toString(),
        html,
        contentType: contentType || "text/html",
      };
    }

    throw new FetchPageError("Too many redirects", current.toString());
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new FetchPageError(
        `Timed out fetching ${current.toString()}`,
        current.toString(),
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPageHtml(
  rawUrl: string,
  opts: FetchPageOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<FetchedPage> {
  try {
    return await fetchPageHtmlOnce(rawUrl, opts, fetchImpl);
  } catch (err) {
    const lower = lowercasePathname(rawUrl);
    const is404 =
      err instanceof FetchPageError &&
      err.status === 404 &&
      lower &&
      lower !== rawUrl;
    if (!is404) throw err;
    try {
      return await fetchPageHtmlOnce(lower, opts, fetchImpl);
    } catch {
      throw err;
    }
  }
}
