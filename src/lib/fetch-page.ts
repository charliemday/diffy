import { assertSafePublicUrl, assertSafeResolvedHost } from "@/lib/ssrf";

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;

export type FetchedPage = {
  finalUrl: string;
  html: string;
  contentType: string;
};

async function assertUrlFully(raw: string): Promise<URL> {
  const url = assertSafePublicUrl(raw);
  await assertSafeResolvedHost(url.hostname);
  return url;
}

export async function fetchPageHtml(rawUrl: string): Promise<FetchedPage> {
  let current = await assertUrlFully(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "User-Agent": "DiffyBot/0.1 (+https://diffy.app; visual-review)",
        },
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) {
          throw new Error(`Redirect without Location from ${current.hostname}`);
        }
        // Discard body of redirect responses
        try {
          await res.arrayBuffer();
        } catch {
          /* ignore */
        }
        const next = new URL(loc, current);
        current = await assertUrlFully(next.toString());
        continue;
      }

      if (!res.ok) {
        throw new Error(`Fetch failed (${res.status}) for ${current.hostname}`);
      }

      // Final URL must still be safe (in case of weird status handling)
      await assertUrlFully(res.url || current.toString());

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
        finalUrl: res.url || current.toString(),
        html,
        contentType: contentType || "text/html",
      };
    }

    throw new Error("Too many redirects");
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Timed out fetching ${current.hostname}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
