import { db } from "./supabase";
import { gemini, GeminiError, GEMINI_MODEL, GROUNDING_ENABLED } from "./gemini";
import { bingNews, domainOf, googleNews, isoDate, resolveRedirect, verifyPage } from "./sources";
import { daysBetween, recommendAction, scoreSignal, WINDOW_DAYS } from "./scoring";
import type { Breakdown, Investor, Rejected, Run, Signal, SignalType } from "./types";
import { SIGNAL_TYPE_LABEL } from "./types";

const BATCH = 8; // investors per Gemini classification call
const CHUNK_BUDGET_MS = 230_000; // stay well inside the 300s function limit
const STALL_MS = 6 * 60_000;
const MANUAL_COOLDOWN_MS = 5 * 60_000;

export const STARTUP_PROFILE =
  "Vikram's startup: a seed-stage B2B logistics SaaS (shipment visibility, carrier management and freight operations software for mid-size shippers), based in India, raising a Seed round.";

const SIGNAL_TYPES: SignalType[] = [
  "investment",
  "portfolio_milestone",
  "fund_or_thesis",
  "blog_post",
  "interview_or_podcast",
  "event",
  "other",
];

// searchOff: set once Google Search grounding hits a hard quota, so the rest of the run skips it.
type Counter = { calls: number; searchOff?: boolean };

function shortFirm(firm: string) {
  return firm.replace(/\s*\(.*?\)\s*/g, "").trim();
}

function firmNames(inv: Investor) {
  const firm = shortFirm(inv.firm);
  const names = [firm, inv.name];
  const alt = inv.firm.match(/\(formerly ([^)]+)\)/i)?.[1];
  if (alt) names.push(alt);
  return names;
}

// ---------- Step 1: gather candidate evidence from live sources ----------

type Candidate = {
  id: string;
  title: string;
  url: string;
  source: string;
  date: string | null;
  date_basis: Signal["date_basis"];
  evidence: Signal["evidence"];
  origin: Signal["origin"];
  hint?: string;
};

