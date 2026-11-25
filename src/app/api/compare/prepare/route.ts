import { NextResponse } from "next/server";
import { clientKeyFromRequest, takeToken } from "@/lib/rate-limit";
import { fetchPullRequestInfo, parseGithubPrUrl } from "@/lib/github-pr";
import { readAccessTokenFromCookie } from "@/lib/github-oauth";
import {
  isVercelPreviewUrl,
  resolvePrSiteUrls,
} from "@/lib/github-preview-urls";

const PREPARE_LIMIT = 12;
const PREPARE_WINDOW_MS = 60_000;

export async function POST(request: Request) {
  const retryAfter = takeToken(
    `compare-prepare:${clientKeyFromRequest(request)}`,
    PREPARE_LIMIT,
    PREPARE_WINDOW_MS,
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
    previewUrl?: string;
    baseUrl?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prUrlRaw = body.prUrl?.trim();
  if (!prUrlRaw) {
    return NextResponse.json(
      { error: "A GitHub pull request URL is required" },
      { status: 400 },
    );
  }

  try {
    parseGithubPrUrl(prUrlRaw);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid PR URL" },
      { status: 400 },
    );
  }

  const githubToken =
    readAccessTokenFromCookie(request.headers.get("cookie")) || undefined;

  try {
    const prInfo = await fetchPullRequestInfo(prUrlRaw, { token: githubToken });
    const resolved = await resolvePrSiteUrls(prInfo, {
      token: githubToken,
      pagePath: body.pagePath?.trim(),
      previewUrl: body.previewUrl?.trim(),
      baseUrl: body.baseUrl?.trim(),
    });

    return NextResponse.json({
      prUrl: prInfo.url,
      owner: prInfo.owner,
      repo: prInfo.repo,
      number: prInfo.number,
      title: prInfo.title,
      previewUrl: resolved.previewUrl,
      baseUrl: resolved.baseUrl,
      pagePath: resolved.pagePath,
      previewSource: resolved.previewSource,
      isVercelPreview: isVercelPreviewUrl(resolved.previewUrl),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not prepare this PR";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
