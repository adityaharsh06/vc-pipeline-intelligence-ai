import Link from "next/link";
import { WEIGHTS, TYPE_POINTS, EVIDENCE_POINTS, THRESHOLDS } from "@/lib/scoring";
import { GEMINI_MODELS } from "@/lib/gemini";
import { SIGNAL_TYPE_LABEL, type SignalType } from "@/lib/types";

const STEPS: [string, string, string][] = [
  ["Trigger", "Vikram clicks Refresh now, or Vercel Cron starts a run every Monday and Thursday at 09:30 IST.", "Vikram · Scheduler"],
  ["Input", "The app loads the 50 investors from Supabase: name, firm, thesis, status and last contact.", "Database → System"],
  ["Context", "For each investor it searches Google News and Bing News (firm + partner, last 30 days) and gets dated headlines with links.", "System ↔ Live Data"],
  ["Processing", "Old and duplicate articles are dropped and investors are grouped 8 at a time. Only public news is sent to the AI, never Vikram's notes.", "System"],
  ["AI", "Gemini Flash (via OpenRouter) decides whether each article is really about the investor, what kind of signal it is and how relevant it is to logistics, and drafts the why-now note and emails.", "AI Model"],
  ["Output", "A fixed rubric turns that into a 0–100 score and an action. Only the 4 signal columns are saved (a database trigger blocks notes and contact history), and the dashboard shows Vikram who to contact and why.", "System → Database → Vikram"],
];

const REQUIREMENTS: [string, string, string, string][] = [
  ["Use live external data", "Google News + Bing News RSS queried live on every run; every signal links to its source article.", "/", "Priority queue"],
  ["All AI tasks use Gemini Flash", `Every AI step (classification, relevance reasons, why-now notes, emails and LinkedIn notes) uses Gemini Flash: ${GEMINI_MODELS.join(", ")}. No other model is used.`, "/runs", "Gemini calls per run"],
  ["Who is worth reaching out to right now, and why", "Ranked top 5 with the signal, date, source, why-now note and score breakdown.", "/", "Priority queue"],
  ["Signal must be observable and from the past 30 days", "Dates come from the publisher feed or page metadata; anything older, undated or not naming the investor is rejected.", "/pipeline", "Investor pages → rejected evidence"],
  ["Something they wrote, said, invested in, or appeared at", "Signals are typed: investment, fund/thesis, blog post, interview/podcast, event.", "/", "Signal chips"],
  ["Tell him who has been quiet", "Dedicated quiet page; failures are never counted as quiet.", "/quiet", "Quiet VCs"],
  ["Twice a week, before he starts", "Vercel Cron, Monday and Thursday 09:30 IST.", "/runs", "Next scheduled run"],
  ["Supabase reflects current state after every run", "Each run rewrites the four signal columns for every investor it checked.", "/pipeline", "All investors"],
  ["Never overwrite manual notes / contact history", "Single 4-column write function + Postgres trigger + before/after fingerprint on every run.", "/runs", "Guard test + fingerprints"],
  ["Deploy on Vercel, public URL", "Public, no login. Writes are server-side; the refresh button has a cooldown.", "/", "This site"],
];

