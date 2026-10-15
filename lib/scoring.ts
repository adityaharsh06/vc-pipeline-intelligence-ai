import type { Breakdown, Investor, Signal, SignalType } from "./types";

// The follow-up score is computed by fixed rules, not by the model.
// Gemini only classifies evidence (type, relevance, is-it-about-them).
export const WEIGHTS = {
  relevance: 35,
  recency: 30,
  signal_type: 15,
  evidence: 10,
  relationship: 10,
} as const;

export const TYPE_POINTS: Record<SignalType, number> = {
  investment: 15,
  fund_or_thesis: 12,
  blog_post: 11,
  interview_or_podcast: 11,
  event: 10,
  portfolio_milestone: 8,
  other: 5,
};

export const EVIDENCE_POINTS = {
  dated_press: 10,
  verified_page: 10,
  search_result: 6,
  model_only: 3,
} as const;

// A high score alone is not enough: the signal must also be on-thesis.
export const THRESHOLDS = {
  reachOut: 70,
  reachOutRelevance: 70,
  tailored: 55,
  tailoredRelevance: 45,
} as const;
export const WINDOW_DAYS = 30;

export function daysBetween(fromIso: string, to: Date) {
  return Math.floor((to.getTime() - new Date(fromIso + "T00:00:00Z").getTime()) / 86_400_000);
}

export function relationshipPoints(inv: Pick<Investor, "status" | "last_contact_date">, now: Date) {
  switch (inv.status) {
    case "not_contacted":
      return 10;
    case "in_conversation":
      return 7;
    case "passed":
      return 2;
    case "waiting_response": {
      if (!inv.last_contact_date) return 8;
      const d = daysBetween(inv.last_contact_date, now);
      return d >= 14 ? 9 : d >= 7 ? 5 : 1;
    }
  }
}

export function scoreSignal(sig: Signal, inv: Investor, now: Date): { score: number; breakdown: Breakdown } {
  const age = Math.max(0, daysBetween(sig.date, now));
  const breakdown: Breakdown = {
    relevance: Math.round((WEIGHTS.relevance * Math.min(100, Math.max(0, sig.relevance))) / 100),
    recency: Math.round(WEIGHTS.recency * Math.max(0, 1 - age / 40)),
    signal_type: TYPE_POINTS[sig.type],
    evidence: EVIDENCE_POINTS[sig.evidence],
    relationship: relationshipPoints(inv, now),
  };
  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score: Math.min(100, score), breakdown };
}

export function recommendAction(inv: Investor, score: number | null, now: Date, relevance = 0): string {
  if (inv.status === "passed") return "Do not pursue now - they passed; revisit with new metrics";
  if (score === null) return "Hold - no observable signal in the last 30 days";
  const reachOut = score >= THRESHOLDS.reachOut && relevance >= THRESHOLDS.reachOutRelevance;
  const tailored = score >= THRESHOLDS.tailored && relevance >= THRESHOLDS.tailoredRelevance;
  if (inv.status === "waiting_response" && inv.last_contact_date) {
    const d = daysBetween(inv.last_contact_date, now);
    if (d < 7) return `Wait - you contacted them ${d} day${d === 1 ? "" : "s"} ago`;
    if (reachOut) return "Follow up this week - reference their recent activity";
    if (tailored) return "Reach out with a tailored note - you are waiting on a reply";
  }
  if (reachOut) return "Reach out this week";
  if (tailored) return "Reach out with a tailored note";
  if (relevance < THRESHOLDS.tailoredRelevance) return "Low priority - active, but not in your space";
  return "Low priority - monitor";
}

export function actionTone(action: string | null): "hot" | "warm" | "cold" | "hold" {
  if (!action) return "cold";
  if (action.startsWith("Reach out this week") || action.startsWith("Follow up")) return "hot";
  if (action.startsWith("Reach out with")) return "warm";
  if (action.startsWith("Hold") || action.startsWith("Wait") || action.startsWith("Do not")) return "hold";
  return "cold";
}

// Short (2-6 word) reasons shown next to each rubric row. Derived from the stored points and
// evidence, so they always match the numbers; relevance uses Gemini's own short reason when present.
export function explainBreakdown(b: Breakdown, sig: Signal | null, scannedAt: string): Record<keyof Breakdown, string> {
  const age = sig ? Math.max(0, daysBetween(sig.date, new Date(scannedAt))) : null;
  const rel = sig?.relevance ?? Math.round((b.relevance / WEIGHTS.relevance) * 100);
  const words = (s: string) => s.trim().split(/\s+/).slice(0, 6).join(" ");
  const TYPE_NOTE: Record<SignalType, string> = {
    investment: "New investment: strongest signal",
    fund_or_thesis: "New fund or thesis news",
    blog_post: "Wrote about it publicly",
    interview_or_podcast: "Spoke about it publicly",
    event: "Appeared at an event",
    portfolio_milestone: "Portfolio news, not new deal",
    other: "General public activity",
  };
  const EVIDENCE_NOTE: Record<Signal["evidence"], string> = {
    dated_press: "Publisher-dated news article",
    verified_page: "Source page verified",
    search_result: "Search result, date estimated",
    model_only: "Source not confirmed",
  };
  const RELATIONSHIP_NOTE: Record<number, string> = {
    10: "Not contacted yet",
    9: "Waiting 14+ days: nudge due",
    8: "Waiting on reply",
    7: "Already in conversation",
    5: "Waiting 7-13 days",
    2: "They passed earlier",
    1: "Contacted under a week ago",
  };
  return {
    recency: age === null ? "" : age === 0 ? "Published the day of scan" : `${age} day${age === 1 ? "" : "s"} old`,
    relevance: sig?.relevance_why
      ? words(sig.relevance_why)
      : rel >= 80 ? "Directly logistics / supply chain"
      : rel >= 50 ? "Adjacent to logistics"
      : rel >= 20 ? "General B2B or seed deal"
      : "Outside logistics",
    signal_type: sig ? TYPE_NOTE[sig.type] : "",
    evidence: sig ? EVIDENCE_NOTE[sig.evidence] : "",
    relationship: RELATIONSHIP_NOTE[b.relationship] ?? "",
  };
}
