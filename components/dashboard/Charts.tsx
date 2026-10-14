// Dashboard charts as plain SVG, drawn to one scale, coloured from the theme tokens, with a <title> on every mark so
// hovering or focusing it says what it is. Server-rendered; no chart library.
import type { TrendPoint, WeekBar, Workload } from "@/lib/dashboard";

const BANDS: { key: keyof Omit<WeekBar, "label" | "start">; color: string }[] = [
  { key: "High", color: "var(--serious)" },
  { key: "Medium", color: "var(--nego)" },
  { key: "Low", color: "var(--ok)" },
  { key: "Not reviewed", color: "var(--ink-3)" },
];

export function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="lgd">
      {items.map(([l, c]) => (
        <span key={l}>
          <i style={{ background: c }} />
          {l}
        </span>
      ))}
    </div>
  );
}

export function DueByWeekChart({ weeks }: { weeks: WeekBar[] }) {
  const W = 380, H = 200, pl = 26, pr = 6, pt = 14, pb = 28;
  const ih = H - pt - pb, iw = W - pl - pr, n = weeks.length;
  const totals = weeks.map((w) => BANDS.reduce((a, b) => a + w[b.key].length, 0));
  const max = Math.max(3, ...totals);
  const y = (v: number) => pt + ih - (v / max) * ih;
  const ticks = Array.from({ length: max + 1 }, (_, v) => v).filter((v) => max <= 6 || v % 2 === 0);
  const summary = weeks.map((w, i) => `${w.label}: ${totals[i]}`).join("; ");
  return (
    <svg className="cv" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Client deadlines by week. ${summary}.`}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} style={{ stroke: "var(--rule)", strokeWidth: 1 }} />
          <text x={pl - 8} y={y(v) + 4} textAnchor="end" style={{ fill: "var(--ink-3)", fontSize: 11 }}>
            {v}
          </text>
        </g>
      ))}
      {weeks.map((w, i) => {
        const cx = pl + (iw * (i + 0.5)) / n, bw = 30, x = cx - bw / 2;
        let base = 0;
        return (
          <g key={w.start}>
            {BANDS.filter((b) => w[b.key].length).map((b) => {
              const h = y(base) - y(base + w[b.key].length) - (base > 0 ? 2 : 0);
              const top = y(base + w[b.key].length);
              base += w[b.key].length;
              return (
                <rect key={b.key} x={x} y={top} width={bw} height={Math.max(h, 1)} rx={3} style={{ fill: b.color }} tabIndex={0}>
                  <title>{`Week of ${w.label} · ${b.key}: ${w[b.key].join(", ")}`}</title>
                </rect>
              );
            })}
            {totals[i] ? (
              <text x={cx} y={y(totals[i]!) - 5} textAnchor="middle" style={{ fill: "var(--ink-2)", fontSize: 11, fontWeight: 600 }}>
                {totals[i]}
              </text>
            ) : null}
            <text x={cx} y={H - 8} textAnchor="middle" style={{ fill: "var(--ink-3)", fontSize: 11 }}>
              {w.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function WorkloadBars({ rows }: { rows: Workload[] }) {
  const max = Math.max(3, ...rows.map((r) => r.onTrack.length + r.overdue.length));
  return (
    <div className="hbars">
      {rows.map((r) => {
        const total = r.onTrack.length + r.overdue.length;
        return (
          <div key={r.name} className="hrow" tabIndex={0} title={`${r.name}: ${total ? [...r.onTrack, ...r.overdue].join(", ") : "no open reviews"}${r.overdue.length ? ` · ${r.overdue.length} overdue` : ""}`}>
            <span>{r.name}</span>
            <div className="track">
              {r.onTrack.length ? <i style={{ width: `${(r.onTrack.length / max) * 100}%`, background: "var(--accent)" }} /> : null}
              {r.overdue.length ? <i style={{ width: `${(r.overdue.length / max) * 100}%`, background: "var(--nego)" }} /> : null}
              {!total ? <em>Free</em> : null}
            </div>
            <b className="num">{total}</b>
          </div>
        );
      })}
    </div>
  );
}

export function TrendChart({ points, target = 80 }: { points: TrendPoint[]; target?: number }) {
  const W = 380, H = 190, pl = 34, pr = 40, pt = 12, pb = 26, lo = 0, hi = 100;
  const ih = H - pt - pb, iw = W - pl - pr, n = points.length;
  const x = (i: number) => pl + (iw * i) / Math.max(1, n - 1);
  const y = (v: number) => pt + ih - ((v - lo) / (hi - lo)) * ih;
  const withValue = points.map((p, i) => ({ ...p, i })).filter((p) => p.pct !== null);
  const last = withValue.at(-1);
  const path = withValue.map((p, k) => `${k ? "L" : "M"}${x(p.i)},${y(p.pct!)}`).join(" ");
  return (
    <svg className="cv" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Share of Serious flags kept (not dismissed as false alarms) by week. ${withValue.map((p) => `${p.week}: ${p.pct}%`).join("; ") || "No Serious flags yet"}. Target ${target}%.`}>
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} style={{ stroke: "var(--rule)", strokeWidth: 1 }} />
          <text x={pl - 8} y={y(v) + 4} textAnchor="end" style={{ fill: "var(--ink-3)", fontSize: 11 }}>
            {v}%
          </text>
        </g>
      ))}
      <line x1={pl} x2={W - pr} y1={y(target)} y2={y(target)} style={{ stroke: "var(--ink-2)", strokeWidth: 1.5, strokeDasharray: "4 4" }} />
      <text x={W - pr + 6} y={y(target) + 4} style={{ fill: "var(--ink-2)", fontSize: 11 }}>
        Target
      </text>
      {path ? <path d={path} style={{ fill: "none", stroke: "var(--accent)", strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round" }} /> : null}
      {withValue.map((p) => (
        <circle key={p.week} cx={x(p.i)} cy={y(p.pct!)} r={p === last ? 4.5 : 3} style={{ fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }} tabIndex={0}>
          <title>{`Week of ${p.week}: ${p.kept} of ${p.total} Serious flags kept (${p.pct}%)`}</title>
        </circle>
      ))}
      {last ? (
        <text x={x(last.i) + 8} y={y(last.pct!) - 6} style={{ fill: "var(--ink)", fontSize: 12, fontWeight: 600 }}>
          {last.pct}%
        </text>
      ) : (
        <text x={pl + iw / 2} y={pt + ih / 2} textAnchor="middle" style={{ fill: "var(--ink-3)", fontSize: 12 }}>
          No Serious flags yet
        </text>
      )}
      {[0, Math.floor((n - 1) / 2), n - 1].map((i) => (
        <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} style={{ fill: "var(--ink-3)", fontSize: 11 }}>
          {points[i]?.week}
        </text>
      ))}
    </svg>
  );
}
