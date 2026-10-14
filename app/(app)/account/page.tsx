import type { Metadata } from "next";
import { PageHead, Stub } from "@/components/ui";

export const metadata: Metadata = { title: "Account" };

export default function Page() {
  return (
    <section className="wrap page">
      <PageHead eyebrow="Account" title="Account" />
      <Stub title="Account" phase="P11 (password, sessions)" />
    </section>
  );
}
