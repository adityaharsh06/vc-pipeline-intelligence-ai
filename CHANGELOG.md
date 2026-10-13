# Changelog

All times IST. Exact timestamps for every change are also in the GitHub commit history, Vercel's
Deployments tab, and the Supabase migration list; data refreshes are logged on the app's Runs & audit page.

## 13 Oct 2026
- **12:46** Warm-up kit (`/warmup`): LinkedIn connection note and warm-intro request for "worth a tailored note" VCs.
  Manage pipeline: add an investor (scanned immediately), remove app-added investors, follow-up calendar (.ics).
  GSAP animations across the dashboard.
- **12:28** Outreach emails (`/outreach`): Gemini-drafted email per "reach out this week" VC, with tone switch,
  Open in Gmail, and Mark as contacted.
- **11:48–11:49** Refresh cooldown counts from when the last run finished; chart label headroom.
- **11:34** All Gemini Flash calls routed through OpenRouter with Google-only provider routing.
- **11:19** Colourful dashboard theme with signal-type bar chart and pipeline donut.
- Stall detection made race-safe (a finished run can no longer be re-marked as stalled).

## 12 Oct 2026
- **19:23–19:28** Components Map (detailed PDF, and swimlane format for submission).
- **15:05–15:12** Runs stay inside Vercel's 300 s limit and resume if stalled; on-thesis relevance required
  before recommending outreach; README with live links.
- **14:54** Functions pinned to Mumbai (bom1), next to the database.
- **14:48** First release: live signals from Google News + Bing News, Gemini Flash classification, fixed scoring
  rubric, Supabase table with a database guard protecting Vikram's notes and contact history, Vercel Cron
  (Mon & Thu 09:30 IST).
