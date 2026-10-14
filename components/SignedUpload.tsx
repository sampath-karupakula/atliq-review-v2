"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { docLabel } from "@/lib/display";
import { formatDate } from "@/lib/checks/dates";
import { useToast } from "@/components/Toast";

type Result =
  | { file: string; ok: true; contractId: string; counterparty: string; docType: string; signedDate: string | null; clauses: number }
  | { file: string; ok: false; message: string; duplicateOf?: string | null };

// Many signed files at once. Each is read for who, what and when; the coverage meter moves as soon as they land.
export function SignedUpload({ coverage }: { coverage: { onFile: number; signedInTracker: number } }) {
  const router = useRouter();
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [cov, setCov] = useState(coverage);
  const missing = cov.signedInTracker - cov.onFile;

  async function send() {
    if (!files.length) return;
    setBusy(true);
    const fd = new FormData();
    for (const f of files) fd.append("file", f);
    try {
      const res = await fetch("/api/contracts/signed", { method: "POST", body: fd });
      const json = await res.json();
      if (json.results) setResults(json.results);
      if (json.coverage) setCov(json.coverage);
      if (json.added) {
        toast(`${json.added} signed contract${json.added === 1 ? "" : "s"} added. Coverage is now ${json.coverage.onFile} of ${json.coverage.signedInTracker}.`);
        router.refresh();
      } else toast(json.error ?? "None of the files could be added.", { tone: "error" });
      setFiles([]);
    } catch {
      toast("The upload didn't reach the server. Check your connection and try again.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="report-grid">
      <div className="rep-main">
        <label
          htmlFor="signed-files"
          className="panel"
          style={{ borderStyle: "dashed", borderWidth: 2, alignItems: "center", textAlign: "center", padding: "36px 20px", cursor: "pointer" }}
        >
          <input
            id="signed-files"
            type="file"
            multiple
            accept=".pdf,.docx,.md,.txt"
            style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
            onChange={(e) => setFiles([...(e.target.files ?? [])])}
          />
          <b>{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} chosen` : "Choose signed contracts, or drop them here"}</b>
          <span className="hint">PDF with a text layer, Word, Markdown or text · up to 20 at a time. Nothing is sent to the AI.</span>
          {files.length ? (
            <span className="hint" style={{ maxWidth: 560 }}>
              {files.map((f) => f.name).join(" · ")}
            </span>
          ) : null}
        </label>
        <div className="dismiss-row">
          <button type="button" className="btn primary" disabled={!files.length || busy} onClick={() => void send()}>
            {busy ? "Adding…" : `Add ${files.length || ""} to the register's sources`}
          </button>
          <span className="hint">
            Coverage goes from {cov.onFile} to {Math.min(cov.onFile + files.length, Math.max(cov.signedInTracker, cov.onFile + files.length))} of {Math.max(cov.signedInTracker, cov.onFile + files.length)}.
          </span>
        </div>
        {results ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Counterparty</th>
                  <th>Type</th>
                  <th>Signed</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.file}>
                    <td style={{ maxWidth: 220, overflowWrap: "anywhere" }}>
                      <small>{r.file}</small>
                    </td>
                    {r.ok ? (
                      <>
                        <td className="co">{r.counterparty}</td>
                        <td>{docLabel(r.docType)}</td>
                        <td className="num">{r.signedDate ? formatDate(r.signedDate) : <span className="muted">Not found</span>}</td>
                        <td>
                          <span className="tag fast">Added</span> <span className="hint">{r.clauses} clauses</span>
                        </td>
                      </>
                    ) : (
                      <td colSpan={4} style={{ color: "var(--nego)" }}>
                        {r.message}
                        {r.duplicateOf ? (
                          <>
                            {" "}
                            <Link className="lnk" href={`/contracts/${r.duplicateOf}`}>
                              Open it
                            </Link>
                          </>
                        ) : null}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      <aside className="side">
        <div className="panel">
          <h3>What the tool can check</h3>
          <p style={{ fontSize: 14 }}>
            Checked against{" "}
            <b className="num">
              {cov.onFile} of {cov.signedInTracker}
            </b>{" "}
            signed contracts
          </p>
          <div className="meter">
            <i style={{ width: `${cov.signedInTracker ? Math.round((cov.onFile / cov.signedInTracker) * 100) : 0}%` }} />
          </div>
          <p className="hint">
            {missing > 0
              ? `${missing} signed contract${missing === 1 ? " is" : "s are"} in the tracker but not on file, so a clash with them can't be found.`
              : "Every signed contract in the tracker is on file."}
          </p>
          <Link className="btn quiet small" href="/contracts?view=signed" style={{ alignSelf: "flex-start" }}>
            See the signed portfolio
          </Link>
        </div>
      </aside>
    </div>
  );
}
