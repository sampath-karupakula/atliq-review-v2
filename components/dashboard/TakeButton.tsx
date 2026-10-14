"use client";

// A reviewer takes an unassigned contract for themselves, due two days before the client deadline (or in three days
// when there is no deadline). The date can be changed on the contract page.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { takeReview } from "@/app/actions/workflow";
import { useToast } from "@/components/Toast";

export function TakeButton({ contractId, reviewBy, label }: { contractId: string; reviewBy: string; label: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      className="btn small"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await takeReview(contractId, reviewBy);
          if (!r.ok) return toast(r.error, { tone: "error" });
          router.refresh();
          toast(`${label} is yours. Review by ${reviewBy}.`);
        })
      }
    >
      Take it
    </button>
  );
}
