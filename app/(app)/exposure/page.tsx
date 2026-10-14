import type { Metadata } from "next";
import { PageHead, Stub } from "@/components/ui";

export const metadata: Metadata = { title: "Signed portfolio" };

export default function Page() {
  return (
    <section className="wrap page">
      <PageHead eyebrow="Signed portfolio" title="Signed portfolio" />
      <Stub title="Signed portfolio" phase="P8 (exposure already signed, coming up, reminders)" />
    </section>
  );
}
