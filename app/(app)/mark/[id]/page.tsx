import type { Metadata } from "next";
import { PageHead, Stub } from "@/components/ui";

export const metadata: Metadata = { title: "Mark each finding" };

export default function Page() {
  return (
    <section className="wrap page">
      <PageHead eyebrow="First review" title="Mark each finding" />
      <Stub title="Mark each finding" phase="P10 (agree, disagree or question; review done)" />
    </section>
  );
}
