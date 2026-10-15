import Link from "next/link";
import { notFound } from "next/navigation";
import { getInvestor, fmtIST } from "@/lib/data";
import { ActionChip, BreakdownBars, SignalMeta, StatusChip } from "@/components/bits";

export const dynamic = "force-dynamic";

export default async function InvestorPage({ params }: PageProps<"/investor/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { inv, history, edits } = await getInvestor(id);
  if (!inv) notFound();
  const latest = history.find((h) => h.state !== "error") ?? null;

  return (
    <div className="wrap">
      <header className="page-head">
        <div>
          <div className="eyebrow"><Link href="/pipeline">← All investors</Link></div>
          <h1>{inv.firm}</h1>
          <p>{inv.name} · {inv.kind} · {inv.geography}{inv.website && <> · <a href={`https://${inv.website}`} target="_blank" rel="noreferrer">{inv.website} ↗</a></>}</p>
        </div>
        {inv.follow_up_score !== null && (
          <div style={{ textAlign: "right" }}>
            <div className="mono" style={{ fontSize: 40, fontWeight: 650, lineHeight: 1 }}>{inv.follow_up_score}</div>
            <div className="small muted">follow-up score</div>
          </div>
        )}
      </header>

      <div className="grid2">
        <section className="panel pad">
          <h3 style={{ marginBottom: 12 }}><span className="chip lock">🔒 Vikram&apos;s columns</span></h3>
          <dl className="kv">
            <dt>Status</dt><dd><StatusChip status={inv.status} /></dd>
            <dt>Last contact</dt><dd className="mono">{inv.last_contact_date ?? "—"}</dd>
            <dt>Notes</dt><dd>{inv.notes || <span className="faint">—</span>}</dd>
            <dt>Thesis</dt><dd className="muted">{inv.thesis}</dd>
          </dl>
        </section>
        <section className="panel pad">
          <h3 style={{ marginBottom: 12 }}><span className="chip accent">⟳ Signal columns</span></h3>
          <dl className="kv">
            <dt>Last signal date</dt><dd className="mono">{inv.last_signal_date ?? "—"}</dd>
            <dt>Signal summary</dt><dd>{inv.signal_summary ?? "—"}</dd>
            <dt>Follow-up score</dt><dd className="mono">{inv.follow_up_score ?? "—"}</dd>
            <dt>Recommended action</dt><dd><ActionChip action={inv.recommended_action} />{!inv.recommended_action && "—"}</dd>
          </dl>
        </section>
      </div>

      {latest?.state === "active" && (
        <section className="section panel pad">
          <h2>Latest assessment</h2>
          {latest.why && <p className="why">{latest.why}</p>}
          {latest.opening_line && <div className="opener"><div><span className="lbl">Suggested opening line</span>{latest.opening_line}</div></div>}
          {latest.breakdown && <BreakdownBars b={latest.breakdown} total={latest.score} signal={latest.best_signal} scannedAt={latest.created_at} />}
        </section>
      )}

      <section className="section">
        <div className="section-head"><h2>Signals found in the last 30 days</h2><span className="muted small">From the latest scan</span></div>
        {latest?.signals.length ? (
          <div className="list">
            {latest.signals.map((s, i) => (
              <div key={i} className="panel pad">
                <b>{s.title}</b>
                <p className="small" style={{ marginTop: 4 }}>{s.summary}</p>
                <SignalMeta s={s} />
              </div>
            ))}
          </div>
        ) : (
          <div className="panel empty">No verified signals in the last 30 days.</div>
        )}
      </section>

      {latest && latest.rejected.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Evidence we rejected</h2><span className="muted small">Shown so you can see what was checked and why it didn&apos;t count</span></div>
          <div className="panel pad">
            {latest.rejected.map((r, i) => (
              <div key={i} className="rej">
                {r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a> : r.title} — <span className="bad" style={{ fontWeight: 500 }}>{r.reason}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head"><h2>Run history</h2></div>
        <div className="panel pad timeline">
          {history.length ? history.map((h) => (
            <div key={h.id} className="tl-item">
              <div className="small muted">{fmtIST(h.created_at)}</div>
              <div className="small">
                {h.state === "active" && <><b className="mono">{h.score}</b> · {h.best_signal?.title} · <ActionChip action={h.action} /></>}
                {h.state === "quiet" && <span className="muted">Quiet: no signal in the 30-day window</span>}
                {h.state === "error" && <span className="bad">Check failed ({h.error}); table left unchanged</span>}
              </div>
            </div>
          )) : <div className="muted">Not scanned yet.</div>}
        </div>
      </section>

      {edits.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Vikram&apos;s edit log</h2></div>
          <div className="panel pad timeline">
            {edits.map((e, i) => (
              <div key={i} className="tl-item">
                <div className="small muted">{fmtIST(e.edited_at)}</div>
                <div className="small"><b>{e.field}</b>: <span className="faint">{e.old_value || "—"}</span> → {e.new_value || "—"}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
