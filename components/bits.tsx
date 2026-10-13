import Link from "next/link";
import type { Assessment, Breakdown, Investor, Signal } from "@/lib/types";
import { SIGNAL_TYPE_LABEL, STATUS_LABEL } from "@/lib/types";
import { actionTone, WEIGHTS } from "@/lib/scoring";
import { daysAgo } from "@/lib/data";
import CopyButton from "./CopyButton";

export function ScoreBox({ score, action }: { score: number | null; action: string | null }) {
  const tone = actionTone(action);
  return (
    <div className={`score ${tone}`}>
      {score ?? "–"}
      <small>{tone === "hot" ? "act" : tone === "warm" ? "warm" : tone === "hold" ? "hold" : "low"}</small>
    </div>
  );
}

export function ActionChip({ action }: { action: string | null }) {
  if (!action) return null;
  return <span className={`chip ${actionTone(action)}`}><span className="dot" />{action}</span>;
}

export function StatusChip({ status }: { status: Investor["status"] }) {
  return <span className="chip lock" title="Vikram's manual column">{STATUS_LABEL[status]}</span>;
}

const EVIDENCE_LABEL: Record<Signal["evidence"], string> = {
  dated_press: "Publisher-dated news",
  verified_page: "Source page verified",
  search_result: "Search result",
  model_only: "Unconfirmed source",
};

export function SignalMeta({ s }: { s: Signal }) {
  return (
    <div className="meta">
      <span className="chip accent">{SIGNAL_TYPE_LABEL[s.type]}</span>
      <span>{daysAgo(s.date)} <span className="faint mono">({s.date})</span></span>
      <span className="sep">|</span>
      <a href={s.url} target="_blank" rel="noreferrer">{s.source} ↗</a>
      <span className="sep">|</span>
      <span title={`Date from ${s.date_basis.replace("_", " ")}`}>{EVIDENCE_LABEL[s.evidence]}</span>
      {(s.coverage ?? 1) > 1 && <><span className="sep">|</span><span>Covered by {s.coverage} outlets</span></>}
      <span className="sep">|</span>
      <span>Logistics relevance <b className="mono">{s.relevance}</b></span>
    </div>
  );
}

export function BreakdownBars({ b, total }: { b: Breakdown; total: number | null }) {
  const rows: [keyof Breakdown, string][] = [
    ["recency", "Recency"],
    ["relevance", "Relevance"],
    ["signal_type", "Signal type"],
    ["evidence", "Evidence"],
    ["relationship", "Relationship"],
  ];
  return (
    <details className="bd">
      <summary>Why this score ({total}) →</summary>
      <div className="bars">
        {rows.map(([k, label]) => (
          <div key={k} style={{ display: "contents" }}>
            <span className="muted">{label}</span>
            <span className="bar"><i style={{ width: `${(b[k] / WEIGHTS[k]) * 100}%` }} /></span>
            <span className="mono small">{b[k]}/{WEIGHTS[k]}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

export function mailto(inv: Investor, a: Assessment) {
  const subject = `Seed round: B2B logistics SaaS - ${inv.firm}`;
  const body = `Hi ${inv.name.split(" ")[0]},\n\n${a.opening_line ?? ""}\n\n[2-3 lines on traction]\n\nWould you be open to a 20-minute call next week?\n\nBest,\nVikram`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function SignalCard({ inv, a, rank }: { inv: Investor; a: Assessment; rank?: number }) {
  const s = a.best_signal!;
  return (
    <article className="panel card">
      <ScoreBox score={a.score} action={a.action} />
      <div style={{ minWidth: 0 }}>
        <div className="card-top">
          {rank !== undefined && <span className="rank">#{rank}</span>}
          <h3><Link href={`/investor/${inv.id}`}>{inv.firm}</Link></h3>
          <span className="muted small">{inv.name} · {inv.kind}</span>
          <StatusChip status={inv.status} />
          {a.prev_score !== null && a.score !== null && a.score !== a.prev_score && (
            <span className={`delta ${a.score > a.prev_score ? "up" : "down"}`}>
              {a.score > a.prev_score ? "▲" : "▼"} {Math.abs(a.score - a.prev_score)}
            </span>
          )}
        </div>
        <p className="sig-title">{s.title}</p>
        <SignalMeta s={s} />
        {a.why && <p className="why">{a.why}</p>}
        <div style={{ marginTop: 10 }}><ActionChip action={a.action} /></div>
        {a.opening_line && (
          <div className="opener">
            <div>
              <span className="lbl">Suggested opening line · drafted by Gemini from this signal</span>
              {a.opening_line}
            </div>
            <CopyButton text={a.opening_line} />
          </div>
        )}
        <div className="card-actions">
          {actionTone(a.action) === "hot" ? (
            <Link className="btn primary" href={`/outreach#${inv.id}`}>✉ Draft full email</Link>
          ) : actionTone(a.action) === "warm" ? (
            <Link className="btn primary" href={`/warmup#${inv.id}`}>✍ Warm-up kit</Link>
          ) : (
            a.opening_line && <a className="btn" href={mailto(inv, a)}>Draft email ↗</a>
          )}
          <a className="btn ghost" href={s.url} target="_blank" rel="noreferrer">Open evidence ↗</a>
          {a.signals.length > 1 && <Link className="btn ghost" href={`/investor/${inv.id}`}>+{a.signals.length - 1} more signal{a.signals.length > 2 ? "s" : ""}</Link>}
        </div>
        {a.breakdown && <BreakdownBars b={a.breakdown} total={a.score} />}
      </div>
    </article>
  );
}
