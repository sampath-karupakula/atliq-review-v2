// Shared presentational pieces. They render the prototype's class names, so the CSS in globals.css is the design.
import type { ReactNode } from "react";
import Link from "next/link";

export type Severity = "serious" | "negotiable" | "minor" | "unsure";
export type Band = "high" | "medium" | "low" | "neutral";

export const SEVERITY_NAME: Record<Severity, string> = {
  serious: "Serious",
  negotiable: "Negotiable",
  minor: "Minor",
  unsure: "Not sure",
};

export function SeverityChip({ sev, children }: { sev: Severity | Band | "okc"; children?: ReactNode }) {
  const label = children ?? (sev in SEVERITY_NAME ? SEVERITY_NAME[sev as Severity] : sev);
  return <span className={`sev ${sev}`}>{label}</span>;
}

export function Tag({ kind, children }: { kind?: "clash" | "fast" | "new" | "overdue" | "miss" | "buyer"; children: ReactNode }) {
  return <span className={`tag${kind ? ` ${kind}` : ""}`}>{children}</span>;
}

export function Kpi({
  value,
  label,
  sub,
  href,
  alert,
}: {
  value: ReactNode;
  label: string;
  sub?: ReactNode;
  href?: string;
  alert?: boolean;
}) {
  const body = (
    <>
      <span className="kl">{label}</span>
      <b className="num">{value}</b>
      {sub ? <small>{sub}</small> : null}
    </>
  );
  const cls = `kpi${alert ? " alert" : ""}`;
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Panel({ title, aside, children, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel${className ? ` ${className}` : ""}`}>
      {title ? (
        <div className="sec-head">
          <h3>{title}</h3>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function PageHead({ eyebrow, title, aside }: { eyebrow?: string; title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="sec-head">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="display">{title}</h1>
      </div>
      {aside}
    </div>
  );
}

export function Crumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={i} style={{ display: "contents" }}>
          {i > 0 ? <span>›</span> : null}
          {it.href ? <Link href={it.href}>{it.label}</Link> : <span>{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function Chevron() {
  return (
    <svg className="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

// ---- Helpers with the first build's names, used by the components ported from it. They render the mock's styles.

export type PipelineSeverity = "serious" | "negotiable" | "minor" | "not_sure" | "info";
export type BandLabel = "Low" | "Medium" | "High";

/** Class string for a button, in the mock's style. */
export function btn(kind: "primary" | "secondary" | "quiet" | "danger" = "secondary", size: "sm" | "md" = "md"): string {
  const tone = { primary: " primary", secondary: "", quiet: " quiet", danger: " primary" }[kind];
  return `btn${tone}${size === "sm" ? " small" : ""}`;
}

const SEV_CLASS: Record<PipelineSeverity, string> = { serious: "serious", negotiable: "negotiable", minor: "minor", not_sure: "unsure", info: "neutral" };
const SEV_LABEL: Record<PipelineSeverity, string> = { serious: "Serious", negotiable: "Negotiable", minor: "Minor", not_sure: "Not sure", info: "Info" };

export function SeverityPill({ severity }: { severity: PipelineSeverity }) {
  return <span className={`sev ${SEV_CLASS[severity]}`}>{SEV_LABEL[severity]}</span>;
}

export function BandPill({ band, score }: { band: BandLabel | null; score?: number | null }) {
  if (!band) return <span className="sev neutral">Not reviewed</span>;
  return (
    <span className={`sev ${band.toLowerCase()}`}>
      {band}
      {score != null ? ` · ${score}` : ""}
    </span>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="sec-head">
      <div>
        <h1 className="display">{title}</h1>
        {subtitle ? <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-line bg-surface ${className}`}>{children}</section>;
}

// Placeholder for screens that arrive in a later phase. It names the phase so the demo never dead-ends silently.
export function Stub({ title, phase, children }: { title: string; phase: string; children?: ReactNode }) {
  return (
    <div className="stub">
      <h2>{title}</h2>
      <p className="hint">Built in {phase}. See ROADMAP.md for what it will hold.</p>
      {children}
    </div>
  );
}