export default function Architecture() {
  return (
    <div className="wrap">
      <header className="page-head">
        <div>
          <div className="eyebrow">Submission · Components Map</div>
          <h1>Components map</h1>
          <p>Who does what, and when: from the twice-weekly trigger, through live news and Gemini Flash, to Vikram&apos;s Supabase table and dashboard.</p>
        </div>
      </header>

      <section className="panel pad map-panel">
        <a href="/components-map/components-map.png" target="_blank" rel="noreferrer" className="map-img" title="Open full size">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/components-map/components-map.png" alt="Components map: actors (Vikram, Scheduler, System, Live Data, AI Model, Database) across stages Trigger, Input, Context, Processing, AI and Output" />
        </a>
        <div className="toolbar small muted" style={{ marginTop: 12, marginBottom: 0 }}>
          <span>Rows are <b>who</b> does something, columns are <b>when</b> it happens; follow the dashed arrows left to right.</span>
          <span style={{ flex: 1 }} />
          <a className="btn" href="/components-map/components-map.png" target="_blank" rel="noreferrer">Open full size ↗</a>
          <a className="btn" href="/components-map/components-map.pdf" download>⬇ PDF</a>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>How to read the map</h2><span className="muted small">One run, column by column</span></div>
        <div className="steps">
          {STEPS.map(([stage, text, who], i) => (
            <div key={stage} className="panel step">
              <div className="step-n">{i + 1}</div>
              <div>
                <div className="step-title">{stage} <span className="chip accent">{who}</span></div>
                <p className="small muted" style={{ marginTop: 4 }}>{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="scoring">
        <div className="section-head"><h2>Scoring method</h2><span className="muted small">A ranking policy, not a probability of investment</span></div>
        <div className="grid2">
          <div className="panel pad small">
            <dl className="kv">
              <dt>Relevance · {WEIGHTS.relevance}</dt><dd>Gemini&apos;s 0–100 relevance to B2B logistics / supply-chain SaaS × 0.35.</dd>
              <dt>Recency · {WEIGHTS.recency}</dt><dd>{WEIGHTS.recency} × (1 − days old ÷ 40). Same-day signal = 30, 30 days old = 8.</dd>
              <dt>Signal type · {WEIGHTS.signal_type}</dt><dd>{(Object.keys(TYPE_POINTS) as SignalType[]).map((k) => `${SIGNAL_TYPE_LABEL[k]} ${TYPE_POINTS[k]}`).join(" · ")}</dd>
              <dt>Evidence · {WEIGHTS.evidence}</dt><dd>Publisher-dated news or verified page {EVIDENCE_POINTS.dated_press} · search result {EVIDENCE_POINTS.search_result} · unconfirmed {EVIDENCE_POINTS.model_only}</dd>
              <dt>Relationship · {WEIGHTS.relationship}</dt><dd>Yet to reach out 10 · waiting 14+ days 9 · waiting 7–13 days 5 · contacted under 7 days ago 1 · in conversation 7 · passed 2</dd>
            </dl>
          </div>
          <div className="panel pad small">
            <dl className="kv">
              <dt><span className="chip hot">≥ {THRESHOLDS.reachOut}</span></dt><dd>Reach out this week, if relevance ≥ {THRESHOLDS.reachOutRelevance} (follow up instead if waiting on a reply)</dd>
              <dt><span className="chip warm">≥ {THRESHOLDS.tailored}</span></dt><dd>Reach out with a tailored note, if relevance ≥ {THRESHOLDS.tailoredRelevance}</dd>
              <dt><span className="chip">Otherwise</span></dt><dd>Low priority: monitor, or &quot;active but not in your space&quot; when relevance is under {THRESHOLDS.tailoredRelevance}</dd>
              <dt><span className="chip hold">Overrides</span></dt><dd>Contacted under 7 days ago → wait. Passed → do not pursue. No signal → hold.</dd>
            </dl>
            <p className="muted" style={{ marginTop: 12 }}>
              Gemini never sets the score. It only answers factual questions about each piece of evidence, so the same
              evidence always produces the same score, and every point can be traced on the card.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Requirement → implementation</h2><span className="muted small">Problem Statement 10, line by line</span></div>
        <div className="panel table-wrap">
          <table className="grid req" style={{ minWidth: 760 }}>
            <thead><tr><th>Requirement</th><th>How it is met</th><th>Check it</th></tr></thead>
            <tbody>
              {REQUIREMENTS.map(([req, how, href, where]) => (
                <tr key={req}><td><b>{req}</b></td><td className="small">{how}</td><td className="small"><Link href={href}>{where} →</Link></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
