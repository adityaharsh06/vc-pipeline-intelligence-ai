// Minimal Gemini REST client (no SDK): JSON output, optional Google Search grounding,
// and rotation across Gemini Flash models when one is overloaded or out of daily quota.

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

// All entries are Gemini Flash models. The first is preferred; the rest are used only when
// the previous one is overloaded (503) or has used its daily free-tier quota (429).
export const GEMINI_MODELS = (process.env.GEMINI_MODELS ||
  "gemini-3.8-flash,gemini-3.7-flash,gemini-flash-latest,gemini-3-flash-preview")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
export const GEMINI_MODEL = GEMINI_MODELS[0];

// Grounded search costs a request per investor; off unless the key has quota for it.
export const GROUNDING_ENABLED = process.env.GEMINI_GROUNDING === "on";

// Models that hit their daily quota (or are briefly overloaded) in this function instance.
const exhausted = new Set<string>();

export type GroundingSource = { uri: string; title: string };

export type GeminiResult<T> = {
  data: T;
  sources: GroundingSource[];
  queries: string[];
  model: string;
};

export class GeminiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

type Options = {
  search?: boolean;
  schema?: object;
  temperature?: number;
  onCall?: (model: string) => void;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retryDelaySec(body: string) {
  const m = body.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
  return m ? parseFloat(m[1]) : null;
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Gemini did not return JSON");
  }
}

export async function gemini<T>(prompt: string, opts: Options = {}): Promise<GeminiResult<T>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("GEMINI_API_KEY is not set", 0);

  let useSchema = Boolean(opts.schema);
  let useThinkingLevel = true;
  let lastError = "no Gemini Flash model available";

  for (let attempt = 0; attempt < 8; attempt++) {
    const model = GEMINI_MODELS.find((m) => !exhausted.has(m));
    if (!model) throw new GeminiError(`All Gemini Flash models are out of quota (${lastError})`, 429);

    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.2,
        // Classification needs little reasoning; low thinking keeps each call fast.
        ...(useThinkingLevel ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
        ...(useSchema ? { responseMimeType: "application/json", responseJsonSchema: opts.schema } : {}),
      },
    };
    if (opts.search) body.tools = [{ google_search: {} }];

    opts.onCall?.(model);
    let res: Response;
    try {
      res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      await sleep(1000);
      continue;
    }
    const text = await res.text();
    if (process.env.GEMINI_DEBUG) {
      console.error(`[gemini] ${model} search=${!!opts.search} -> ${res.status} ${res.ok ? "" : text.replace(/\s+/g, " ").slice(0, 160)}`);
    }

    if (res.status === 400 && useThinkingLevel && /thinking/i.test(text)) {
      useThinkingLevel = false;
      continue;
    }
    if (res.status === 400 && useSchema && /response|schema|mime|tool/i.test(text)) {
      useSchema = false;
      continue;
    }
    if (res.status === 429) {
      // Grounded search on a free key: fail fast so the caller can switch grounding off.
      if (opts.search) throw new GeminiError("Google Search grounding quota exhausted", 429);
      const delay = retryDelaySec(text);
      if (delay === null || delay > 90 || /PerDay/i.test(text)) {
        exhausted.add(model); // daily cap: move to the next Flash model
        lastError = `${model} daily quota reached`;
        continue;
      }
      await sleep(Math.ceil(delay * 1000));
      continue;
    }
    if (res.status >= 500) {
      // Overloaded: use the next model for a minute, then come back to the preferred one.
      lastError = `${model} overloaded (${res.status})`;
      const i = GEMINI_MODELS.indexOf(model);
      if (GEMINI_MODELS.slice(i + 1).some((m) => !exhausted.has(m))) {
        exhausted.add(model);
        setTimeout(() => exhausted.delete(model), 60_000);
      } else {
        await sleep(2000 * (attempt + 1));
      }
      continue;
    }
    if (!res.ok) throw new GeminiError(`Gemini ${res.status}: ${text.slice(0, 300)}`, res.status);

    const json = JSON.parse(text);
    const cand = json.candidates?.[0];
    const out: string = (cand?.content?.parts ?? [])
      .map((p: { text?: string; thought?: boolean }) => (p.thought ? "" : p.text ?? ""))
      .join("");
    if (!out.trim()) {
      lastError = "empty answer";
      continue;
    }
    const meta = cand?.groundingMetadata ?? {};
    const sources: GroundingSource[] = (meta.groundingChunks ?? [])
      .map((c: { web?: { uri?: string; title?: string } }) => ({ uri: c.web?.uri ?? "", title: c.web?.title ?? "" }))
      .filter((s: GroundingSource) => s.uri);
    return { data: extractJson(out) as T, sources, queries: meta.webSearchQueries ?? [], model };
  }
  throw new GeminiError(`Gemini failed after retries (${lastError})`, 0);
}
