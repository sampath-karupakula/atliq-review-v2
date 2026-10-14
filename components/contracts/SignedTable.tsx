import Link from "next/link";
import { RowLink } from "./RowLink";
import { Tag } from "@/components/ui";
import { formatDate } from "@/lib/checks/dates";
import { docLabel } from "@/lib/display";
import type { SignedRow } from "@/lib/data/portfolio";

export function SignedTable({ rows, showCompany = true }: { rows: SignedRow[]; showCompany?: boolean }) {
  if (!rows.length) return <p className="hint">None here.</p>;
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Document</th>
            <th>Signed</th>
            <th>Runs until</th>
            <th>Promises AtliQ made in it</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <RowLink key={r.id} href={r.companyId ? `/companies/${r.companyId}` : `/contracts/${r.id}`}>
              <td className="co">
                {showCompany && r.companyId ? (
                  <Link href={`/companies/${r.companyId}`} style={{ textDecoration: "none" }}>
                    {r.companyName}
                  </Link>
                ) : (
                  r.title
                )}
                <small>{showCompany ? r.title : docLabel(r.docType)}</small>
              </td>
              <td className="num">{formatDate(r.signedDate)}</td>
              <td className="num">
                {r.ends ? formatDate(r.ends) : <span className="muted">No end date</span>}
                {!r.inForce ? (
                  <>
                    {" "}
                    <Tag>Ended</Tag>
                  </>
                ) : null}
              </td>
              <td>{r.promises.length ? r.promises.map((p) => <Tag key={p}>{p}</Tag>) : <span className="muted">None on the register</span>}</td>
            </RowLink>
          ))}
        </tbody>
      </table>
    </div>
  );
}
