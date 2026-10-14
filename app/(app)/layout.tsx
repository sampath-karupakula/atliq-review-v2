import { TopBar } from "@/components/shell/TopBar";
import { currentRole } from "@/lib/viewer";

// Every signed-in screen shares the top bar. The role comes from the "Viewing as" cookie until P11.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const role = await currentRole();
  return (
    <>
      <TopBar role={role} unread={0} />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
