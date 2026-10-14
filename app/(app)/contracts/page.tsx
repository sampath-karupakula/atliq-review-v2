import type { Metadata } from "next";
import { PageHead, Stub } from "@/components/ui";

export const metadata: Metadata = { title: "Contracts" };

export default function Page() {
  return (
    <section className="wrap page">
      <PageHead eyebrow="Every open and signed contract" title="Contracts" />
      <Stub title="Contracts" phase="P2 (queue by company, all open and signed, with filters)" />
    </section>
  );
}
