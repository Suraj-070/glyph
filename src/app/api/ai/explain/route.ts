import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

// AI SDK must run server-side only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---- Types ---------------------------------------------------------------

interface ExplainResponse {
  word: string;
  meaning: string;
  funFact: string;
  partOfSpeech: string;
  example: string;
}

interface ExplainCacheEntry {
  data: ExplainResponse;
  ts: number;
}

// ---- In-memory cache (per server process) --------------------------------

const explainCache = new Map<string, ExplainCacheEntry>();
const EXPLAIN_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const WORD_RE = /^[A-Z]{5}$/;

const FALLBACK_EXPLAIN: Omit<ExplainResponse, "word"> = {
  partOfSpeech: "n.",
  meaning: "A common English word.",
  funFact: "Words are the building blocks of thought.",
  example: "",
};

// ---- JSON helpers (no `any`) --------------------------------------------

function isStringRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asNonEmptyString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

/** Walks the (untyped) SDK completion result and extracts the text content. */
function extractContent(completion: unknown): string {
  if (!isStringRecord(completion)) return "";
  const choices = completion.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const first = choices[0];
  if (!isStringRecord(first)) return "";
  const message = first.message;
  if (!isStringRecord(message)) return "";
  const content = message.content;
  return typeof content === "string" ? content : "";
}

function parseExplainJSON(raw: string, word: string): ExplainResponse | null {
  // Tolerate stray markdown fences.
  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  // Grab the outermost JSON object if the model padded with extra prose.
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;

  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return null;
  }

  if (!isStringRecord(parsed)) return null;

  const meaning = asNonEmptyString(parsed.meaning);
  const funFact = asNonEmptyString(parsed.funFact);
  const partOfSpeech = asNonEmptyString(parsed.partOfSpeech);
  const example = asNonEmptyString(parsed.example);

  if (!meaning || !funFact || !partOfSpeech) return null;

  return {
    word,
    meaning,
    funFact,
    partOfSpeech,
    example: example ?? "",
  };
}

// ---- Route handler -------------------------------------------------------

export async function POST(req: Request) {
  // Parse + validate body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isStringRecord(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const rawWord =
    typeof body.word === "string" ? body.word.toUpperCase().trim() : "";
  if (!WORD_RE.test(rawWord)) {
    return NextResponse.json(
      { error: "word must be a 5-letter alphabetic string" },
      { status: 400 }
    );
  }

  const word = rawWord;

  // Cache hit?
  const cached = explainCache.get(word);
  if (cached && Date.now() - cached.ts < EXPLAIN_CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  const systemPrompt =
    "You are GLYPH, an AI word curator for a Wordle-style game. For the given 5-letter word, return ONLY a JSON object with keys: word, partOfSpeech (string), meaning (1-2 sentence definition, plain English), funFact (one interesting or surprising fact, max 25 words), example (a short example sentence using the word). No markdown, no commentary, just the JSON object.";

  const userMessage = `Word: ${word}`;

  try {
    const zai = await ZAI.create();
    const completion: unknown = await zai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      thinking: { type: "disabled" },
    });

    const raw = extractContent(completion);
    const parsed = parseExplainJSON(raw, word);

    if (!parsed) {
      // Graceful fallback — do NOT cache so a later success can populate.
      const fallback: ExplainResponse = { word, ...FALLBACK_EXPLAIN };
      return NextResponse.json(fallback);
    }

    explainCache.set(word, { data: parsed, ts: Date.now() });
    return NextResponse.json(parsed);
  } catch {
    // Any SDK / network failure → graceful fallback.
    const fallback: ExplainResponse = { word, ...FALLBACK_EXPLAIN };
    return NextResponse.json(fallback);
  }
}
