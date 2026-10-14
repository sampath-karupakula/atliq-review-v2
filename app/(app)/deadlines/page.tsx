import type { Metadata } from "next";
import { PageHead, Stub } from "@/components/ui";

export const metadata: Metadata = { title: "Deadlines" };

export default function Page() {
  return (
    <section className="wrap page">
      <PageHead eyebrow="Deadlines" title="Deadlines" />
      <Stub title="Deadlines" phase="P7 (client deadlines, reviews due, promises ending)" />
    </section>
  );
}
