import { NextResponse } from "next/server";
import { diffDocuments } from "@/lib/dom-diff";
import { fetchPageHtml } from "@/lib/fetch-page";
import { polishChangeLabels } from "@/lib/ai-labels";
import { newRunId, saveRun } from "@/lib/run-store";
import type { ReviewChange, ReviewRun } from "@/lib/review-types";
import { assertSafePublicUrl } from "@/lib/ssrf";
import { clientKeyFromRequest, takeToken } from "@/lib/rate-limit";
import {
  normalizeProtectionBypass,
  toDiffyAssetUrl,
} from "@/lib/vercel-bypass";

const COMPARE_LIMIT = 8;
const COMPARE_WINDOW_MS = 60_000;

function rewriteChangeAssets(
  changes: ReviewChange[],
  runId: string,
  beforeUrl: string,
  afterUrl: string,
): ReviewChange[] {
  return changes.map((c) => ({
    ...c,
    before: {
      ...c.before,
      imageSrc: c.before.imageSrc
        ? toDiffyAssetUrl(c.before.imageSrc, runId, beforeUrl)
        : c.before.imageSrc,
    },
    after: {
      ...c.after,
      imageSrc: c.after.imageSrc
        ? toDiffyAssetUrl(c.after.imageSrc, runId, afterUrl)
        : c.after.imageSrc,
    },
  }));
}

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
    protectionBypass?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const baseUrl = body.baseUrl?.trim();
  const previewUrl = body.previewUrl?.trim();
  const polishLabels = Boolean(body.polishLabels);

  let protectionBypass: string | undefined;
  try {
    protectionBypass = normalizeProtectionBypass(body.protectionBypass);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid bypass secret" },
      { status: 400 },
    );
  }

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
  const fetchOpts = { protectionBypass };

  try {
    const [basePage, previewPage] = await Promise.all([
      fetchPageHtml(baseUrl, fetchOpts),
      fetchPageHtml(previewUrl, fetchOpts),
    ]);

    const { changes: rawChanges, afterHtml, pageTitle } = diffDocuments(
      basePage.html,
      previewPage.html,
      { beforeUrl: basePage.finalUrl, afterUrl: previewPage.finalUrl },
    );

    const polished = await polishChangeLabels(rawChanges, polishLabels);
    // Only route timeline images through /api/asset when a Vercel bypass
    // secret must stay server-side. Otherwise keep absolute origin URLs so
    // the browser loads CSS/images directly (Workers isolates don't share
    // the in-memory run map).
    const changes = protectionBypass
      ? rewriteChangeAssets(
          polished,
          runId,
          basePage.finalUrl,
          previewPage.finalUrl,
        )
      : polished;

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
      protectionBypass,
    };

    await saveRun(run);

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
    await saveRun(failed);

    return NextResponse.json({ error: message, runId }, { status: 422 });
  }
}
