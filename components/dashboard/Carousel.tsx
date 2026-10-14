"use client";

// One item at a time with arrows and a count, so a card stays the same size however many are waiting and the
// dashboard keeps its three-card limit.
import { useState, useTransition } from "react";
import Link from "next/link";
import { remindReviewer } from "@/app/actions/dashboard";
import { useToast } from "@/components/Toast";

export type CarouselItem = { id: string; kicker: string; title: string; body: string; href: string; remind?: { contractId: string; who: string } };

export function Carousel({ empty, items, label }: { empty: { kicker: string; title: string; body: string }; items: CarouselItem[]; label: string }) {
  const [i, setI] = useState(0);
  const [busy, start] = useTransition();
  const { toast } = useToast();
  if (!items.length) {
    return (
      <li className="need">
        <span className="k">{empty.kicker}</span>
        <h3>{empty.title}</h3>
        <p>{empty.body}</p>
      </li>
    );
  }
  const at = Math.min(i, items.length - 1);
  const it = items[at]!;
  return (
    <li className="need">
      <span className="k">{it.kicker}</span>
      <h3>{it.title}</h3>
      <p>{it.body}</p>
      <div className="car-foot">
        <span className="dismiss-row">
          {it.remind ? (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                start(async () => {
                  const r = await remindReviewer(it.remind!.contractId);
                  toast(r.ok ? `Reminder sent to ${it.remind!.who} in AtliQ Review.` : r.error, r.ok ? undefined : { tone: "error" });
                })
              }
            >
              Remind {it.remind.who}
            </button>
          ) : null}
          <Link className="btn quiet small" href={it.href}>
            Open
          </Link>
        </span>
        {items.length > 1 ? (
          <div className="car-nav" role="group" aria-label={label}>
            <button type="button" className="car-btn" aria-label="Previous" disabled={at === 0} onClick={() => setI(at - 1)}>
              ‹
            </button>
            <span className="car-dots" aria-live="polite">
              <span className="num">
                {at + 1} of {items.length}
              </span>
            </span>
            <button type="button" className="car-btn" aria-label="Next" disabled={at === items.length - 1} onClick={() => setI(at + 1)}>
              ›
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}
