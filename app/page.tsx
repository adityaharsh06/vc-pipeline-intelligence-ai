import Link from "next/link";
import { getSnapshot, fmtIST } from "@/lib/data";
import { actionTone, THRESHOLDS } from "@/lib/scoring";
import { ActionChip, SignalCard } from "@/components/bits";
import { SIGNAL_TYPE_LABEL, type SignalType } from "@/lib/types";
import { Donut, SignalTypeBars, StatIcon } from "@/components/Charts";

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

  const typeData = (Object.keys(SIGNAL_TYPE_LABEL) as SignalType[]).map((type) => {
    const sigs = active.map((r) => r.latest!.best_signal!).filter((s) => s.type === type);
    const onThesis = sigs.filter((s) => s.relevance >= THRESHOLDS.reachOutRelevance).length;
    return { type, onThesis, other: sigs.length - onThesis };
  });

  const week = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long" });

  return (
    <div className="wrap">
      <header className="page-head">
        <div>
          <div className="eyebrow">Briefing · week of {week}</div>
          <h1>
            {assessed.length ? (
              <>{hot.length} of {rows.length} VCs are worth contacting this week</>
            ) : (
              <>Your pipeline hasn&apos;t been scanned yet</>
            )}
          </h1>
          <p>
            Each recommendation is backed by an observable signal from the last 30 days: something they invested
            in, wrote, said or appeared at, with a link to the source.{" "}
            {assessed.length > 0 && <>{warm.length} more are worth a tailored note, and {quiet.length} have gone quiet.</>}
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
            <div className="stat"><StatIcon name="send" /><div className="l">Reach out this week</div><div className="n">{hot.length}</div>{hot.length > 0 && <Link className="cta" href="/outreach">✉ Draft {hot.length} emails →</Link>}</div>
            <div className="stat"><StatIcon name="note" /><div className="l">Worth a tailored note</div><div className="n">{warm.length}</div>{warm.length > 0 && <Link className="cta" href="/warmup">✍ Warm-up kit →</Link>}</div>
            <div className="stat"><StatIcon name="moon" /><div className="l"><Link href="/quiet">Quiet: no signal in 30 days</Link></div><div className="n">{quiet.length}</div></div>
            <div className="stat"><StatIcon name="users" /><div className="l">Tracked{unchecked ? ` · ${unchecked} unchecked` : ""}</div><div className="n">{rows.length}</div><Link className="cta" href="/pipeline#manage">⚙ Manage pipeline →</Link></div>
          </div>

          <div className="charts">
            <section className="panel pad">
              <div className="chart-head">
                <h2>Signals this week by type</h2>
                <div className="legend">
                  <span><i style={{ background: "#3d7bf5" }} />On-thesis (logistics relevance {THRESHOLDS.reachOutRelevance}+)</span>
                  <span><i style={{ background: "#ffa24f" }} />Other activity</span>
                </div>
              </div>
              <SignalTypeBars data={typeData} />
            </section>
            <section className="panel pad">
              <div className="chart-head"><h2>Pipeline at a glance</h2><span className="muted small">{rows.length} investors</span></div>
              <Donut
                center={String(hot.length)}
                caption="to contact now"
                slices={[
                  { label: "Reach out", value: hot.length, color: "#33b864", sub: `${hot.length} VCs` },
                  { label: "Tailored note", value: warm.length, color: "#ff9a4a", sub: `${warm.length} VCs` },
                  { label: "Low priority", value: active.length - hot.length - warm.length, color: "#3d7bf5", sub: `${active.length - hot.length - warm.length} VCs` },
                  { label: "Quiet", value: quiet.length, color: "#8a6cf3", sub: `${quiet.length} VCs` },
                ]}
              />
            </section>
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
              evidence always gets the same score. Reach out this week needs {THRESHOLDS.reachOut}+ and logistics relevance {THRESHOLDS.reachOutRelevance}+; a tailored note needs {THRESHOLDS.tailored}+ and relevance {THRESHOLDS.tailoredRelevance}+.{" "}
              <Link href="/architecture#scoring">Full method →</Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
