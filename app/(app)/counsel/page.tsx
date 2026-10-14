import type { Metadata } from "next";
import { PageHead, Stub } from "@/components/ui";

export const metadata: Metadata = { title: "Counsel tracker" };

export default function Page() {
  return (
    <section className="wrap page">
      <PageHead eyebrow="Outside counsel" title="Counsel tracker" />
      <Stub title="Counsel tracker" phase="P10 (questions asked, answer-by dates, nudges)" />
    </section>
  );
}
