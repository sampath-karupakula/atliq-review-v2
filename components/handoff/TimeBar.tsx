// Estimated (light) against spent (dark) review time on one scale; the part over the estimate is amber.
import { hm } from "@/lib/review/handoff";

export function TimeBar({ est, spent, max }: { est: number; spent: number; max: number }) {
  const w = (v: number) => `${Math.min(100, (v / Math.max(1, max)) * 100)}%`;
  return (
    <div className="tbar" title={`Estimated ${hm(est)} · spent ${hm(spent)}`} role="img" aria-label={`Estimated ${hm(est)}, spent ${hm(spent)}`}>
      <span className="tb-est" style={{ width: w(est) }} />
      <span className="tb-act" style={{ width: w(Math.min(spent, est)) }} />
      {spent > est ? <span className="tb-over" style={{ left: w(est), width: w(spent - est) }} /> : null}
    </div>
  );
}
