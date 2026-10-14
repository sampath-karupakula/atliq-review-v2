import type { Metadata } from "next";
import { PageHead, Stub } from "@/components/ui";

export const metadata: Metadata = { title: "Companies" };

export default function Page() {
  return (
    <section className="wrap page">
      <PageHead eyebrow="Companies" title="Companies" />
      <Stub title="Companies" phase="P2 (every client and counterparty with its documents)" />
    </section>
  );
}
