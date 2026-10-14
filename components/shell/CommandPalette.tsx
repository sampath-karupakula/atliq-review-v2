"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/roles";
import { ROLE_ORDER, ROLES } from "@/lib/roles";
import { setViewingAs } from "@/app/actions/viewer";
import { setTheme, type Theme } from "./theme";

// Ctrl K: every screen, role and action is one search away. Jump commands come from the role's nav plus the
// screens every role may open; later phases add contracts and companies by name.
type Cmd = { label: string; kind: string; run: () => void };

export function CommandPalette({ role, onKeys }: { role: Role; onKeys: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const cmds = useMemo<Cmd[]>(() => {
    const go = (href: string, label: string, kind = "Go to"): Cmd => ({ label, kind, run: () => router.push(href) });
    const list: Cmd[] = ROLES[role].nav.map((n) => go(n.href, n.label));
    list.push(go("/contracts/new", "Upload a contract", "Action"));
    list.push(go("/offer", "Can I offer this?"));
    list.push(go("/exposure", "Signed portfolio"));
    list.push(go("/deadlines", "Deadlines"));
    list.push(go("/counsel", "Counsel tracker"));
    list.push(go("/insights", "Insights"));
    list.push(go("/activity", "Activity log"));
    for (const r of ROLE_ORDER) {
      list.push({
        label: `View as ${ROLES[r].name} (${ROLES[r].title})`,
        kind: "Switch role",
        run: () => {
          const fd = new FormData();
          fd.set("role", r);
          void setViewingAs(fd);
        },
      });
    }
    for (const t of ["light", "dark", "system"] as Theme[]) {
      list.push({ label: `Theme: ${t}`, kind: "Appearance", run: () => setTheme(t) });
    }
    list.push({ label: "Keyboard shortcuts", kind: "Help", run: onKeys });
    return list;
  }, [role, router, onKeys]);

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? cmds.filter((c) => `${c.label} ${c.kind}`.toLowerCase().includes(s)) : cmds;
  }, [cmds, q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        setQ("");
        setSel(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const run = (c: Cmd | undefined) => {
    if (!c) return;
    setOpen(false);
    c.run();
  };

  return (
    <>
      <button type="button" className="kbtn" onClick={() => setOpen(true)} aria-label="Search or jump (Ctrl K)">
        <span className="lbl">Search or jump</span> <kbd>Ctrl K</kbd>
      </button>
      {open ? (
        <div className="scrim" onClick={() => setOpen(false)}>
          <div className="dialog palette" role="dialog" aria-modal="true" aria-label="Search or jump" onClick={(e) => e.stopPropagation()}>
            <input
              ref={input}
              // Focused as it mounts, so keys typed right after Ctrl K are not lost.
              autoFocus
              type="text"
              id="palette-input"
              value={q}
              placeholder="Search screens, contracts and actions"
              autoComplete="off"
              aria-controls="palette-list"
              onChange={(e) => {
                setQ(e.target.value);
                setSel(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSel((s) => (items.length ? (s + 1) % items.length : 0));
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSel((s) => (items.length ? (s - 1 + items.length) % items.length : 0));
                }
                if (e.key === "Enter") run(items[sel]);
              }}
            />
            <ul id="palette-list" role="listbox">
              {items.length ? (
                items.map((c, i) => (
                  <li key={`${c.kind}:${c.label}`} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => run(c)}>
                    <span>{c.label}</span>
                    <small>{c.kind}</small>
                  </li>
                ))
              ) : (
                <li>
                  <span className="muted">Nothing matches. Try a screen name.</span>
                </li>
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
