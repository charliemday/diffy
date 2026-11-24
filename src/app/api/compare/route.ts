import { NextResponse } from "next/server";
import { diffDocuments } from "@/lib/dom-diff";
import { fetchPageHtml } from "@/lib/fetch-page";
import { polishChangeLabels } from "@/lib/ai-labels";
import { newRunId, saveRun } from "@/lib/run-store";
import type { PrCompanion, ReviewChange, ReviewRun } from "@/lib/review-types";
import { assertSafePublicUrl } from "@/lib/ssrf";
import { clientKeyFromRequest, takeToken } from "@/lib/rate-limit";
import {
  normalizeProtectionBypass,
  toDiffyAssetUrl,
} from "@/lib/vercel-bypass";
import {
  fetchPullRequestInfo,
  normalizeGithubToken,
  parseGithubPrUrl,
} from "@/lib/github-pr";
import { filterChangesToPullRequest } from "@/lib/pr-filter-changes";

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
    prUrl?: string;
    githubToken?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const baseUrl = body.baseUrl?.trim();
  const previewUrl = body.previewUrl?.trim();
  const polishLabels = Boolean(body.polishLabels);
  const prUrlRaw = body.prUrl?.trim();

  let protectionBypass: string | undefined;
  let githubToken: string | undefined;
  try {
    protectionBypass = normalizeProtectionBypass(body.protectionBypass);
    githubToken = normalizeGithubToken(body.githubToken);
    if (prUrlRaw) parseGithubPrUrl(prUrlRaw);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Invalid compare options",
      },
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
    const pagePromise = Promise.all([
      fetchPageHtml(baseUrl, fetchOpts),
      fetchPageHtml(previewUrl, fetchOpts),
    ]);
    const prPromise = prUrlRaw
      ? fetchPullRequestInfo(prUrlRaw, { token: githubToken })
      : Promise.resolve(null);

    const [[basePage, previewPage], prInfo] = await Promise.all([
      pagePromise,
      prPromise,
    ]);

    const { changes: rawChanges, afterHtml, pageTitle } = diffDocuments(
      basePage.html,
      previewPage.html,
      { beforeUrl: basePage.finalUrl, afterUrl: previewPage.finalUrl },
    );

    const polished = await polishChangeLabels(rawChanges, polishLabels);

    let changes = polished;
    let pr: PrCompanion | undefined;
    if (prInfo) {
      const filtered = filterChangesToPullRequest(polished, prInfo);
      changes = filtered.changes;
      pr = {
        url: prInfo.url,
        owner: prInfo.owner,
        repo: prInfo.repo,
        number: prInfo.number,
        title: prInfo.title,
        headRef: prInfo.headRef,
        baseRef: prInfo.baseRef,
        files: prInfo.files.map((f) => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          isMedia: f.isMedia,
        })),
        filteredOutCount: filtered.filteredOutCount,
      };
    }

    // Only route timeline images through /api/asset when a Vercel bypass
    // secret must stay server-side. Otherwise keep absolute origin URLs so
    // the browser loads CSS/images directly (Workers isolates don't share
    // the in-memory run map).
    if (protectionBypass) {
      changes = rewriteChangeAssets(
        changes,
        runId,
        basePage.finalUrl,
        previewPage.finalUrl,
      );
    }

    const run: ReviewRun = {
      id: runId,
      createdAt: new Date().toISOString(),
      baseUrl: basePage.finalUrl,
      previewUrl: previewPage.finalUrl,
      pageUrl: previewPage.finalUrl,
      pageTitle: pr ? pr.title : pageTitle,
      changes,
      status: "ready",
      beforeHtml: basePage.html,
      afterHtml,
      protectionBypass,
      pr,
    };

    await saveRun(run);

    return NextResponse.json({
      runId: run.id,
      changeCount: changes.length,
      filteredOutCount: pr?.filteredOutCount ?? 0,
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
