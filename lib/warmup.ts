import { db } from "./supabase";
import { gemini } from "./gemini";
import { STARTUP_PROFILE } from "./pipeline";
import { SIGNAL_TYPE_LABEL, type Assessment, type Investor } from "./types";

// Warm-up kit for "worth a tailored note" VCs: a cold email is too strong, so Gemini drafts
// a LinkedIn connection note and a warm-intro request to a mutual contact. Drafts only.

export type WarmupDraft = {
  id: string;
  investor_id: string;
  assessment_id: string;
  linkedin_note: string;
  intro_subject: string;
  intro_body: string;
  model: string | null;
  created_at: string;
};

export const LINKEDIN_LIMIT = 300; // LinkedIn's connection-note character limit
const BATCH = 8;
const HOURLY_CAP = 120;

type Entry = { key: string; inv: Investor; a: Assessment };

async function generate(entries: Entry[], now: Date) {
  const blocks = entries
    .map(({ key, inv, a }) => {
      const s = a.best_signal!;
      return `### key=${key}\nInvestor: ${inv.name} at ${inv.firm} (${inv.kind}). Thesis: ${inv.thesis}\nSignal (${SIGNAL_TYPE_LABEL[s.type]}, ${s.date}, ${s.source}): ${s.summary}`;
    })
    .join("\n\n");
  const prompt = `${STARTUP_PROFILE}
Today is ${now.toISOString().slice(0, 10)}. These investors are worth warming up, but a cold pitch would be too strong.
For each, write two short pieces from Vikram:

${blocks}

1. linkedin_note: a LinkedIn connection request note, at most 280 characters including spaces. Mention the signal
   specifically, say in a few words what Vikram builds, no ask for money or a call, no flattery, no emojis.
2. A warm-intro request Vikram sends to a mutual contact who knows the investor:
   - intro_subject: under 9 words.
   - intro_body: 70-110 words. Start with "Hi [Name]," (the mutual contact). Ask if they would be comfortable
     introducing Vikram to the investor by first name, give the reason (the signal), and include a 2-3 sentence
     forwardable blurb about [Company] with placeholders like [X shippers live]. Sign off "Vikram".
Never invent facts, metrics or a company name; use [Company] and other square-bracket placeholders.
Return JSON {"items":[{"key":string,"linkedin_note":string,"intro_subject":string,"intro_body":string}]}; use \\n for line breaks.`;

  const { data, model } = await gemini<{ items: { key: string; linkedin_note: string; intro_subject: string; intro_body: string }[] }>(prompt, {
    temperature: 0.5,
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              linkedin_note: { type: "string" },
              intro_subject: { type: "string" },
              intro_body: { type: "string" },
            },
            required: ["key", "linkedin_note", "intro_subject", "intro_body"],
          },
        },
      },
      required: ["items"],
    },
  });
  return { items: data.items ?? [], model };
}

// LinkedIn rejects notes over 300 characters: trim at a word boundary if the model ran long.
function fitLinkedIn(note: string) {
  const t = note.replace(/\s+/g, " ").trim();
  if (t.length <= LINKEDIN_LIMIT) return t;
  return t.slice(0, LINKEDIN_LIMIT - 1).replace(/\s+\S*$/, "") + "…";
}

export async function ensureWarmups(pairs: { inv: Investor; a: Assessment }[], replace = false) {
  const s = db();
  const ids = pairs.map((p) => p.a.id);
  const { data: existing } = replace || !ids.length
    ? { data: [] as { assessment_id: string }[] }
    : await s.from("vc_warmup_drafts").select("assessment_id").in("assessment_id", ids);
  const have = new Set((existing ?? []).map((d) => d.assessment_id));
  const missing = pairs.filter((p) => p.a.best_signal && !have.has(p.a.id));
  if (!missing.length) return { created: 0 };

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await s.from("vc_warmup_drafts").select("id", { count: "exact", head: true }).gte("created_at", since);
  if ((count ?? 0) + missing.length > HOURLY_CAP) throw new Error("Draft limit reached for this hour. Please try again later.");

  const now = new Date();
  let created = 0;
  for (let i = 0; i < missing.length; i += BATCH) {
    const entries: Entry[] = missing.slice(i, i + BATCH).map((p, j) => ({ key: `w${j}`, inv: p.inv, a: p.a }));
    const { items, model } = await generate(entries, now);
    const rows = entries.flatMap((e) => {
      const m = items.find((x) => x.key === e.key);
      if (!m?.linkedin_note || !m?.intro_body) return [];
      return [{
        investor_id: e.inv.id,
        assessment_id: e.a.id,
        linkedin_note: fitLinkedIn(m.linkedin_note),
        intro_subject: m.intro_subject.trim(),
        intro_body: m.intro_body.replace(/\\n/g, "\n").trim(),
        model,
      }];
    });
    if (rows.length) {
      const { error } = await s.from("vc_warmup_drafts").upsert(rows, { onConflict: "assessment_id" });
      if (error) throw new Error(error.message);
      created += rows.length;
    }
  }
  return { created };
}
