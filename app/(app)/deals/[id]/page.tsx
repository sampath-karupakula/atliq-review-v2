import type { Metadata } from "next";
import { PageHead, Stub } from "@/components/ui";

export const metadata: Metadata = { title: "Deal" };

export default function Page() {
  return (
    <section className="wrap page">
      <PageHead eyebrow="Deal" title="Deal" />
      <Stub title="Deal" phase="P9 (documents and conflicts, pass-down, call notes, data-transfer gate)" />
    </section>
  );
}
