import { NextResponse } from "next/server";
import { getRun } from "@/lib/run-store";
import type { ReviewRunPublic } from "@/lib/review-types";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const run = await getRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const publicRun: ReviewRunPublic = {
    id: run.id,
    createdAt: run.createdAt,
    baseUrl: run.baseUrl,
    previewUrl: run.previewUrl,
    pageUrl: run.pageUrl,
    pageTitle: run.pageTitle,
    changes: run.changes,
    status: run.status,
    error: run.error,
    pr: run.pr,
  };

  return NextResponse.json(publicRun);
}
