import { assertSafePublicUrl } from "@/lib/ssrf";

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 12_000;

export type FetchedPage = {
  finalUrl: string;
  html: string;
  contentType: string;
};

export async function fetchPageHtml(rawUrl: string): Promise<FetchedPage> {
  const url = assertSafePublicUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": "DiffyBot/0.1 (+https://diffy.app; visual-review)",
      },
    });

    if (!res.ok) {
      throw new Error(`Fetch failed (${res.status}) for ${url.hostname}`);
    }

    // Re-check after redirects
    assertSafePublicUrl(res.url);

    const contentType = res.headers.get("content-type") ?? "";
    if (
      contentType &&
      !/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)
    ) {
      throw new Error(`Expected HTML, got ${contentType.split(";")[0]}`);
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      throw new Error("Page HTML exceeds size limit (1.5MB)");
    }

    const html = new TextDecoder("utf-8").decode(buf);
    return {
      finalUrl: res.url,
      html,
      contentType: contentType || "text/html",
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Timed out fetching ${url.hostname}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
