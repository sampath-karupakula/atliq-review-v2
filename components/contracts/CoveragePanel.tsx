import Link from "next/link";
import type { Coverage } from "@/lib/data/register";
import type { TrackerSigned } from "@/lib/data/memory";
import { formatDate } from "@/lib/checks/dates";

// Gaps are shown, not hidden: everyone sees how many signed contracts reviews are checked against, and which ones
// the tracker lists but nobody has uploaded. Only an admin uploads them (they become what every review checks).
export function CoveragePanel({ coverage, missing, canUpload }: { coverage: Coverage; missing: TrackerSigned[]; canUpload: boolean }) {
  const gap = coverage.signedInTracker - coverage.onFile;
  const pct = coverage.signedInTracker ? Math.round((coverage.onFile / coverage.signedInTracker) * 100) : 0;
  const first = missing.slice(0, 5);
  const rest = missing.slice(5);
  const row = (m: TrackerSigned) => (
    <li key={m.trackerId}>
      <span style={{ minWidth: 0 }}>
        {m.counterparty}
        <span className="hint" style={{ display: "block" }}>
          {m.trackerId} · {m.docType}
          {m.signedDate ? ` · signed ${formatDate(m.signedDate)}` : ""}
        </span>
      </span>
      {canUpload ? (
        <Link className="btn small" href={`/contracts/new?mode=signed&tracker=${m.trackerId}`}>
          Upload
        </Link>
      ) : null}
    </li>
  );
  return (
    <div className="panel">
      <h3>What the tool can check</h3>
      <p style={{ fontSize: 14, margin: 0 }}>
        Checked against{" "}
        <b className="num">
          {coverage.onFile} of {coverage.signedInTracker}
        </b>{" "}
        signed contracts
      </p>
      <div className="meter">
        <i style={{ width: `${pct}%` }} />
      </div>
      <p className="hint" style={{ margin: 0 }}>
        {gap > 0
          ? `${gap} signed contract${gap === 1 ? " is" : "s are"} in the tracker but not on file, so a clash with ${gap === 1 ? "it" : "them"} can't be found.`
          : "Every signed contract in the tracker is on file."}{" "}
        {canUpload ? "Upload each one below as you find its file." : "Only Karandeep adds signed contracts; tell him if you have one of these files."}
      </p>
      {missing.length ? (
        <>
          <ul className="mini-list">{first.map(row)}</ul>
          {rest.length ? (
            <details>
              <summary className="hint" style={{ cursor: "pointer" }}>
                Show {rest.length} more
              </summary>
              <ul className="mini-list">{rest.map(row)}</ul>
            </details>
          ) : null}
        </>
      ) : null}
      <span className="dismiss-row">
        {canUpload ? (
          <Link className="btn small quiet" href="/contracts/new?mode=signed">
            Upload several at once
          </Link>
        ) : null}
        <Link className="btn small quiet" href="/exposure">
          Signed portfolio
        </Link>
      </span>
    </div>
  );
}
