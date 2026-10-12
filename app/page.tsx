import Link from "next/link";
import { getSnapshot, fmtIST } from "@/lib/data";
import { actionTone } from "@/lib/scoring";
import { ActionChip, SignalCard } from "@/components/bits";
import { SIGNAL_TYPE_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PriorityQueue() {
  const { rows, changes, lastDone } = await getSnapshot();

  const assessed = rows.filter((r) => r.latest);
  const active = assessed
    .filter((r) => r.latest!.state === "active")
    .sort((a, b) => (b.latest!.score ?? 0) - (a.latest!.score ?? 0));
  const hot = active.filter((r) => actionTone(r.latest!.action) === "hot");
  const warm = active.filter((r) => actionTone(r.latest!.action) === "warm");
  const quiet = assessed.filter((r) => r.latest!.state === "quiet");
  const actionable = active.filter((r) => ["hot", "warm"].includes(actionTone(r.latest!.action)));
  const top = actionable.slice(0, 5);
  const rest = active.filter((r) => !top.includes(r));
  const unchecked = rows.length - assessed.length;

  const week = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long" });

  return (
    <div className="wrap">
      <header className="page-head">
        <div>
          <div className="eyebrow">Briefing · week of {week}</div>
          <h1>
            {assessed.length ? (
              <>{actionable.length} of {rows.length} VCs are worth reaching out to this week</>
            ) : (
              <>Your pipeline hasn&apos;t been scanned yet</>
            )}
          </h1>
          <p>
            Each recommendation is backed by an observable signal from the last 30 days: something they invested
            in, wrote, said or appeared at, with a link to the source. Quiet investors are listed separately so you
            know where not to spend energy.
          </p>
        </div>
      </header>

      {!assessed.length ? (
        <div className="panel empty">
          Press <b>Refresh now</b> (top right) to scan all {rows.length} investors for live signals. It takes about 3–5 minutes.
        </div>
      ) : (
        <>
          <div className="stats">
            <div className="panel stat hot"><div className="n">{hot.length}</div><div className="l">Reach out this week</div></div>
            <div className="panel stat warm"><div className="n">{warm.length}</div><div className="l">Worth a tailored note</div></div>
            <div className="panel stat"><div className="n">{quiet.length}</div><div className="l"><Link href="/quiet">Quiet: no signal in 30 days →</Link></div></div>
            <div className="panel stat"><div className="n">{rows.length}</div><div className="l">Tracked{unchecked ? ` · ${unchecked} not yet checked` : ""}</div></div>
          </div>

          {changes.length > 0 && (
            <section className="section">
              <div className="section-head">
                <h2>What changed since the last run</h2>
                <span className="muted small">Compared with the previous scan of each investor</span>
              </div>
              <div className="changes">
                {changes.slice(0, 12).map((c) => (
                  <Link key={c.row.inv.id} href={`/investor/${c.row.inv.id}`} className="panel change" style={{ color: "inherit", textDecoration: "none" }}>
                    {c.kind === "new_signal" && <span className="chip hot">New signal</span>}
                    {c.kind === "went_quiet" && <span className="chip">Went quiet</span>}
                    {(c.kind === "score_up" || c.kind === "score_down") && (
                      <span className={`delta ${c.kind === "score_up" ? "up" : "down"}`}>
                        {c.kind === "score_up" ? "▲" : "▼"} {Math.abs(c.delta)}
                      </span>
                    )}
                    <b>{c.row.inv.firm}</b>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="section">
            <div className="section-head">
              <h2>Top {top.length} to contact this week</h2>
              <span className="muted small">
                Ranked by follow-up score · {lastDone?.finished_at ? `data as of ${fmtIST(lastDone.finished_at)}` : "scan in progress"}
              </span>
            </div>
            {top.length ? (
              <div className="brief">
                {top.map((r, i) => <SignalCard key={r.inv.id} inv={r.inv} a={r.latest!} rank={i + 1} />)}
              </div>
            ) : (
              <div className="panel empty">No investor has a strong enough signal this week. Check the list below or the quiet page.</div>
            )}
          </section>

          {rest.length > 0 && (
            <section className="section">
              <div className="section-head">
                <h2>Also active, lower priority</h2>
                <span className="muted small">Real activity, but off-thesis, already contacted recently, or weaker evidence</span>
              </div>
              <div className="panel table-wrap">
                <table className="grid" style={{ minWidth: 720 }}>
                  <thead>
                    <tr><th>Score</th><th>Investor</th><th>Latest signal</th><th>Recommended action</th></tr>
                  </thead>
                  <tbody>
                    {rest.map((r) => {
                      const s = r.latest!.best_signal!;
                      return (
                        <tr key={r.inv.id}>
                          <td className="mono"><b>{r.latest!.score}</b></td>
                          <td><Link href={`/investor/${r.inv.id}`}><b>{r.inv.firm}</b></Link><div className="faint small">{r.inv.name}</div></td>
                          <td className="sum-cell">
                            <span className="small muted">{SIGNAL_TYPE_LABEL[s.type]} · {s.date} · </span>
                            <a href={s.url} target="_blank" rel="noreferrer" className="small">{s.source} ↗</a>
                            <div>{s.summary}</div>
                          </td>
                          <td><ActionChip action={r.latest!.action} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="section">
            <div className="callout accent small">
              <b>How the score works.</b> Logistics relevance 35 + recency 30 + signal type 15 + evidence quality 10 +
              relationship 10 = 100. Gemini Flash only classifies the evidence; the score itself is fixed arithmetic so the same
              evidence always gets the same score. Reach out this week needs 70+ and relevance 60+; a tailored note needs 55+ and relevance 30+.{" "}
              <Link href="/architecture#scoring">Full method →</Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
