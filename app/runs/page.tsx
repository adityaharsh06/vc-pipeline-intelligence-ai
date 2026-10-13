import { getSnapshot, fmtIST, nextScheduled } from "@/lib/data";
import GuardTest from "@/components/GuardTest";
import { StatIcon } from "@/components/Charts";
import { db } from "@/lib/supabase";
import type { Run } from "@/lib/types";

export const dynamic = "force-dynamic";

function duration(r: Run) {
  if (!r.finished_at) return "—";
  const s = Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function Integrity({ r }: { r: Run }) {
  if (!r.fingerprint_after) return <span className="faint">pending</span>;
  if (r.fingerprint_before === r.fingerprint_after) return <span className="ok">✓ untouched</span>;
  if (r.manual_edits_during_run > 0)
    return <span className="small" title="Vikram edited his own columns while the run was in progress">changed by {r.manual_edits_during_run} edit{r.manual_edits_during_run > 1 ? "s" : ""} from Vikram</span>;
  return <span className="bad">✗ changed</span>;
}

export default async function RunsPage() {
  const { runs, current } = await getSnapshot();
  const next = nextScheduled();
  const { data: errs } = current
    ? await db()
        .from("vc_assessments")
        .select("error, state, vc_investors(firm)")
        .eq("run_id", current.id)
        .not("error", "is", null)
        .limit(50)
    : { data: [] };
  const errors = (errs ?? []) as unknown as { error: string; state: string; vc_investors: { firm: string } | null }[];

  return (
    <div className="wrap">
      <header className="page-head">
        <div>
          <div className="eyebrow">System</div>
          <h1>Runs &amp; audit</h1>
          <p>
            Every refresh: when it ran, what it found, how many Gemini calls it used, and proof that Vikram&apos;s own
            columns were not touched.
          </p>
        </div>
      </header>

      <div className="stats">
        <div className="stat"><StatIcon name="check" /><div className="l">Latest run status</div><div className="n" style={{ fontSize: 22, textTransform: "capitalize" }}>{current ? current.status : "—"}</div></div>
        <div className="stat"><StatIcon name="clock" /><div className="l">Next auto-run (Mon &amp; Thu)</div><div className="n" style={{ fontSize: 20 }}>{next ? fmtIST(next) : "—"}</div></div>
        <div className="stat"><StatIcon name="bolt" /><div className="l">Gemini Flash calls, latest run</div><div className="n">{current?.gemini_calls ?? 0}</div></div>
        <div className="stat"><StatIcon name="alert" /><div className="l">Failed investors (left unchanged)</div><div className="n">{current?.error_count ?? 0}</div></div>
      </div>

      <section className="section grid2">
        <div className="panel pad">
          <h2 style={{ marginBottom: 8 }}>The &quot;don&apos;t overwrite my notes&quot; guarantee</h2>
          <p className="small muted" style={{ marginBottom: 12 }}>
            Three layers: (1) the pipeline only calls a database function that updates exactly four signal columns;
            (2) a Postgres trigger rejects any pipeline write to status, last contact or notes; (3) every run fingerprints
            all manual columns before and after and records whether they match.
          </p>
          <GuardTest />
        </div>
        <div className="panel pad">
          <h2 style={{ marginBottom: 8 }}>Column ownership</h2>
          <dl className="kv small">
            <dt><span className="chip lock">🔒 Vikram</span></dt><dd>status, last_contact_date, notes (plus name, firm, thesis)</dd>
            <dt><span className="chip accent">⟳ Pipeline</span></dt><dd>last_signal_date, signal_summary, follow_up_score, recommended_action</dd>
            <dt>Failure rule</dt><dd>If every source fails for an investor, their row is left as it was. A failed check is never reported as &quot;quiet&quot;.</dd>
          </dl>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Run history</h2><span className="muted small">Latest 20 runs</span></div>
        <div className="panel table-wrap">
          <table className="grid" style={{ minWidth: 900 }}>
            <thead>
              <tr><th>Started</th><th>Trigger</th><th>Status</th><th>Scanned</th><th>Active</th><th>Quiet</th><th>Errors</th><th>Gemini calls</th><th>Duration</th><th>Manual columns</th></tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="small">{fmtIST(r.started_at)}</td>
                  <td><span className="chip">{r.trigger}</span></td>
                  <td><span className={`chip ${r.status === "succeeded" ? "hot" : r.status === "running" ? "accent" : r.status === "failed" ? "hold" : "warm"}`}>{r.status}</span></td>
                  <td className="mono">{r.processed}/{r.total}</td>
                  <td className="mono">{r.active_count}</td>
                  <td className="mono">{r.quiet_count}</td>
                  <td className="mono">{r.error_count}</td>
                  <td className="mono">{r.gemini_calls}</td>
                  <td className="mono small">{duration(r)}</td>
                  <td className="small"><Integrity r={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!runs.length && <div className="empty">No runs yet.</div>}
        </div>
      </section>

      {errors.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Issues in the latest run</h2></div>
          <div className="panel pad">
            {errors.map((e, i) => (
              <div key={i} className="rej"><b>{e.vc_investors?.firm}</b> ({e.state}): {e.error}</div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