async function gatherCandidates(inv: Investor, now: Date, counter: Counter) {
  const since = isoDate(new Date(now.getTime() - WINDOW_DAYS * 86_400_000));
  const rejected: Rejected[] = [];
  const names = firmNames(inv);

  const firmQ = `"${shortFirm(inv.firm)}"`;
  const personQ = `"${inv.name}" (venture OR investor OR startup OR fund OR founders)`;
  const tag = (origin: Signal["origin"]) => (items: Awaited<ReturnType<typeof googleNews>>) => items.map((i) => ({ ...i, origin }));
  const newsP = Promise.allSettled([
    googleNews(firmQ, WINDOW_DAYS).then(tag("google_news")),
    googleNews(personQ, WINDOW_DAYS).then(tag("google_news")),
    bingNews(firmQ).then(tag("bing_news")),
    bingNews(personQ).then(tag("bing_news")),
  ]);

  const searchPrompt = `Today is ${isoDate(now)}. Research public activity in the last ${WINDOW_DAYS} days (published on or after ${since}) by the investor ${inv.name} or their firm ${inv.firm}${inv.website ? ` (${inv.website})` : ""}.
Look for: new portfolio investments they made or led, blog posts or essays they published, interviews, podcasts or quotes in the press, events or conferences where they spoke or appeared, and new fund or thesis announcements.
Rules:
- Only include items you actually found in search results, with a publication date on or after ${since}.
- Exclude items about different people or firms with similar names, and items that only mention them in passing.
- Use the original article URL when you can.
Return JSON: {"findings":[{"title":string,"url":string,"date":"YYYY-MM-DD","type":one of ${JSON.stringify(SIGNAL_TYPES)},"about":string}]}. Return {"findings":[]} if nothing qualifies.`;

  const searchP = !GROUNDING_ENABLED
    ? Promise.reject(new Error("Grounded search disabled"))
    : counter.searchOff
    ? Promise.reject(new GeminiError("Grounded search skipped: quota exhausted earlier in this run", 429))
    : gemini<{ findings?: { title: string; url: string; date: string; type: string; about: string }[] }>(
    searchPrompt,
    {
      search: true,
      onCall: () => counter.calls++,
      schema: {
        type: "object",
        properties: {
          findings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                url: { type: "string" },
                date: { type: "string" },
                type: { type: "string", enum: SIGNAL_TYPES },
                about: { type: "string" },
              },
              required: ["title", "url", "date", "type", "about"],
            },
          },
        },
        required: ["findings"],
      },
    },
  ).catch((e) => {
    if (e instanceof GeminiError && e.status === 429) counter.searchOff = true;
    throw e;
  });

  const [newsRes, searchRes] = await Promise.allSettled([newsP, searchP]);
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  let newsOk = false;
  let searchOk = false;

  if (newsRes.status === "fulfilled") {
    for (const r of newsRes.value) {
      if (r.status !== "fulfilled") continue;
      newsOk = true;
      for (const item of r.value.slice(0, 5)) {
        if (candidates.length >= 14) break;
        const key = item.title.toLowerCase().slice(0, 60);
        if (seen.has(key)) continue;
        seen.add(key);
        if (item.date < since) {
          rejected.push({ title: item.title, url: item.url, reason: `Published ${item.date}, outside the 30-day window` });
          continue;
        }
        candidates.push({
          id: `n${candidates.length}`,
          title: item.title,
          url: item.url,
          source: item.source,
          date: item.date,
          date_basis: "publisher_feed",
          evidence: "dated_press",
          origin: item.origin,
        });
      }
    }
  }

  let searchError: string | null = null;
  if (searchRes.status === "fulfilled") {
    searchOk = true;
    const { data, sources } = searchRes.value;
    const resolved = await Promise.all(sources.slice(0, 10).map((s) => resolveRedirect(s.uri)));
    const groundedDomains = new Set([
      ...resolved.map(domainOf),
      ...sources.map((s) => s.title.replace(/^www\./, "")),
    ]);
    const findings = (data.findings ?? []).slice(0, 6);
    const checked = await Promise.all(
      findings.map(async (f) => {
        let url = f.url?.startsWith("http") ? await resolveRedirect(f.url) : "";
        const grounded = url && groundedDomains.has(domainOf(url));
        if (!url && resolved[0]) url = resolved[0];
        const page = url ? await verifyPage(url, names) : { reachable: false, mentions: false, date: null };
        return { f, url, grounded, page };
      }),
    );
    for (const { f, url, grounded, page } of checked) {
      const key = f.title.toLowerCase().slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!url) {
        rejected.push({ title: f.title, reason: "No source link could be found" });
        continue;
      }
      if (page.reachable && !page.mentions) {
        rejected.push({ title: f.title, url, reason: `Source page does not mention ${names[0]} or ${inv.name}` });
        continue;
      }
      const date = page.date ?? (/^\d{4}-\d{2}-\d{2}$/.test(f.date) ? f.date : null);
      if (!date) {
        rejected.push({ title: f.title, url, reason: "No verifiable publication date" });
        continue;
      }
      if (date < since || date > isoDate(now)) {
        rejected.push({ title: f.title, url, reason: `Dated ${date}, outside the 30-day window` });
        continue;
      }
      candidates.push({
        id: `s${candidates.length}`,
        title: f.title,
        url,
        source: domainOf(url),
        date,
        date_basis: page.date ? "page_metadata" : "search_estimate",
        evidence: page.reachable && page.mentions ? "verified_page" : grounded ? "search_result" : "model_only",
        origin: "gemini_search",
        hint: f.about,
      });
    }
  } else {
    searchError = searchRes.reason instanceof Error ? searchRes.reason.message : String(searchRes.reason);
  }

  return { candidates, rejected, newsOk, searchOk, searchError };
}

