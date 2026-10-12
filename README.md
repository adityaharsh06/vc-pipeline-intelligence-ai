# VC Signal Desk: VC fundraising pipeline intelligence

**AI and its Applications, Section 1 Final, Problem Statement 10 (High difficulty)**

Twice a week, before Vikram works his Seed-round pipeline, this system checks all 50 VCs on his list for
**observable signals from the last 30 days**: a new investment, a portfolio milestone, a fund or thesis
announcement, a blog post, an interview, or an event appearance. It ranks who is worth contacting this week and why,
lists who has gone quiet, and updates his Supabase table, **without ever touching his own notes or contact history**.

- **Live app:** https://vc-pipeline-intelligence-ai.vercel.app
- **Repository:** https://github.com/adityaharsh06/vc-pipeline-intelligence-ai
- **No login.** Open the URL and everything is usable, including **Refresh now**.
- **Components Map:** `/architecture` in the app (diagram, component table, scoring method, requirement checklist).

## What to try (5 minutes)

1. **Priority queue (`/`)**: the top 5 to contact this week. Each card shows the signal, its date, the source link,
   how many outlets covered it, a why-now note, a Gemini-drafted opening line (Copy / Draft email), and a
   "Why this score" breakdown.
2. **Quiet VCs (`/quiet`)**: investors with no verifiable activity in 30 days, so Vikram knows where not to spend energy.
3. **All investors (`/pipeline`)**: the live Supabase table. Purple columns are Vikram's; blue columns are
   pipeline-owned. **Edit a note → press Refresh now → the note survives.**
4. **Runs & audit (`/runs`)**: run history, Gemini calls per run, and a **"Try to overwrite a note as the
   pipeline"** button that shows the database refusing the write.
5. **Any investor page**: every signal found, plus the **evidence that was rejected and why** (wrong person with the same
   name, outside the 30-day window, roundup that only mentions the firm in passing).

## How it works

```
Vercel Cron (Mon & Thu 09:30 IST, resume check 10:00) ─┐
"Refresh now" (public, 5-min cooldown)┴─► Run orchestrator (batches of 8, chunked across invocations)
        │
        ├─► Google News RSS + Bing News RSS   (live, publisher-dated, 4 queries per investor)
        ├─► [optional] Gemini Flash + Google Search grounding (GEMINI_GROUNDING=on, needs paid quota)
        ├─► Gemini Flash classifier, one call per 8 investors:
        │     about this investor? · signal type · relevance to B2B logistics SaaS · same-event grouping
        │     · why-now note · opening line
        ├─► Fixed scoring rules (relevance 35 + recency 30 + type 15 + evidence 10 + relationship 10)
        └─► Supabase
              vc_apply_signal()  → writes ONLY last_signal_date, signal_summary, follow_up_score, recommended_action
              guard trigger      → rejects any pipeline write to status / last_contact_date / notes
              vc_runs            → before/after fingerprint of all manual columns, per run
              vc_assessments     → full evidence + rejected items per investor per run
```

### The "don't overwrite my notes" guarantee (three layers)
1. The pipeline's only write path is the Postgres function `vc_apply_signal`, which updates exactly four columns.
2. The trigger `vc_guard_columns` raises an error if a pipeline transaction changes `status`,
   `last_contact_date` or `notes` (plus name, firm and thesis). Vikram's edits go through `vc_update_manual`, which
   cannot touch signal columns and writes an edit log.
3. Every run stores an MD5 fingerprint of all manual columns before and after, shown on `/runs` as ✓ untouched.

### Scoring (`lib/scoring.ts`)
Gemini **never sets the score**. It only answers factual questions about each piece of evidence. The score is fixed
arithmetic, so the same evidence always gives the same score:

| Part | Points |
|---|---|
| Relevance to B2B logistics / supply-chain SaaS (Gemini 0–100 × 0.35) | 35 |
| Recency: 30 × (1 − days ÷ 40) | 30 |
| Signal type: new investment 15 · fund/thesis 12 · post/interview 11 · event 10 · portfolio milestone 8 | 15 |
| Evidence: publisher-dated or verified page 10 · search result 6 · unconfirmed 3 | 10 |
| Relationship: yet to reach out 10 · waiting 14+ days 9 · in conversation 7 · waiting 7–13 days 5 · passed 2 · contacted under 7 days ago 1 | 10 |

**Reach out (or follow up) this week** needs a score of 70+ **and** logistics relevance of 70+. **Tailored note** needs 55+ and relevance of 45+.
Overrides: contacted under 7 days ago → wait; passed → do not pursue; no signal → hold.

### Reliability choices
- **Failures are never reported as "quiet".** If every source fails for an investor, their row is left unchanged
  and the run is marked partial.
- **Free-tier aware.** Classification is batched (about 7 Gemini calls per 50-investor run), and calls rotate across
  Gemini Flash models (`GEMINI_MODELS`) if one is overloaded or out of daily quota.
- **No timeouts.** Runs are processed in chunks with Next.js `after()` and hand off to `/api/run/continue` before the
  300 s function limit. A stalled run is resumed rather than restarted.
- **Duplicate coverage is merged.** Seven articles about one deal become one signal marked "covered by 7 outlets".

## Tech
Next.js 16 (App Router, server-rendered) · Supabase Postgres · Gemini Flash REST API (`gemini-3.8-flash` →
`gemini-3.7-flash` → `gemini-flash-latest` → `gemini-3-flash-preview`) · Vercel + Vercel Cron.
All AI tasks use Gemini Flash; no other model or LLM provider is used.

## Run locally
```bash
npm install
cp .env.example .env.local   # fill in SUPABASE_URL, SUPABASE_SECRET_KEY, GEMINI_API_KEY, CRON_SECRET
npm run dev
```
Database schema: `supabase/schema.sql`. Test one investor without writing anything:
`node --env-file=.env.local --import tsx scripts/test-one.ts "Kae Capital"`.

## Security
- Public by design (no login), so the evaluator can test it. All database access is server-side with the secret key,
  which never reaches the browser. RLS is on with no public policies.
- The public refresh endpoint has a 5-minute cooldown. Cron and continuation endpoints require `CRON_SECRET`.
- Seed data is 50 real, publicly known investors. Notes and contact history are sample data for "Vikram".
