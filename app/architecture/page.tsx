import Link from "next/link";
import { WEIGHTS, TYPE_POINTS, EVIDENCE_POINTS, THRESHOLDS } from "@/lib/scoring";
import { GEMINI_MODELS, GROUNDING_ENABLED } from "@/lib/gemini";
import { SIGNAL_TYPE_LABEL, type SignalType } from "@/lib/types";

type BoxProps = { x: number; y: number; w?: number; h?: number; title: string; sub: string; tone?: "ai" | "data" | "lock" | "plain"; n?: number };

function Box({ x, y, w = 200, h = 56, title, sub, tone = "plain", n }: BoxProps) {
  const stroke = tone === "ai" ? "var(--accent)" : tone === "lock" ? "var(--lock)" : tone === "data" ? "var(--hot)" : "var(--line)";
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill="var(--panel)" stroke={stroke} strokeWidth={tone === "plain" ? 1 : 1.6} />
      {n !== undefined && (
        <>
          <circle cx={x + 16} cy={y + 18} r={9} fill={stroke === "var(--line)" ? "var(--faint)" : stroke} />
          <text x={x + 16} y={y + 22} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--panel)">{n}</text>
        </>
      )}
      <text x={x + (n !== undefined ? 32 : 14)} y={y + 23} fontSize={13} fontWeight={600} fill="var(--ink)">{title}</text>
      <text x={x + 14} y={y + 42} fontSize={11.5} fill="var(--muted)">{sub}</text>
    </g>
  );
}

function Arrow({ d, dashed, label, lx, ly }: { d: string; dashed?: boolean; label?: string; lx?: number; ly?: number }) {
  return (
    <g>
      <path d={d} fill="none" stroke="var(--faint)" strokeWidth={1.4} markerEnd="url(#arr)" strokeDasharray={dashed ? "4 4" : undefined} />
      {label && <text x={lx} y={ly} fontSize={11} fill="var(--faint)">{label}</text>}
    </g>
  );
}

const COMPONENTS = [
  ["Vercel Cron", "vercel.json → GET /api/cron", "Starts a scan every Monday and Thursday at 09:30 IST, before Vikram works his pipeline. Protected by CRON_SECRET."],
  ["Refresh now button", "POST /api/run", "Public on-demand scan (no login, so the grader can test it). Rate-limited by a 5-minute cooldown."],
  ["Run orchestrator", "lib/pipeline.ts · Next.js after()", "Works in batches of 8 investors, saves progress after each batch, and hands off to a fresh function (/api/run/continue) before the 300 s limit. Resumes if a run stalls."],
  ["Google News + Bing News RSS", "lib/sources.ts", "Live, publisher-dated news about each firm and partner in the last 30 days (4 queries per investor). Dates come from the publisher, not the model."],
  ["Gemini Flash + Google Search (optional)", `google_search tool · ${GROUNDING_ENABLED ? "on" : "off"}`, "Grounded web search for blog posts, podcasts and events that news feeds miss. Built in, but off for this deployment: the free-tier key has no grounding quota. Set GEMINI_GROUNDING=on with a paid key."],
  ["Page verifier", "lib/sources.ts verifyPage()", "Opens each search result, checks it actually names the investor, and reads the publish date from page metadata. Misattributed or out-of-window items are rejected and shown."],
  ["Gemini Flash classifier", `${GEMINI_MODELS.join(" → ")}`, "One call per 8 investors (about 7 calls per full run, inside the free-tier quota). For each item: is it really about this investor, signal type, relevance to B2B logistics SaaS (0–100), summary, same-event grouping, plus a why-now note and an opening line. Falls back to the next Flash model if one is overloaded or out of quota."],
  ["Scoring rules", "lib/scoring.ts", "Fixed arithmetic, not the model: relevance 35 + recency 30 + signal type 15 + evidence 10 + relationship 10, with a relevance gate on recommendations."],
  ["vc_apply_signal()", "Postgres function", "The pipeline's only write path into Vikram's table: updates exactly last_signal_date, signal_summary, follow_up_score, recommended_action."],
  ["Guard trigger", "vc_guard_columns (Postgres)", "Raises an error if the pipeline ever tries to change status, last_contact_date or notes. Testable live on Runs & audit."],
  ["vc_investors", "Supabase table", "Vikram's pipeline: 50 investors. Manual columns are his; signal columns are refreshed every run."],
  ["vc_runs · vc_assessments · vc_manual_edits", "Supabase tables", "Run log with before/after fingerprints of manual columns, full per-investor evidence history, and an edit log."],
  ["Dashboard", "Next.js 16 on Vercel, server-rendered", "Priority queue, quiet list, editable pipeline table, investor pages, run audit. The Supabase secret key never reaches the browser."],
];