// ---------- Step 2: Gemini classifies the evidence (several investors per call) ----------

type ClassifiedItem = { id: string; about_investor: boolean; reason: string; type: SignalType; relevance: number; summary: string; story: string };
type Classified = { key: string; items: ClassifiedItem[]; best_id: string; why_now: string; opening_line: string };
type Gathered = Awaited<ReturnType<typeof gatherCandidates>>;

const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    investors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                about_investor: { type: "boolean" },
                reason: { type: "string" },
                type: { type: "string", enum: SIGNAL_TYPES },
                relevance: { type: "integer" },
                summary: { type: "string" },
                story: { type: "string" },
              },
              required: ["id", "about_investor", "reason", "type", "relevance", "summary", "story"],
            },
          },
          best_id: { type: "string" },
          why_now: { type: "string" },
          opening_line: { type: "string" },
        },
        required: ["key", "items", "best_id", "why_now", "opening_line"],
      },
    },
  },
  required: ["investors"],
};

// One Gemini Flash call classifies the evidence for a whole batch of investors.
// This keeps a 50-investor run to ~7 calls, inside the free-tier daily quota.
async function classifyBatch(entries: { key: string; inv: Investor; candidates: Candidate[] }[], now: Date, counter: Counter) {
  const blocks = entries
    .map(({ key, inv, candidates }) => {
      const list = candidates
        .map((c) => `  - id=${c.id} | ${c.date} | ${c.source} | ${c.title}${c.hint ? ` | note: ${c.hint}` : ""}`)
        .join("\n");
      return `### key=${key} | ${inv.name}, ${inv.firm} (${inv.kind}) | thesis: ${inv.thesis}\n${list}`;
    })
    .join("\n\n");
  const prompt = `${STARTUP_PROFILE}
Today is ${isoDate(now)}. Below are investors from Vikram's pipeline, each with candidate public items published in the last ${WINDOW_DAYS} days.

${blocks}

Return one entry per investor key. For EACH candidate item decide:
- about_investor: true only if the item is about this investor's or firm's OWN activity (they invested, wrote, spoke, appeared, announced). False if it is about a different person/firm with a similar name, or only lists them in passing.
- type: one of ${JSON.stringify(SIGNAL_TYPES)}. "investment" = a NEW round they invested in or led. "portfolio_milestone" = news about an existing portfolio company (IPO, exit, later round they did not lead).
- relevance (0-100) to a seed-stage B2B logistics / supply-chain SaaS: 80-100 directly logistics, freight, fleet, warehousing or supply-chain software; 50-79 adjacent (B2B operations SaaS, mobility, commerce enablement, industrial); 20-49 general seed or B2B activity; 0-19 unrelated.
- summary: one plain sentence describing what happened.
- reason: a few words justifying about_investor.
- story: a short slug for the underlying event (e.g. "lumio-series-a"). Items reporting the same event MUST share the same story.
Per investor also give:
- best_id: the accepted item most worth mentioning in outreach (relevance first, then recency); "" if none accepted.
- why_now: 1-2 sentences telling Vikram why this is (or is not) a good moment to reach out.
- opening_line: one email opening sentence (max 40 words) from Vikram that references the best_id item specifically. No flattery, no hype words. "" if none accepted.`;

  const { data } = await gemini<{ investors: Classified[] }>(prompt, {
    onCall: () => counter.calls++,
    schema: CLASSIFY_SCHEMA,
  });
  return new Map((data.investors ?? []).map((c) => [c.key, c]));
}

// ---------- Step 3: turn evidence + classification into the four signal columns ----------

export type AssessmentResult = {
  state: "active" | "quiet" | "error";
  score: number | null;
  breakdown: Breakdown | null;
  best: Signal | null;
  signals: Signal[];
  rejected: Rejected[];
  why: string | null;
  opening_line: string | null;
  action: string;
  summary: string;
  error: string | null;
};

