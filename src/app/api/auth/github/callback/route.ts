import { NextResponse } from "next/server";
import {
  GH_STATE_COOKIE,
  GH_TOKEN_COOKIE,
  exchangeCodeForToken,
  isGithubOAuthConfigured,
  oauthRedirectUri,
  sealValue,
  tokenCookieOptions,
} from "@/lib/github-oauth";

function homeRedirect(requestUrl: string, path: string, error?: string) {
  const u = new URL(path, requestUrl);
  if (error) u.searchParams.set("gh_error", error);
  else u.searchParams.set("gh", "connected");
  const res = NextResponse.redirect(u, 302);
  res.cookies.set(GH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

export async function GET(request: Request) {
  if (!isGithubOAuthConfigured()) {
    return homeRedirect(request.url, "/", "oauth_not_configured");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const ghError = url.searchParams.get("error");

  const cookieHeader = request.headers.get("cookie") || "";
  const stateCookie = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${GH_STATE_COOKIE}=`));
  const rawState = stateCookie
    ? decodeURIComponent(stateCookie.slice(GH_STATE_COOKIE.length + 1))
    : "";
  const [expectedState, returnB64] = rawState.split(".");
  let returnTo = "/";
  if (returnB64) {
    try {
      const decoded = Buffer.from(returnB64, "base64url").toString("utf8");
      if (decoded.startsWith("/") && !decoded.startsWith("//")) {
        returnTo = decoded;
      }
    } catch {
      /* ignore */
    }
  }

  if (ghError) {
    return homeRedirect(request.url, returnTo, ghError);
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    return homeRedirect(request.url, returnTo, "invalid_state");
  }

  try {
    const redirectUri = oauthRedirectUri(request.url);
    const accessToken = await exchangeCodeForToken(code, redirectUri);
    const res = homeRedirect(request.url, returnTo);
    res.cookies.set(
      GH_TOKEN_COOKIE,
      sealValue(accessToken),
      tokenCookieOptions(),
    );
    return res;
  } catch {
    return homeRedirect(request.url, returnTo, "token_exchange_failed");
  }
}
