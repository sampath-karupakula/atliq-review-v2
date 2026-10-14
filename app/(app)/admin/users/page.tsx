import type { Metadata } from "next";
import { PageHead, Stub } from "@/components/ui";

export const metadata: Metadata = { title: "Users" };

export default function Page() {
  return (
    <section className="wrap page">
      <PageHead eyebrow="Admin" title="Users" />
      <Stub title="Users" phase="P11 (add people, roles, resets)" />
    </section>
  );
}
