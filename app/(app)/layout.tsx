import { TopBar } from "@/components/shell/TopBar";
import { currentRole } from "@/lib/viewer";
import { getCurrentUser } from "@/lib/auth/session";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { generateDeadlineReminders, notificationsFor } from "@/lib/data/notify";

// Every signed-in screen shares the top bar. Signed out, getCurrentUser sends the person to /login (unless the
// deployment runs in demo mode, where the "Viewing as" person acts).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [me, role] = await Promise.all([getCurrentUser(), currentRole()]);
  // Review-by reminders are idempotent, so they can be refreshed on every page load.
  await generateDeadlineReminders();
  const { rows, unread } = await notificationsFor(me.name, 20);
  const notes = rows.map((n) => ({ id: n.id, text: n.text, read: n.read, contractId: n.contractId, createdAt: n.createdAt.toISOString(), kind: n.kind }));
  return (
    <>
      <TopBar role={role} unread={unread} notes={notes} user={{ name: me.name, roleLabel: ROLE_LABEL[me.role], admin: me.role === "admin" }} demo={me.demo} />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
