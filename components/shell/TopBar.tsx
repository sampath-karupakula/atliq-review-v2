"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback } from "react";
import { ROLE_ORDER, ROLES, type Role } from "@/lib/roles";
import { setViewingAs } from "@/app/actions/viewer";
import { CommandPalette } from "./CommandPalette";
import { KeysSheet, useKeysSheet } from "./KeysSheet";
import { NotificationBell } from "@/components/workflow/NotificationBell";

export type BellNote = { id: string; text: string; read: boolean; contractId: string | null; createdAt: string; kind: string };

// One sticky bar on every screen: brand, the role's short nav, search, notifications, and "Viewing as".
export function TopBar({ role, unread, notes, user, demo }: { role: Role; unread: number; notes: BellNote[]; user: { name: string; roleLabel: string; admin: boolean }; demo: boolean }) {
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
          <CommandPalette role={role} onKeys={openKeys} demo={demo} admin={user.admin} />
          <NotificationBell notes={notes} unread={unread} />
          {demo ? (
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
          ) : (
            <Link href="/account" className="btn quiet small" title={user.roleLabel}>
              {user.name}
            </Link>
          )}
        </div>
      </div>
      <KeysSheet open={keys.open} onClose={() => keys.setOpen(false)} />
    </header>
  );
}
