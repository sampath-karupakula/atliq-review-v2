"use client";

import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { resetDemoState } from "@/app/actions/demo";
import { btn } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";

export function ResetDemoButton() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={pending} className={btn("secondary", "sm")}>
        <RotateCcw className="size-4" aria-hidden /> {pending ? "Resetting…" : "Reset demo…"}
      </button>
      <ConfirmDialog
        open={open}
        title="Reset the demo?"
        confirmLabel="Reset demo"
        tone="danger"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          start(async () => {
            const r = await resetDemoState();
            toast(r.ok ? "Demo reset. Reviews were kept; everything people did on them was cleared." : r.error, { tone: r.ok ? "ok" : "error" });
          });
        }}
      >
        <p>This clears every dismissal, accepted risk, comment, decision, first-review assignment, notification and deal edit, and empties this activity log.</p>
        <p>Finished reviews, the register, contracts and deals are kept, so no AI calls are needed to demo again. This can&rsquo;t be undone.</p>
      </ConfirmDialog>
    </>
  );
}