const EVIDENCE_RANK = { verified_page: 4, dated_press: 3, search_result: 2, model_only: 1 } as const;

function errorResult(rejected: Rejected[], error: string): AssessmentResult {
  return { state: "error", score: null, breakdown: null, best: null, signals: [], rejected, why: null, opening_line: null, action: "", summary: "", error };
}

function buildResult(inv: Investor, g: Gathered, c: Classified | undefined, now: Date, counter: Counter): AssessmentResult {
  const { candidates, newsOk, searchOk, searchError } = g;
  const rejected = [...g.rejected];
  if (!newsOk && !searchOk) return errorResult(rejected, `All sources failed. ${searchError ?? ""}`.trim());
  if (candidates.length && !c) return errorResult(rejected, "Gemini returned no classification for this investor");
  const searchNote = searchOk || counter.searchOff || !GROUNDING_ENABLED ? null : `Search failed, news only: ${searchError}`;

  let signals: Signal[] = [];
  let bestId: string | null = null;
  if (c) {
    const byId = new Map(candidates.map((x) => [x.id, x]));
    const stories = new Map<string, Signal>();
    for (const item of c.items ?? []) {
      const cand = byId.get(item.id);
      if (!cand) continue;
      if (!item.about_investor) {
        rejected.push({ title: cand.title, url: cand.url, reason: `Not about this investor: ${item.reason}` });
        continue;
      }
      const sig: Signal = {
        title: cand.title,
        url: cand.url,
        source: cand.source,
        date: cand.date!,
        date_basis: cand.date_basis,
        type: SIGNAL_TYPES.includes(item.type) ? item.type : "other",
        relevance: Math.max(0, Math.min(100, Math.round(item.relevance))),
        summary: item.summary,
        evidence: cand.evidence,
        origin: cand.origin,
        coverage: 1,
      };
      // Several outlets reporting one event = one signal, with a coverage count.
      const key = (item.story || cand.title).toLowerCase();
      const prev = stories.get(key);
      if (prev) {
        const better =
          EVIDENCE_RANK[sig.evidence] > EVIDENCE_RANK[prev.evidence] ||
          (EVIDENCE_RANK[sig.evidence] === EVIDENCE_RANK[prev.evidence] && sig.date < prev.date);
        const merged = better ? { ...sig, coverage: (prev.coverage ?? 1) + 1 } : { ...prev, coverage: (prev.coverage ?? 1) + 1 };
        stories.set(key, merged);
        if (item.id === c.best_id || bestId === prev.url) bestId = merged.url;
      } else {
        stories.set(key, sig);
        if (item.id === c.best_id) bestId = sig.url;
      }
    }
    signals = [...stories.values()];
  }

  if (!signals.length) {
    return {
      state: "quiet", score: null, breakdown: null, best: null, signals: [], rejected,
      why: "No verifiable activity from this investor in the last 30 days.",
      opening_line: null,
      action: recommendAction(inv, null, now),
      summary: `No observable signal in the last 30 days (checked ${isoDate(now)}).`,
      error: searchNote,
    };
  }

  const scored = signals
    .map((s) => ({ s, ...scoreSignal(s, inv, now) }))
    .sort((a, b) => b.score - a.score || b.s.date.localeCompare(a.s.date));
  const top = scored[0];
  let opening = c?.opening_line || null;
  // The opening line is only kept if Gemini wrote it about the same signal we ranked first.
  if (bestId !== top.s.url || !opening) {
    opening = `I came across the news that ${top.s.summary.charAt(0).toLowerCase()}${top.s.summary.slice(1).replace(/\.$/, "")}, and as a founder building B2B logistics SaaS raising our Seed round, I wanted to reach out.`;
  }
  const age = daysBetween(top.s.date, now);
  return {
    state: "active",
    score: top.score,
    breakdown: top.breakdown,
    best: top.s,
    signals: scored.map((x) => x.s),
    rejected,
    why: c?.why_now || null,
    opening_line: opening,
    action: recommendAction(inv, top.score, now, top.s.relevance),
    summary: `${SIGNAL_TYPE_LABEL[top.s.type]}: ${top.s.summary} (${top.s.source}, ${age === 0 ? "today" : `${age}d ago`})`,
    error: searchNote,
  };
}

