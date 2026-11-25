"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ReviewRunPublic } from "@/lib/review-types";
import {
  getReviewSnapshot,
  saveReviewSnapshot,
} from "@/lib/review-history";
import { ReviewWorkspace } from "@/components/diffy/review-workspace";
import { Button } from "@/components/ui/button";

type Loaded =
  | { source: "live"; run: ReviewRunPublic }
  | { source: "local"; run: ReviewRunPublic; afterHtml: string };

export function RunReviewLoader({ runId }: { runId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
        const data = await res.json();
        if (res.ok && data.status !== "error") {
          const run = data as ReviewRunPublic;
          if (!cancelled) setLoaded({ source: "live", run });

          // Persist a browser snapshot while the server still has HTML.
          try {
            const snapRes = await fetch(
              `/api/runs/${encodeURIComponent(runId)}?snapshot=1`,
            );
            if (snapRes.ok) {
              const snap = (await snapRes.json()) as {
                run?: ReviewRunPublic;
                afterHtml?: string;
              };
              if (snap.run && snap.afterHtml) {
                await saveReviewSnapshot(snap.run, snap.afterHtml);
              }
            }
          } catch {
            /* history is best-effort */
          }
          return;
        }

        const local = await getReviewSnapshot(runId);
        if (local?.run) {
          if (!cancelled) {
            setLoaded({
              source: "local",
              run: local.run,
              afterHtml: local.afterHtml,
            });
          }
          return;
        }

        throw new Error(
          typeof data?.error === "string" ? data.error : "Run not found",
        );
      } catch (err) {
        if (cancelled) return;
        const local = await getReviewSnapshot(runId);
        if (local?.run) {
          setLoaded({
            source: "local",
            run: local.run,
            afterHtml: local.afterHtml,
          });
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load run");
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
          Server runs expire after about an hour. Saved reviews stay in this
          browser — open one from Recent reviews on the home page, or compare
          again.
        </p>
        <Button asChild variant="outline">
          <Link href="/">Back home</Link>
        </Button>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[var(--diffy-bg)] text-sm text-[var(--diffy-muted)]">
        Loading review…
      </div>
    );
  }

  return (
    <ReviewWorkspace
      mode="run"
      run={loaded.run}
      afterHtml={loaded.source === "local" ? loaded.afterHtml : undefined}
    />
  );
}
