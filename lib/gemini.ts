// Gemini Flash via the OpenRouter gateway (the course-provided access path).
// Only Google models, served only by Google's own infrastructure; JSON output via json_schema.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// All entries are Google Gemini Flash models on OpenRouter. The first is preferred; the next
// is used only when the previous one is overloaded or unavailable.
export const GEMINI_MODELS = (process.env.OPENROUTER_MODELS || "google/gemini-3.7-flash,google/gemini-3.8-flash")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
export const GEMINI_MODEL = GEMINI_MODELS[0];

// Make Google's own infrastructure serve every request (no third-party hosts).
const PROVIDER = { only: ["google-vertex", "google-ai-studio"], allow_fallbacks: false };

// Grounded Google Search is not available through OpenRouter with Google-only routing;
// the live signals come from the news feeds instead.
export const GROUNDING_ENABLED = false;

// Models that were unavailable in this function instance (cleared after a minute).
const unavailable = new Set<string>();

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
  deadline?: number; // epoch ms; give up (status 408) rather than run past it
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// OpenRouter strict json_schema requires additionalProperties: false on every object.
function strictSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(strictSchema);
  if (!s || typeof s !== "object") return s;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) out[k] = strictSchema(v);
  if (out.type === "object") out.additionalProperties = false;
  return out;
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
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new GeminiError("OPENROUTER_API_KEY is not set", 0);
  if (opts.search) throw new GeminiError("Grounded search is not available via OpenRouter", 429);

  let useSchema = Boolean(opts.schema);
  let lastError = "no Gemini Flash model available";

  for (let attempt = 0; attempt < 6; attempt++) {
    const left = opts.deadline ? opts.deadline - Date.now() : 120_000;
    if (left < 8_000) throw new GeminiError("Out of time in this invocation", 408);
    const model = GEMINI_MODELS.find((m) => !unavailable.has(m)) ?? GEMINI_MODELS[0];

    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: opts.temperature ?? 0.2,
      reasoning: { effort: "low" }, // classification needs little reasoning; keeps calls fast
      provider: PROVIDER,
      ...(useSchema
        ? { response_format: { type: "json_schema", json_schema: { name: "result", strict: true, schema: strictSchema(opts.schema) } } }
        : {}),
    };

    opts.onCall?.(model);
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
          "x-title": "VC Signal Desk",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.min(75_000, left - 3_000)),
      });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      await sleep(1000);
      continue;
    }
    const text = await res.text();
    if (process.env.GEMINI_DEBUG) {
      console.error(`[gemini] ${model} -> ${res.status} ${res.ok ? "" : text.replace(/\s+/g, " ").slice(0, 200)}`);
    }

    if (res.status === 402) throw new GeminiError("OpenRouter credits exhausted", 402);
    if (res.status === 400 && useSchema && /schema|response_format|json/i.test(text)) {
      useSchema = false; // fall back to prompting for JSON text
      continue;
    }
    if (res.status === 429) {
      lastError = `${model} rate limited`;
      await sleep(2000 * 2 ** Math.min(attempt, 3));
      continue;
    }
    if (res.status >= 500 || res.status === 404) {
      // Overloaded or unavailable: use the next model for a minute.
      lastError = `${model} unavailable (${res.status})`;
      if (GEMINI_MODELS.some((m) => m !== model && !unavailable.has(m))) {
        unavailable.add(model);
        setTimeout(() => unavailable.delete(model), 60_000);
      } else {
        await sleep(2000 * (attempt + 1));
      }
      continue;
    }
    if (!res.ok) throw new GeminiError(`OpenRouter ${res.status}: ${text.slice(0, 300)}`, res.status);

    const json = JSON.parse(text);
    if (json.error) {
      lastError = json.error.message ?? "provider error";
      continue;
    }
    const out: string = json.choices?.[0]?.message?.content ?? "";
    if (!out.trim()) {
      lastError = "empty answer";
      continue;
    }
    return { data: extractJson(out) as T, sources: [], queries: [], model: json.model ?? model };
  }
  throw new GeminiError(`Gemini failed after retries (${lastError})`, 0);
}
