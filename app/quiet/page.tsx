import Link from "next/link";
import { getSnapshot, daysAgo, ago } from "@/lib/data";
import { StatusChip } from "@/components/bits";

export const dynamic = "force-dynamic";

export default async function QuietPage() {
  const { rows } = await getSnapshot();
  const quiet = rows
    .filter((r) => r.latest?.state === "quiet")
    .sort((a, b) => a.inv.firm.localeCompare(b.inv.firm));
  const waiting = quiet.filter((r) => r.inv.status === "waiting_response");

  return (
    <div className="wrap">
      <header className="page-head">
        <div>
          <div className="eyebrow">Where not to spend energy this week</div>
          <h1>{quiet.length} quiet investors</h1>
          <p>
            No verifiable activity in the last 30 days: no new investment, post, interview or event we could
            confirm. They are re-checked automatically every Monday and Thursday, so a quiet VC moves back to the
            priority queue as soon as they do something.
          </p>
        </div>
      </header>

      {waiting.length > 0 && (
        <div className="callout" style={{ marginBottom: 18 }}>
          <b>{waiting.length} of these are waiting on a reply from you.</b> A quiet investor plus no reply usually means
          the message landed at a bad moment. Rather than chasing now, wait for a signal and follow up referencing it.
        </div>
      )}

      {!quiet.length ? (
        <div className="panel empty">No quiet investors in the latest scan{rows.some((r) => r.latest) ? "" : " (no scan yet; press Refresh now)"}.</div>
      ) : (
        <div className="panel table-wrap">
          <table className="grid" style={{ minWidth: 760 }}>
            <thead>
              <tr><th>Investor</th><th>Your status</th><th>Last known signal</th><th>What we checked</th><th>Checked</th></tr>
            </thead>
            <tbody>
              {quiet.map((r) => (
                <tr key={r.inv.id}>
                  <td>
                    <Link href={`/investor/${r.inv.id}`}><b>{r.inv.firm}</b></Link>
                    <div className="small muted">{r.inv.name}</div>
                  </td>
                  <td><StatusChip status={r.inv.status} />{r.inv.last_contact_date && <div className="tiny faint" style={{ marginTop: 4 }}>contacted {r.inv.last_contact_date}</div>}</td>
                  <td className="small">
                    {r.inv.last_signal_date ? <>{r.inv.last_signal_date} <span className="faint">({daysAgo(r.inv.last_signal_date)})</span></> : <span className="faint">None on record</span>}
                  </td>
                  <td className="small muted">
                    {r.latest!.rejected.length
                      ? `${r.latest!.rejected.length} item${r.latest!.rejected.length > 1 ? "s" : ""} found but rejected (old, off-target or unverifiable)`
                      : "News + web search: nothing in the last 30 days"}
                  </td>
                  <td className="small faint">{ago(r.latest!.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
