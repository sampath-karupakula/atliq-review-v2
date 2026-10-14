import type { Metadata } from "next";
import { PageHead, Stub } from "@/components/ui";

export const metadata: Metadata = { title: "Company" };

export default function Page() {
  return (
    <section className="wrap page">
      <PageHead eyebrow="Company" title="Company" />
      <Stub title="Company" phase="P2 (new, active and expired documents, promises made)" />
    </section>
  );
}
