import type { Metadata } from "next";
import { PageHead, Stub } from "@/components/ui";

export const metadata: Metadata = { title: "Deals" };

export default function Page() {
  return (
    <section className="wrap page">
      <PageHead eyebrow="Deals" title="Deals" />
      <Stub title="Deals" phase="P9 (deal bundles checked against AtliQ's deal-type rules)" />
    </section>
  );
}
