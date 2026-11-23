import type { Metadata } from "next";
import { ReviewWorkspace } from "@/components/diffy/review-workspace";

export const metadata: Metadata = {
  title: "Review · Diffy",
  description:
    "Walk through visual copy and image changes in a marketing site PR.",
};

export default function ReviewPage() {
  return <ReviewWorkspace />;
}
