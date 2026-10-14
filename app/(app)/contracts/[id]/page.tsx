import type { Metadata } from "next";
import { PageHead, Stub } from "@/components/ui";

export const metadata: Metadata = { title: "Contract report" };

export default function Page() {
  return (
    <section className="wrap page">
      <PageHead eyebrow="Report" title="Contract report" />
      <Stub title="Contract report" phase="P5 (score, summary, findings, exposure, contract text and versions)" />
    </section>
  );
}
