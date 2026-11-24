import { NextResponse } from "next/server";
import {
  fetchGithubLogin,
  isGithubOAuthConfigured,
  readAccessTokenFromCookie,
} from "@/lib/github-oauth";

export async function GET(request: Request) {
  const configured = isGithubOAuthConfigured();
  if (!configured) {
    return NextResponse.json({
      configured: false,
      connected: false,
      login: null,
    });
  }

  const token = readAccessTokenFromCookie(request.headers.get("cookie"));
  if (!token) {
    return NextResponse.json({
      configured: true,
      connected: false,
      login: null,
    });
  }

  try {
    const user = await fetchGithubLogin(token);
    return NextResponse.json({
      configured: true,
      connected: true,
      login: user.login,
      name: user.name,
      avatarUrl: user.avatarUrl,
    });
  } catch {
    return NextResponse.json({
      configured: true,
      connected: false,
      login: null,
      stale: true,
    });
  }
}
