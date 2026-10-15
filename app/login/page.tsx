import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { demoMode } from "@/lib/config";
import { ROLE_ORDER, ROLES } from "@/lib/roles";
import { setViewingAs } from "@/app/actions/viewer";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const safe = (n?: string) => (n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/login") ? n : "/dashboard");

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const me = await getSessionUser();
  if (me && !me.demo) redirect(safe(next));
  return (
    <main id="main" className="wrap" style={{ maxWidth: 440, paddingBlock: "12vh 48px" }}>
      <p className="eyebrow">AtliQ Review</p>
      <h1 className="display">Sign in</h1>
      <p className="muted" style={{ fontSize: 15 }}>
        AtliQ Review reads incoming contracts and flags risks. It never signs, sends or edits anything.
      </p>
      <section className="panel" style={{ marginTop: 18 }}>
        <LoginForm next={safe(next)} />
      </section>
      <p className="hint">No account, or forgot your password? Ask an admin to create one or reset it.</p>
      {demoMode() ? (
        <section className="panel" style={{ marginTop: 18 }}>
          <h3>Demo mode</h3>
          <p className="hint" style={{ margin: 0 }}>
            This deployment runs in demo mode: look around as one of AtliQ&apos;s people without a password.
          </p>
          <div className="dismiss-row">
            {ROLE_ORDER.map((r) => (
              <form key={r} action={setViewingAs}>
                <input type="hidden" name="role" value={r} />
                <button type="submit" className="btn small">
                  {ROLES[r].name} · {ROLES[r].title}
                </button>
              </form>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
