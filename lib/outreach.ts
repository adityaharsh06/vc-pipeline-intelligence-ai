import { db } from "./supabase";
import { gemini } from "./gemini";
import { STARTUP_PROFILE } from "./pipeline";
import { daysBetween } from "./scoring";
import { SIGNAL_TYPE_LABEL, type Assessment, type Investor } from "./types";

// Outreach drafts for the "Reach out this week" list. Drafts only: the app never sends email.

export type Tone = "default" | "shorter" | "warmer" | "formal";
export const TONES: Tone[] = ["default", "shorter", "warmer", "formal"];
export type DraftKind = "first_touch" | "follow_up" | "next_step";

export type Draft = {
  id: string;
  investor_id: string;
  assessment_id: string;
  kind: DraftKind;
  tone: Tone;
  subject: string;
  body: string;
  model: string | null;
  created_at: string;
};

const BATCH = 8;
const HOURLY_CAP = 120; // public page, no login: cap new drafts so nobody can drain the API credit

const TONE_GUIDE: Record<Tone, string> = {
  default: "Clear, specific and friendly. 110-150 words.",
  shorter: "Very short and direct. 60-80 words, 3 short paragraphs at most.",
  warmer: "Warm and personable, still professional. 110-150 words.",
  formal: "Formal and polished, suited to a senior partner. 110-150 words.",
};

export function draftKind(inv: Investor): DraftKind {
  if (inv.status === "waiting_response") return "follow_up";
  if (inv.status === "in_conversation") return "next_step";
  return "first_touch";
}

const KIND_GUIDE: Record<DraftKind, string> = {
  first_touch: "First cold email. Open with the specific signal, connect it to Vikram's company, make one clear ask (a 20-minute call).",
  follow_up: "Polite follow-up to an earlier email that got no reply. Mention the earlier email briefly, use the new signal as the reason to write again, keep the ask light.",
  next_step: "They are already in conversation with Vikram. Reference the signal as a timely touchpoint and propose a concrete next step (e.g. sharing customer references or a product demo).",
};

type Entry = { key: string; inv: Investor; a: Assessment };

function describe({ key, inv, a }: Entry, now: Date) {
  const s = a.best_signal!;
  const contact = inv.last_contact_date ? `last contacted ${inv.last_contact_date} (${daysBetween(inv.last_contact_date, now)} days ago)` : "never contacted";
  return [
    `### key=${key}`,
    `Investor: ${inv.name} at ${inv.firm} (${inv.kind}). Thesis: ${inv.thesis}`,
    `Relationship: ${contact}. Email type: ${draftKind(inv)} — ${KIND_GUIDE[draftKind(inv)]}`,
    `Signal (${SIGNAL_TYPE_LABEL[s.type]}, ${s.date}, ${s.source}): ${s.summary}`,
    a.why ? `Why now: ${a.why}` : "",
  ].filter(Boolean).join("\n");
}

async function generate(entries: Entry[], tone: Tone, now: Date) {
  const prompt = `${STARTUP_PROFILE}
Today is ${now.toISOString().slice(0, 10)}. Write one outreach email from Vikram to each investor below.

${entries.map((e) => describe(e, now)).join("\n\n")}

Rules for every email:
- Tone: ${TONE_GUIDE[tone]}
- Greet the investor by first name. Refer to their signal specifically and accurately (what happened, roughly when). Never invent facts about the investor or the deal.
- Explain in one or two sentences why that signal makes Vikram's B2B logistics SaaS relevant to them.
- Vikram's traction is unknown: use square-bracket placeholders such as [X shippers live] or [₹Y ARR] instead of numbers. Never make up metrics, customer names or a company name; use [Company] for the company name.
- One clear ask. Sign off as "Vikram\\nFounder, [Company]".
- No flattery, no hype words (revolutionary, game-changing, etc.), no emojis.
- subject: under 9 words, specific to the signal, no clickbait.
Return JSON {"emails":[{"key":string,"subject":string,"body":string}]} with one entry per key; body uses \\n for line breaks.`;

  const { data, model } = await gemini<{ emails: { key: string; subject: string; body: string }[] }>(prompt, {
    temperature: 0.5,
    schema: {
      type: "object",
      properties: {
        emails: {
          type: "array",
          items: {
            type: "object",
            properties: { key: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
            required: ["key", "subject", "body"],
          },
        },
      },
      required: ["emails"],
    },
  });
  return { emails: data.emails ?? [], model };
}

export async function getDrafts(assessmentIds: string[], tone: Tone = "default") {
  if (!assessmentIds.length) return [] as Draft[];
  const { data } = await db().from("vc_outreach_drafts").select("*").in("assessment_id", assessmentIds).eq("tone", tone);
  return (data ?? []) as Draft[];
}

async function underCap(n: number) {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db().from("vc_outreach_drafts").select("id", { count: "exact", head: true }).gte("created_at", since);
  return (count ?? 0) + n <= HOURLY_CAP;
}

// Generates drafts for the given (investor, assessment) pairs that don't have one yet.
// `replace` regenerates even if a draft exists (used by the Regenerate button).
export async function ensureDrafts(pairs: { inv: Investor; a: Assessment }[], tone: Tone, replace = false) {
  const s = db();
  const existing = replace ? [] : await getDrafts(pairs.map((p) => p.a.id), tone);
  const have = new Set(existing.map((d) => d.assessment_id));
  const missing = pairs.filter((p) => p.a.best_signal && !have.has(p.a.id));
  if (!missing.length) return { created: 0 };
  if (!(await underCap(missing.length))) throw new Error("Draft limit reached for this hour. Please try again later.");

  const now = new Date();
  let created = 0;
  for (let i = 0; i < missing.length; i += BATCH) {
    const entries: Entry[] = missing.slice(i, i + BATCH).map((p, j) => ({ key: `e${j}`, inv: p.inv, a: p.a }));
    const { emails, model } = await generate(entries, tone, now);
    const rows = entries.flatMap((e) => {
        const m = emails.find((x) => x.key === e.key);
        if (!m?.subject || !m?.body) return [];
        return [{
          investor_id: e.inv.id,
          assessment_id: e.a.id,
          kind: draftKind(e.inv),
          tone,
          subject: m.subject.trim(),
          body: m.body.replace(/\\n/g, "\n").trim(),
          model,
        }];
      });
    if (rows.length) {
      const { error } = await s.from("vc_outreach_drafts").upsert(rows, { onConflict: "assessment_id,tone" });
      if (error) throw new Error(error.message);
      created += rows.length;
    }
  }
  return { created };
}
