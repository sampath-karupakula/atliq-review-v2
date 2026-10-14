import type { Coverage } from "@/lib/data/register";

// Gaps are shown, not hidden: every clean result carries this footnote, and the missing files become a to-do list.
export function CoveragePanel({ coverage }: { coverage: Coverage }) {
  const missing = coverage.signedInTracker - coverage.onFile;
  const pct = coverage.signedInTracker ? Math.round((coverage.onFile / coverage.signedInTracker) * 100) : 0;
  return (
    <div className="panel">
      <h3>What the tool can check</h3>
      <p style={{ fontSize: 14 }}>
        Checked against{" "}
        <b className="num">
          {coverage.onFile} of {coverage.signedInTracker}
        </b>{" "}
        signed contracts
      </p>
      <div className="meter">
        <i style={{ width: `${pct}%` }} />
      </div>
      <p className="hint">
        {missing} signed contract{missing === 1 ? " is" : "s are"} in the tracker but not on file, so a clash with them can&apos;t be found. Uploading them arrives in P4.
      </p>
    </div>
  );
}
