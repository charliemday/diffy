"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ReviewRunPublic } from "@/lib/review-types";
import { ReviewWorkspace } from "@/components/diffy/review-workspace";
import { Button } from "@/components/ui/button";

export function RunReviewLoader({ runId }: { runId: string }) {
  const [run, setRun] = useState<ReviewRunPublic | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Run not found");
        }
        if (data.status === "error") {
          throw new Error(data.error || "Compare failed");
        }
        if (!cancelled) setRun(data as ReviewRunPublic);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load run");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (error) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-[var(--diffy-bg)] px-6 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl">
          Couldn’t open this review
        </h1>
        <p className="max-w-md text-sm text-[var(--diffy-muted)]">{error}</p>
        <p className="max-w-md text-xs text-[var(--diffy-muted)]">
          Runs are kept in memory for about an hour on this server. Compare
          again from the home page if this one expired.
        </p>
        <Button asChild variant="outline">
          <Link href="/">Back home</Link>
        </Button>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[var(--diffy-bg)] text-sm text-[var(--diffy-muted)]">
        Loading review…
      </div>
    );
  }

  return <ReviewWorkspace mode="run" run={run} />;
}
