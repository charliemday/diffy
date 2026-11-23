import type { Metadata } from "next";
import { RunReviewLoader } from "@/components/diffy/run-review-loader";

export const metadata: Metadata = {
  title: "Review · Diffy",
  description: "Visual review of base vs preview page changes.",
};

export default async function RunReviewPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  if (runId === "demo") {
    // Handled by /review/demo; keep type path clear
  }
  return <RunReviewLoader runId={runId} />;
}
