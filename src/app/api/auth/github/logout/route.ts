import { NextResponse } from "next/server";
import { GH_TOKEN_COOKIE } from "@/lib/github-oauth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(GH_TOKEN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