// Gather live evidence for a batch in parallel, then classify the whole batch with one Gemini call.
export async function assessBatch(invs: Investor[], now: Date, counter: Counter): Promise<AssessmentResult[]> {
  const gathered = await Promise.all(
    invs.map((inv) =>
      gatherCandidates(inv, now, counter).catch(
        (e): Gathered => ({ candidates: [], rejected: [], newsOk: false, searchOk: false, searchError: String(e) }),
      ),
    ),
  );
  const entries = invs
    .map((inv, i) => ({ key: `i${i}`, inv, candidates: gathered[i].candidates }))
    .filter((e) => e.candidates.length);
  // Candidate ids must be unique across the batch.
  for (const e of entries) e.candidates.forEach((c, j) => (c.id = `${e.key}-${j}`));

  let classified = new Map<string, Classified>();
  let classifyError: string | null = null;
  if (entries.length) {
    try {
      classified = await classifyBatch(entries, now, counter);
    } catch (e) {
      classifyError = e instanceof Error ? e.message : String(e);
    }
  }
  return invs.map((inv, i) => {
    const g = gathered[i];
    if (g.candidates.length && classifyError) return errorResult(g.rejected, `Classification failed: ${classifyError}`);
    return buildResult(inv, g, classified.get(`i${i}`), now, counter);
  });
}

export async function assessInvestor(inv: Investor, now: Date, counter: Counter) {
  return (await assessBatch([inv], now, counter))[0];
}

// ---------- Run orchestration (chunked so 50 investors never hit the function time limit) ----------

export async function latestRun(): Promise<Run | null> {
  const { data } = await db().from("vc_runs").select("*").order("started_at", { ascending: false }).limit(1);
  const run = (data?.[0] as Run) ?? null;
  if (run && run.status === "running" && Date.now() - new Date(run.heartbeat_at).getTime() > STALL_MS) {
    await db().from("vc_runs").update({ status: "stalled" }).eq("id", run.id);
    run.status = "stalled";
  }
  return run;
}

export async function startRun(trigger: "cron" | "manual"): Promise<{ run: Run; resumed: boolean } | { error: string; retryAfter?: number }> {
  const current = await latestRun();
  if (current?.status === "running") return { run: current, resumed: false };
  if (current?.status === "stalled") {
    await db().from("vc_runs").update({ status: "running", heartbeat_at: new Date().toISOString() }).eq("id", current.id);
    return { run: { ...current, status: "running" }, resumed: true };
  }
  if (trigger === "manual" && current) {
    const since = Date.now() - new Date(current.started_at).getTime();
    if (since < MANUAL_COOLDOWN_MS) {
      return { error: "A refresh ran in the last 5 minutes. Please wait before refreshing again.", retryAfter: Math.ceil((MANUAL_COOLDOWN_MS - since) / 1000) };
    }
  }
  const s = db();
  const [{ count }, { data: fp }] = await Promise.all([
    s.from("vc_investors").select("id", { count: "exact", head: true }),
    s.rpc("vc_manual_fingerprint"),
  ]);
  const { data, error } = await s
    .from("vc_runs")
    .insert({ trigger, total: count ?? 0, fingerprint_before: fp, model: GEMINI_MODEL })
    .select("*")
    .single();
  if (error) return { error: error.message };
  return { run: data as Run, resumed: true };
}

