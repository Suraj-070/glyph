import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

// AI SDK must run server-side only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---- Types ---------------------------------------------------------------

type HintLevel = 1 | 2 | 3;

interface HintResponse {
  level: number;
  hint: string;
}

interface HintCacheEntry {
  data: HintResponse;
  ts: number;
}

// ---- In-memory cache (per server process) --------------------------------

const hintCache = new Map<string, HintCacheEntry>();
const HINT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const WORD_RE = /^[A-Z]{5}$/;

const FALLBACK_HINT: Record<HintLevel, string> = {
  1: "It's a common five-letter English word.",
  2: "Think about everyday vocabulary.",
  3: "Try words with common vowels.",
};

// ---- JSON helpers (no `any`) --------------------------------------------

function isStringRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asHintLevel(v: unknown): HintLevel | null {
  if (typeof v === "number" && (v === 1 || v === 2 || v === 3)) return v;
  if (typeof v === "string") {
    if (v === "1") return 1;
    if (v === "2") return 2;
    if (v === "3") return 3;
  }
  return null;
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

function parseHintJSON(raw: string): string | null {
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
  const hint = typeof parsed.hint === "string" ? parsed.hint.trim() : "";
  return hint.length > 0 ? hint : null;
}

/**
 * Safety filter: ensure the hint never reveals the word itself or spells it
 * out letter-by-letter. If it does, we discard it and use the fallback.
 */
function hintIsSafe(hint: string, word: string): boolean {
  const lower = hint.toLowerCase();
  const w = word.toLowerCase();

  // Never allow the word itself (case-insensitive) as a substring.
  if (lower.includes(w)) return false;

  // Block letter-by-letter spelling like "c r a n e" or "c-r-a-n-e".
  const pattern = w.split("").join("[\\s\\-]");
  try {
    if (new RegExp(pattern, "i").test(hint)) return false;
  } catch {
    // Regex construction failure — fail open but conservatively reject.
    return false;
  }

  return true;
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

  const level = asHintLevel(body.level);
  if (level === null) {
    return NextResponse.json(
      { error: "level must be 1, 2, or 3" },
      { status: 400 }
    );
  }

  const word = rawWord;
  const cacheKey = `${word}|${level}`;

  // Cache hit?
  const cached = hintCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < HINT_CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  const systemPrompt = `You are GLYPH's hint engine. The secret word is '${word}'. Give a hint at level ${level} (1=vague, 2=specific, 3=strongest-without-revealing). NEVER output the secret word itself or spell it out. Return ONLY a JSON object {hint: string}. Max 20 words. No markdown.`;

  const userMessage = `Provide a level-${level} hint for the secret word. Do not reveal the word or its letters.`;

  const fallback: HintResponse = { level, hint: FALLBACK_HINT[level] };

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
    const hint = parseHintJSON(raw);

    if (!hint || !hintIsSafe(hint, word)) {
      // Graceful fallback — do NOT cache so a later success can populate.
      return NextResponse.json(fallback);
    }

    const data: HintResponse = { level, hint };
    hintCache.set(cacheKey, { data, ts: Date.now() });
    return NextResponse.json(data);
  } catch {
    // Any SDK / network failure → graceful fallback.
    return NextResponse.json(fallback);
  }
}
