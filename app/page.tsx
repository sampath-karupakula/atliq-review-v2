import { checkDb } from "@/lib/db/health";
import { appToday } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = await checkDb();
  return (
    <main className="wrap">
      <p className="eyebrow">AtliQ Review · P0 scaffold</p>
      <h1>The app is running.</h1>
      <p className="muted">
        Today is {appToday()} (the dataset&apos;s date). Database:{" "}
        {db.ok ? `connected to ${db.version} in ${db.ms} ms` : `not reachable (${db.error})`}.
      </p>
      <p className="muted">Next up: the design system and app shell (P1), then data and seed (P2).</p>
    </main>
  );
}
