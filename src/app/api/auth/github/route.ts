import { NextResponse } from "next/server";
import {
  GH_STATE_COOKIE,
  githubAuthorizeUrl,
  isGithubOAuthConfigured,
  newOAuthState,
  oauthRedirectUri,
  stateCookieOptions,
} from "@/lib/github-oauth";

/** Start GitHub OAuth — redirects to GitHub authorize. */
export async function GET(request: Request) {
  if (!isGithubOAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          "GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo") || "/";
  // Only allow relative return paths
  const safeReturn =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";

  const state = newOAuthState();
  const redirectUri = oauthRedirectUri(request.url);
  const authorize = githubAuthorizeUrl({ state, redirectUri });

  // Pack returnTo into state cookie alongside CSRF state
  const statePayload = `${state}.${Buffer.from(safeReturn).toString("base64url")}`;

  const res = NextResponse.redirect(authorize, 302);
  res.cookies.set(GH_STATE_COOKIE, statePayload, stateCookieOptions());
  return res;
}
