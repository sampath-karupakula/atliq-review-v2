"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// One message at a time, announced to screen readers, with an optional Undo. Every dismissal and acceptance in
// the app uses this (user control and freedom): the action happens at once and can be taken back for 6 seconds.
type ToastState = { text: string; undo?: () => void } | null;
type ToastApi = { toast: (text: string, undo?: () => void) => void };

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

  const toast = useCallback(
    (text: string, undo?: () => void) => {
      if (timer.current) clearTimeout(timer.current);
      setState({ text, undo });
      timer.current = setTimeout(() => setState(null), 6000);
    },
    [],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite">
        {state ? (
          <div className="toast" role="status">
            <span>{state.text}</span>
            {state.undo ? (
              <button
                type="button"
                onClick={() => {
                  state.undo?.();
                  clear();
                }}
              >
                Undo
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
