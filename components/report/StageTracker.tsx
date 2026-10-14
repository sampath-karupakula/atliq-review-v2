// The six-step track every contract follows, with the current step and what happens next. Works on the server.
import { STAGES, type Stage } from "@/lib/stage";

export function StageTracker({ stage, round }: { stage: Stage; round: number }) {
  return (
    <div className="panel" style={{ padding: "12px 14px", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 4 }} role="img" aria-label={`Stage: ${stage.label}`}>
        {STAGES.map((s, i) => {
          const skipped = i === 3 && stage.negotiationSkipped && stage.index > 3;
          const done = i < stage.index;
          const cur = i === stage.index;
          const label = i === 2 && round > 1 ? `Re-review · v${round}` : i === 3 && skipped ? "Negotiation skipped" : i === 3 && round > 1 ? `Negotiating · round ${round}` : s;
          return (
            <div key={s} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              <i
                style={{
                  display: "block",
                  height: 6,
                  borderRadius: 3,
                  background: skipped ? "repeating-linear-gradient(90deg, var(--accent) 0 6px, transparent 6px 10px)" : done ? "var(--accent)" : cur ? "var(--ink)" : "var(--sunk)",
                }}
              />
              <span style={{ fontSize: 12, color: cur ? "var(--ink)" : "var(--ink-3)", fontWeight: cur ? 600 : 400, fontStyle: skipped ? "italic" : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={label}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
      <p style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 13.5, color: "var(--ink-2)" }}>
        <b style={{ color: "var(--ink)" }}>{stage.label}</b>
        <span>{stage.next}</span>
      </p>
    </div>
  );
}
