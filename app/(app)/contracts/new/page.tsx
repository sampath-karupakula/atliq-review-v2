import type { Metadata } from "next";
import { PageHead, Stub } from "@/components/ui";

export const metadata: Metadata = { title: "Upload a contract" };

export default function Page() {
  return (
    <section className="wrap page">
      <PageHead eyebrow="Upload" title="Upload a contract" />
      <Stub title="Upload a contract" phase="P4 (drop zone, read-on-choose checks, deal details, assign and review now)" />
    </section>
  );
}
