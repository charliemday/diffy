import { NextResponse } from "next/server";
import { diffDocuments } from "@/lib/dom-diff";
import { fetchPageHtml } from "@/lib/fetch-page";
import { polishChangeLabels } from "@/lib/ai-labels";
import { newRunId, saveRun } from "@/lib/run-store";
import type { ReviewRun } from "@/lib/review-types";
import { assertSafePublicUrl } from "@/lib/ssrf";
import { clientKeyFromRequest, takeToken } from "@/lib/rate-limit";

const COMPARE_LIMIT = 8;
const COMPARE_WINDOW_MS = 60_000;

export async function POST(request: Request) {
  const retryAfter = takeToken(
    `compare:${clientKeyFromRequest(request)}`,
    COMPARE_LIMIT,
    COMPARE_WINDOW_MS,
  );
  if (retryAfter != null) {
    return NextResponse.json(
      { error: `Too many compares. Try again in ${retryAfter}s.` },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }

  let body: {
    baseUrl?: string;
    previewUrl?: string;
    polishLabels?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const baseUrl = body.baseUrl?.trim();
  const previewUrl = body.previewUrl?.trim();
  const polishLabels = Boolean(body.polishLabels);
  if (!baseUrl || !previewUrl) {
    return NextResponse.json(
      { error: "baseUrl and previewUrl are required" },
      { status: 400 },
    );
  }

  try {
    assertSafePublicUrl(baseUrl);
    assertSafePublicUrl(previewUrl);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid URL" },
      { status: 400 },
    );
  }

  const runId = newRunId();

  try {
    const [basePage, previewPage] = await Promise.all([
      fetchPageHtml(baseUrl),
      fetchPageHtml(previewUrl),
    ]);

    const { changes: rawChanges, afterHtml, pageTitle } = diffDocuments(
      basePage.html,
      previewPage.html,
      { beforeUrl: basePage.finalUrl, afterUrl: previewPage.finalUrl },
    );

    const changes = await polishChangeLabels(rawChanges, polishLabels);

    const run: ReviewRun = {
      id: runId,
      createdAt: new Date().toISOString(),
      baseUrl: basePage.finalUrl,
      previewUrl: previewPage.finalUrl,
      pageUrl: previewPage.finalUrl,
      pageTitle,
      changes,
      status: "ready",
      beforeHtml: basePage.html,
      afterHtml,
    };

    saveRun(run);

    return NextResponse.json({
      runId: run.id,
      changeCount: changes.length,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Compare failed unexpectedly";

    const failed: ReviewRun = {
      id: runId,
      createdAt: new Date().toISOString(),
      baseUrl,
      previewUrl,
      pageUrl: previewUrl,
      changes: [],
      status: "error",
      error: message,
    };
    saveRun(failed);

    return NextResponse.json({ error: message, runId }, { status: 422 });
  }
}
