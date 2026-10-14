"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// One message at a time, announced to screen readers, with an optional Undo or other action. Every dismissal and
// acceptance uses this (user control and freedom): the action happens at once and can be taken back for 6 seconds.
// Callers pass either an undo function (`toast(text, undo)`) or options (`toast(text, { tone, action })`).
type Action = { label: string; run: () => void };
type Opts = { tone?: "ok" | "error"; action?: Action };
type ToastState = { text: string; tone: "ok" | "error"; action?: Action } | null;
type ToastApi = { toast: (text: string, undoOrOpts?: (() => void) | Opts) => void };

const ToastContext = createContext<ToastApi>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setState(null);
  }, []);

  const toast = useCallback((text: string, undoOrOpts?: (() => void) | Opts) => {
    if (timer.current) clearTimeout(timer.current);
    const opts: Opts = typeof undoOrOpts === "function" ? { action: { label: "Undo", run: undoOrOpts } } : (undoOrOpts ?? {});
    setState({ text, tone: opts.tone ?? "ok", action: opts.action });
    timer.current = setTimeout(() => setState(null), opts.tone === "error" ? 9000 : 6000);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live={state?.tone === "error" ? "assertive" : "polite"}>
        {state ? (
          <div className="toast" role="status" style={state.tone === "error" ? { background: "var(--serious)" } : undefined}>
            <span>{state.text}</span>
            {state.action ? (
              <button
                type="button"
                onClick={() => {
                  state.action?.run();
                  clear();
                }}
              >
                {state.action.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
