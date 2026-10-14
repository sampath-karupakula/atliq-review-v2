"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback } from "react";
import { ROLE_ORDER, ROLES, type Role } from "@/lib/roles";
import { setViewingAs } from "@/app/actions/viewer";
import { CommandPalette } from "./CommandPalette";
import { KeysSheet, useKeysSheet } from "./KeysSheet";

// One sticky bar on every screen: brand, the role's short nav, search, notifications, and "Viewing as".
export function TopBar({ role, unread }: { role: Role; unread: number }) {
  const pathname = usePathname();
  const keys = useKeysSheet();
  const openKeys = useCallback(() => keys.setOpen(true), [keys]);
  const r = ROLES[role];

  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link href={r.home} className="brand" aria-label="AtliQ Review home">
          AtliQ <span>Review</span>
        </Link>
        <nav className="nav" aria-label="Main">
          {r.nav.map((n) => {
            const current = pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href + "/")) || (n.href === "/contracts" && pathname.startsWith("/companies"));
            return (
              <Link key={n.href} href={n.href} aria-current={current ? "page" : undefined}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="tb-right">
          <CommandPalette role={role} onKeys={openKeys} />
          <Link href="/activity" className="bell" aria-label={`Notifications, ${unread} unread`}>
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 2.5a5 5 0 0 0-5 5v3l-1.5 3h13L15 10.5v-3a5 5 0 0 0-5-5Z M8 15.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            {unread ? <span className="bcount">{unread}</span> : null}
          </Link>
          <form action={setViewingAs} className="role">
            <label htmlFor="viewing-as">
              <span>Viewing as</span>
            </label>
            {/* key: the redirect keeps this component mounted, so remount the select to show the new role. */}
            <select key={role} id="viewing-as" name="role" defaultValue={role} aria-label="Viewing as" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
              {ROLE_ORDER.map((k) => (
                <option key={k} value={k}>
                  {ROLES[k].name} · {ROLES[k].title}
                </option>
              ))}
            </select>
          </form>
        </div>
      </div>
      <KeysSheet open={keys.open} onClose={() => keys.setOpen(false)} />
    </header>
  );
}