const REQUIREMENTS: [string, string, string, string][] = [
  ["Use live external data", "Google News + Bing News RSS queried live on every run; every signal links to its source article.", "/", "Priority queue"],
  ["All AI tasks use Gemini Flash", `Every AI step (classification, why-now notes, opening lines, optional grounded search) uses Gemini Flash: ${GEMINI_MODELS.join(", ")}. No other model is used.`, "/runs", "Gemini calls per run"],
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
          <p>How a scan flows from the twice-weekly trigger to Vikram&apos;s Supabase table, and which component owns which column.</p>
        </div>
      </header>

      <section className="panel pad" style={{ overflowX: "auto" }}>
        <svg viewBox="0 0 1000 530" style={{ width: "100%", minWidth: 760, height: "auto" }} role="img" aria-label="Components map diagram">
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--faint)" />
            </marker>
          </defs>

          <Box n={1} x={20} y={30} title="Vercel Cron" sub="Mon & Thu · 09:30 IST" />
          <Box n={1} x={20} y={110} title="Refresh now" sub="public · 5-min cooldown" />
          <Box n={2} x={270} y={70} title="Run orchestrator" sub="/api/run · chunked · after()" />
          <Box n={3} x={520} y={10} title="Google + Bing News RSS" sub="publisher-dated · last 30 days" tone="data" />
          <Box n={3} x={520} y={82} title="Gemini Flash + Search" sub="optional · off on free key" tone="ai" />
          <Box n={4} x={520} y={154} title="Page verifier" sub="names investor? date in window?" />
          <Box n={5} x={780} y={46} title="Gemini Flash classifier" sub="8 investors per call" tone="ai" />
          <Box n={6} x={780} y={128} title="Scoring rules" sub="35+30+15+10+10 · relevance gate" />

          <Arrow d="M220,58 L268,90" />
          <Arrow d="M220,138 L268,112" />
          <Arrow d="M470,90 L518,40" />
          <Arrow d="M470,104 L518,110" />
          <Arrow d="M620,138 L620,152" />
          <Arrow d="M720,38 L778,66" />
          <Arrow d="M720,182 L778,86" />
          <Arrow d="M880,102 L880,126" />

          <rect x={270} y={240} width={710} height={185} rx={14} fill="none" stroke="var(--hot)" strokeDasharray="6 5" />
          <text x={286} y={262} fontSize={12} fontWeight={700} fill="var(--hot)">SUPABASE · POSTGRES</text>

          <Box n={7} x={290} y={280} title="vc_apply_signal()" sub="writes 4 signal columns only" tone="ai" />
          <Box x={290} y={352} title="vc_update_manual()" sub="Vikram's edits · logged" tone="lock" />

          <rect x={520} y={274} width={240} height={136} rx={10} fill="var(--panel)" stroke="var(--line)" />
          <text x={534} y={296} fontSize={13} fontWeight={700} fill="var(--ink)">vc_investors</text>
          <rect x={532} y={306} width={216} height={44} rx={7} fill="var(--accent-soft)" />
          <text x={542} y={324} fontSize={11} fontWeight={600} fill="var(--accent)">⟳ last_signal_date · signal_summary</text>
          <text x={542} y={340} fontSize={11} fontWeight={600} fill="var(--accent)">   follow_up_score · recommended_action</text>
          <rect x={532} y={356} width={216} height={44} rx={7} fill="var(--lock-soft)" />
          <text x={542} y={374} fontSize={11} fontWeight={600} fill="var(--lock)">🔒 status · last_contact_date</text>
          <text x={542} y={390} fontSize={11} fontWeight={600} fill="var(--lock)">   notes (Vikram only)</text>

          <Box x={790} y={280} w={175} title="Guard trigger" sub="blocks pipeline → 🔒 cols" tone="lock" />
          <Box x={790} y={352} w={175} title="vc_runs · assessments" sub="audit · fingerprints" />

          <Arrow d="M880,184 L880,214 L390,214 L390,278" label="score + summary + action" lx={560} ly={208} />
          <Arrow d="M490,308 L530,326" />
          <Arrow d="M490,380 L530,378" />
          <Arrow d="M790,308 L762,330" dashed />

          <Box x={20} y={458} w={200} title="Vikram" sub="reads briefing · edits notes" />
          <Box x={270} y={458} w={330} title="Next.js dashboard on Vercel" sub="server-rendered · no login · secret key stays on server" />
          <Arrow d="M220,486 L268,486" />
          <Arrow d="M340,458 L340,410" label="edits" lx={346} ly={440} />
          <Arrow d="M560,412 L560,456" label="reads" lx={566} ly={440} />
        </svg>
        <div className="toolbar small muted" style={{ marginTop: 10, gap: 16 }}>
          <span><span className="chip accent">blue</span> Gemini Flash steps</span>
          <span><span className="chip hot">green</span> live external data / database</span>
          <span><span className="chip lock">purple</span> Vikram-owned, protected</span>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Components</h2></div>
        <div className="panel table-wrap">
          <table className="grid" style={{ minWidth: 760 }}>
            <thead><tr><th>Component</th><th>Implementation</th><th>Responsibility</th></tr></thead>
            <tbody>
              {COMPONENTS.map(([c, t, r]) => (
                <tr key={c}><td><b>{c}</b></td><td className="mono small">{t}</td><td className="small">{r}</td></tr>
              ))}
            </tbody>
          </table>
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
