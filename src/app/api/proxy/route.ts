import { NextResponse } from "next/server";
import { getRun } from "@/lib/run-store";
import {
  prepareProxiedHtml,
  proxyResponseHeaders,
} from "@/lib/rewrite-html";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");
  const side = searchParams.get("side") === "before" ? "before" : "after";

  if (!runId) {
    return NextResponse.json({ error: "runId required" }, { status: 400 });
  }

  const run = getRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (run.status !== "ready") {
    return NextResponse.json(
      { error: run.error ?? "Run is not ready" },
      { status: 400 },
    );
  }

  const html = side === "before" ? run.beforeHtml : run.afterHtml;
  const pageUrl = side === "before" ? run.baseUrl : run.previewUrl;

  if (!html) {
    return NextResponse.json(
      { error: "No HTML stored for this side" },
      { status: 404 },
    );
  }

  const prepared = prepareProxiedHtml(html, pageUrl, {
    runId: run.id,
    // Always proxy same-host assets so Vercel bypass stays server-side
    useAssetProxy: true,
  });
  return new NextResponse(prepared, {
    status: 200,
    headers: proxyResponseHeaders(),
  });
}
