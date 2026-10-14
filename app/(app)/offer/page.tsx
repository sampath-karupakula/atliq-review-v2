import type { Metadata } from "next";
import { PageHead, Stub } from "@/components/ui";

export const metadata: Metadata = { title: "Can I offer this?" };

export default function Page() {
  return (
    <section className="wrap page">
      <PageHead eyebrow="Before the call" title="Can I offer this?" />
      <Stub title="Can I offer this?" phase="P9 (answers as you type, from the register and the usual terms)" />
    </section>
  );
}
