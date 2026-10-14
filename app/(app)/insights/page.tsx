import type { Metadata } from "next";
import { PageHead, Stub } from "@/components/ui";

export const metadata: Metadata = { title: "Insights" };

export default function Page() {
  return (
    <section className="wrap page">
      <PageHead eyebrow="Insights" title="Insights" />
      <Stub title="Insights" phase="P7 (false-alarm rate by topic, check and week)" />
    </section>
  );
}
