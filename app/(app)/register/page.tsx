import type { Metadata } from "next";
import { PageHead, Stub } from "@/components/ui";

export const metadata: Metadata = { title: "Register" };

export default function Page() {
  return (
    <section className="wrap page">
      <PageHead eyebrow="AtliQ's memory" title="Register" />
      <Stub title="Register" phase="P2 read-only, P8 editing (promises, usual terms, precedent labels, search)" />
    </section>
  );
}
