import { TopBar } from "@/components/shell/TopBar";
import { currentRole } from "@/lib/viewer";
import { ROLES } from "@/lib/roles";
import { generateDeadlineReminders, notificationsFor } from "@/lib/data/notify";

// Every signed-in screen shares the top bar. The role comes from the "Viewing as" cookie until P11.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const role = await currentRole();
  // Review-by reminders are idempotent, so they can be refreshed on every page load.
  await generateDeadlineReminders();
  const { rows, unread } = await notificationsFor(ROLES[role].name, 20);
  const notes = rows.map((n) => ({ id: n.id, text: n.text, read: n.read, contractId: n.contractId, createdAt: n.createdAt.toISOString(), kind: n.kind }));
  return (
    <>
      <TopBar role={role} unread={unread} notes={notes} />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
