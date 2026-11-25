import { NextResponse } from "next/server";
import { fetchPageHtml } from "@/lib/fetch-page";
import { newRunId, saveRun } from "@/lib/run-store";
import type { PrCompanion, ReviewChange, ReviewRun } from "@/lib/review-types";
import { clientKeyFromRequest, takeToken } from "@/lib/rate-limit";
import {
  normalizeProtectionBypass,
  toDiffyAssetUrl,
} from "@/lib/vercel-bypass";
import { fetchPullRequestInfo, parseGithubPrUrl } from "@/lib/github-pr";
import { readAccessTokenFromCookie } from "@/lib/github-oauth";
import { extractVisualClaims } from "@/lib/pr-visual-claims";
import { locateClaimsInHtml } from "@/lib/locate-claims";
import { resolvePrSiteUrls } from "@/lib/github-preview-urls";

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
    prUrl?: string;
    pagePath?: string;
    protectionBypass?: string;
    baseUrl?: string;
    previewUrl?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prUrlRaw = body.prUrl?.trim();
  const pagePath = body.pagePath?.trim();

  let protectionBypass: string | undefined;
  try {
    protectionBypass = normalizeProtectionBypass(body.protectionBypass);
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

  const githubToken =
    readAccessTokenFromCookie(request.headers.get("cookie")) || undefined;

  if (!prUrlRaw) {
    return NextResponse.json(
      { error: "A GitHub pull request URL is required" },
      { status: 400 },
    );
  }

  const runId = newRunId();
  const fetchOpts = { protectionBypass };

  try {
    const prInfo = await fetchPullRequestInfo(prUrlRaw, { token: githubToken });
    const [resolved, { claims }] = await Promise.all([
      resolvePrSiteUrls(prInfo, {
        token: githubToken,
        pagePath,
        previewUrl: body.previewUrl?.trim(),
        baseUrl: body.baseUrl?.trim(),
      }),
      extractVisualClaims(prInfo),
    ]);

    const previewPage = await fetchPageHtml(resolved.previewUrl, fetchOpts);
    const basePage =
      resolved.baseUrl === resolved.previewUrl
        ? previewPage
        : await fetchPageHtml(resolved.baseUrl, fetchOpts).catch(() => ({
            html: "",
            finalUrl: resolved.baseUrl,
          }));

    const located = locateClaimsInHtml(claims, {
      afterHtml: previewPage.html,
      afterUrl: previewPage.finalUrl,
    });

    let changes = located.changes;
    const pr: PrCompanion = {
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
      unlocatedCount: located.unlocatedCount,
    };

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
      pageTitle: pr.title,
      changes,
      status: "ready",
      beforeHtml: basePage.html,
      afterHtml: located.afterHtml,
      protectionBypass,
      pr,
    };

    await saveRun(run);

    return NextResponse.json({
      runId: run.id,
      changeCount: changes.length,
      unlocatedCount: pr.unlocatedCount,
      previewUrl: previewPage.finalUrl,
      baseUrl: basePage.finalUrl,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Compare failed unexpectedly";

    const failed: ReviewRun = {
      id: runId,
      createdAt: new Date().toISOString(),
      baseUrl: body.baseUrl?.trim() || "",
      previewUrl: body.previewUrl?.trim() || "",
      pageUrl: body.previewUrl?.trim() || "",
      changes: [],
      status: "error",
      error: message,
    };
    await saveRun(failed);

    return NextResponse.json({ error: message, runId }, { status: 422 });
  }
}
