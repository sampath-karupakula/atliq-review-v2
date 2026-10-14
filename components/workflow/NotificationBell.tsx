"use client";

// In-app notifications. Accessible popover (A-3): aria-expanded, Escape and outside click close it, focus returns
// to the bell. Unread items stay highlighted while the panel is open and are marked read when it closes (H1-4);
// each item can be toggled read/unread (H3-4).
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Bell, CheckCheck, Circle, CircleDot } from "lucide-react";
import { markNotificationsRead, setNotificationRead } from "@/app/actions/workflow";

type Note = { id: string; text: string; read: boolean; contractId: string | null; createdAt: string; kind: string };

export function NotificationBell({ notes, unread }: { notes: Note[]; unread: number }) {
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const seen = useRef<Set<string>>(new Set());

  const close = useCallback(
    (focusBell: boolean) => {
      setOpen(false);
      const ids = [...seen.current];
      seen.current.clear();
      if (ids.length) start(() => void markNotificationsRead(ids));
      if (focusBell) trigger.current?.focus();
    },
    [start],
  );

  useEffect(() => {
    if (!open) return;
    for (const n of notes) if (!n.read) seen.current.add(n.id);
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, notes, close]);

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        aria-controls="notifications-panel"
        onClick={() => (open ? close(false) : setOpen(true))}
        className="bell"
      >
        <Bell className="size-4" aria-hidden />
        {unread > 0 && (
          <span className="bcount">{unread}</span>
        )}
      </button>
      {open && (
        <div
          id="notifications-panel"
          role="region"
          aria-label="Notifications"
          className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface p-2 shadow-lg"
        >
          <div className="mb-1 flex items-center justify-between px-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => {
                  seen.current.clear();
                  start(() => void markNotificationsRead());
                }}
                className="tap flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-accent hover:bg-surface-2"
              >
                <CheckCheck className="size-3.5" aria-hidden /> Mark all read
              </button>
            )}
          </div>
          {notes.length ? (
            <ul className="max-h-96 space-y-1 overflow-auto text-sm">
              {notes.map((n) => (
                <li key={n.id} className={`flex gap-2 rounded-md px-2 py-1.5 ${n.read ? "" : "bg-accent/10"}`}>
                  <div className="min-w-0 flex-1">
                    {n.contractId ? (
                      <Link href={`/contracts/${n.contractId}`} onClick={() => close(false)} className="hover:underline">
                        {n.text}
                      </Link>
                    ) : (
                      n.text
                    )}
                    <div className="text-xs text-muted">{new Date(n.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      seen.current.delete(n.id);
                      start(() => void setNotificationRead(n.id, !n.read));
                    }}
                    className="tap self-start rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
                    aria-label={n.read ? "Mark as unread" : "Mark as read"}
                    title={n.read ? "Mark as unread" : "Mark as read"}
                  >
                    {n.read ? <Circle className="size-3.5" aria-hidden /> : <CircleDot className="size-3.5 text-accent" aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-3 text-sm text-muted">No notifications yet. Assignments, finished reviews, comments and deadline reminders appear here.</p>
          )}
        </div>
      )}
    </div>
  );
}
