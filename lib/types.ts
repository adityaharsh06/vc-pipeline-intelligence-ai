export type Status = "not_contacted" | "waiting_response" | "in_conversation" | "passed";

export type Investor = {
  id: string;
  name: string;
  firm: string;
  kind: string;
  thesis: string;
  website: string | null;
  geography: string | null;
  // Vikram's manual columns
  status: Status;
  last_contact_date: string | null;
  notes: string;
  // signal-derived columns (pipeline-owned)
  last_signal_date: string | null;
  signal_summary: string | null;
  follow_up_score: number | null;
  recommended_action: string | null;
  updated_at: string;
};

export type SignalType =
  | "investment"
  | "portfolio_milestone"
  | "fund_or_thesis"
  | "blog_post"
  | "interview_or_podcast"
  | "event"
  | "other";

export type EvidenceLevel = "dated_press" | "verified_page" | "search_result" | "model_only";

export type Signal = {
  title: string;
  url: string;
  source: string;
  date: string; // YYYY-MM-DD
  date_basis: "publisher_feed" | "page_metadata" | "search_estimate";
  type: SignalType;
  relevance: number; // 0-100 relevance to B2B logistics / supply-chain SaaS
  summary: string;
  evidence: EvidenceLevel;
  origin: "google_news" | "bing_news" | "gemini_search";
  coverage?: number; // number of outlets reporting the same event
};

export type Rejected = { title: string; url?: string; reason: string };

export type Breakdown = {
  recency: number;
  relevance: number;
  signal_type: number;
  evidence: number;
  relationship: number;
};

export type Assessment = {
  id: string;
  run_id: string;
  investor_id: string;
  state: "active" | "quiet" | "error";
  score: number | null;
  prev_score: number | null;
  breakdown: Breakdown | null;
  best_signal: Signal | null;
  signals: Signal[];
  rejected: Rejected[];
  why: string | null;
  opening_line: string | null;
  action: string | null;
  error: string | null;
  created_at: string;
};

export type Run = {
  id: string;
  trigger: "cron" | "manual";
  status: "running" | "succeeded" | "partial" | "failed" | "stalled";
  started_at: string;
  finished_at: string | null;
  heartbeat_at: string;
  total: number;
  processed: number;
  active_count: number;
  quiet_count: number;
  error_count: number;
  gemini_calls: number;
  fingerprint_before: string | null;
  fingerprint_after: string | null;
  manual_edits_during_run: number;
  model: string | null;
  notes: string | null;
};

export const SIGNAL_TYPE_LABEL: Record<SignalType, string> = {
  investment: "New investment",
  portfolio_milestone: "Portfolio milestone",
  fund_or_thesis: "Fund / thesis news",
  blog_post: "Blog post",
  interview_or_podcast: "Interview / podcast",
  event: "Event appearance",
  other: "Public activity",
};

export const STATUS_LABEL: Record<Status, string> = {
  not_contacted: "Yet to reach out",
  waiting_response: "Waiting for response",
  in_conversation: "In conversation",
  passed: "Passed",
};
