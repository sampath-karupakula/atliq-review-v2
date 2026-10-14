import type { Metadata } from "next";
import { PageHead, Stub } from "@/components/ui";

export const metadata: Metadata = { title: "Activity" };

export default function Page() {
  return (
    <section className="wrap page">
      <PageHead eyebrow="Activity" title="Activity" />
      <Stub title="Activity" phase="P6 (who did what, and notifications)" />
    </section>
  );
}
