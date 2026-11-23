import type { Metadata } from "next";
import { ReviewWorkspace } from "@/components/diffy/review-workspace";

export const metadata: Metadata = {
  title: "Demo review · Diffy",
  description:
    "Walk through visual copy and image changes in a sample marketing site PR.",
};

export default function DemoReviewPage() {
  return <ReviewWorkspace mode="demo" />;
}