export async function processChunk(runId: string, origin: string) {
  const s = db();
  const deadline = Date.now() + CHUNK_BUDGET_MS;
  const now = new Date();

  const { data: run } = await s.from("vc_runs").select("*").eq("id", runId).single();
  if (!run || (run.status !== "running")) return;

  const { data: investors } = await s.from("vc_investors").select("*").order("firm");
  const { data: done } = await s.from("vc_assessments").select("investor_id").eq("run_id", runId);
  const doneIds = new Set((done ?? []).map((d) => d.investor_id));
  const pending = ((investors ?? []) as Investor[]).filter((i) => !doneIds.has(i.id));

  const { data: prevRows } = await s
    .from("vc_assessments")
    .select("investor_id, score, created_at")
    .neq("run_id", runId)
    .order("created_at", { ascending: false })
    .limit(500);
  const prevScore = new Map<string, number | null>();
  for (const r of prevRows ?? []) if (!prevScore.has(r.investor_id)) prevScore.set(r.investor_id, r.score);

  const counter: Counter = { calls: 0 };
  let processedNow = 0;

  while (pending.length && Date.now() < deadline - 90_000) {
    const batch = pending.splice(0, BATCH);
    const results = await assessBatch(batch, now, counter);
    await Promise.all(
      batch.map(async (inv, i) => {
        let result = results[i];
        // Failed checks never overwrite Vikram's table: an error is not the same as "quiet".
        if (result.state !== "error") {
          const { error } = await s.rpc("vc_apply_signal", {
            p_id: inv.id,
            p_last_signal_date: result.best?.date ?? inv.last_signal_date,
            p_summary: result.summary,
            p_score: result.score,
            p_action: result.action,
          });
          if (error) result = { ...result, state: "error", error: `DB write rejected: ${error.message}` };
        }
        await s.from("vc_assessments").upsert(
          {
            run_id: runId,
            investor_id: inv.id,
            state: result.state,
            score: result.score,
            prev_score: prevScore.get(inv.id) ?? null,
            breakdown: result.breakdown,
            best_signal: result.best,
            signals: result.signals,
            rejected: result.rejected,
            why: result.why,
            opening_line: result.opening_line,
            action: result.action || null,
            error: result.error,
          },
          { onConflict: "run_id,investor_id", ignoreDuplicates: true },
        );
        processedNow++;
      }),
    );
    await s
      .from("vc_runs")
      .update({
        processed: doneIds.size + processedNow,
        gemini_calls: (run.gemini_calls ?? 0) + counter.calls,
        heartbeat_at: new Date().toISOString(),
        ...(counter.searchOff ? { notes: "Gemini Google Search grounding unavailable (API quota); signals came from Google News + Bing News, classified by Gemini Flash." } : {}),
      })
      .eq("id", runId);
  }

  if (pending.length) {
    // Hand the rest to a fresh function invocation.
    await fetch(`${origin}/api/run/continue`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-run-secret": process.env.CRON_SECRET ?? "" },
      body: JSON.stringify({ runId }),
    }).catch(() => {});
    return;
  }
  await finalizeRun(runId);
}

async function finalizeRun(runId: string) {
  const s = db();
  const { data: run } = await s.from("vc_runs").select("*").eq("id", runId).single();
  const { data: rows } = await s.from("vc_assessments").select("state").eq("run_id", runId);
  const counts = { active: 0, quiet: 0, error: 0 };
  for (const r of rows ?? []) counts[r.state as keyof typeof counts]++;
  const { data: fp } = await s.rpc("vc_manual_fingerprint");
  const { count: edits } = await s
    .from("vc_manual_edits")
    .select("id", { count: "exact", head: true })
    .gte("edited_at", run.started_at);
  const total = rows?.length ?? 0;
  await s
    .from("vc_runs")
    .update({
      status: counts.error === 0 ? "succeeded" : counts.error < total ? "partial" : "failed",
      finished_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
      processed: total,
      active_count: counts.active,
      quiet_count: counts.quiet,
      error_count: counts.error,
      fingerprint_after: fp,
      manual_edits_during_run: edits ?? 0,
    })
    .eq("id", runId);
}
