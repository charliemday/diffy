import { NextResponse } from "next/server";
import { getRun } from "@/lib/run-store";
import { assertSafePublicUrl, assertSafeResolvedHost } from "@/lib/ssrf";
import {
  bypassHeaders,
  isSameSiteAsset,
  rewriteCssAssetUrls,
} from "@/lib/vercel-bypass";

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 12_000;

function isCssContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return (
    ct.includes("text/css") ||
    ct.includes("stylesheet") ||
    ct.includes("application/css")
  );
}

/**
 * Same-origin asset proxy for a review run. Uses the run's stored Vercel
 * bypass secret so the browser never sees it.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");
  const rawUrl = searchParams.get("url");

  if (!runId || !rawUrl) {
    return NextResponse.json(
      { error: "runId and url are required" },
      { status: 400 },
    );
  }

  const run = await getRun(runId);
  if (!run || run.status !== "ready") {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  let target: URL;
  try {
    target = assertSafePublicUrl(rawUrl);
    await assertSafeResolvedHost(target.hostname);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid URL" },
      { status: 400 },
    );
  }

  const allowed =
    isSameSiteAsset(target.toString(), run.previewUrl) ||
    isSameSiteAsset(target.toString(), run.baseUrl);
  if (!allowed) {
    return NextResponse.json(
      { error: "Asset host must match the compared pages" },
      { status: 403 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let current = target;
    let res: Response | null = null;
    for (let hop = 0; hop < 5; hop++) {
      res = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "*/*",
          "User-Agent": "DiffyBot/0.1 (+https://diffy.app; visual-review)",
          ...bypassHeaders(run.protectionBypass),
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) break;
        try {
          await res.arrayBuffer();
        } catch {
          /* ignore */
        }
        const next = assertSafePublicUrl(new URL(loc, current).toString());
        await assertSafeResolvedHost(next.hostname);
        const ok =
          isSameSiteAsset(next.toString(), run.previewUrl) ||
          isSameSiteAsset(next.toString(), run.baseUrl);
        if (!ok) {
          return NextResponse.json(
            { error: "Redirect left the compared hosts" },
            { status: 502 },
          );
        }
        current = next;
        continue;
      }
      break;
    }

    if (!res || !res.ok) {
      return NextResponse.json(
        { error: `Upstream ${res?.status ?? "error"}` },
        { status: 502 },
      );
    }

    const contentType =
      res.headers.get("content-type") || "application/octet-stream";
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Asset too large" }, { status: 502 });
    }

    // Stylesheets loaded via /api/asset must have their url()/@import
    // rewritten — the browser resolves relatives against Diffy's path.
    if (isCssContentType(contentType) || /\.css(?:$|\?)/i.test(current.pathname)) {
      const text = new TextDecoder("utf-8").decode(buf);
      const pageUrl = isSameSiteAsset(current.toString(), run.previewUrl)
        ? run.previewUrl
        : run.baseUrl;
      const rewritten = rewriteCssAssetUrls(
        text,
        current.toString(),
        run.id,
        pageUrl,
      );
      return new NextResponse(rewritten, {
        status: 200,
        headers: {
          "Content-Type": contentType.includes("css")
            ? contentType
            : "text/css; charset=utf-8",
          "Cache-Control": "private, max-age=300",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "Timed out" }, { status: 504 });
    }
    return NextResponse.json({ error: "Asset fetch failed" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
