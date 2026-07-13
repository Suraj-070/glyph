// GLYPH — stateless signed game tokens.
// Replaces per-guess DB reads: the whole session (word encrypted, progress)
// travels in an HMAC-signed token. Validate = 0 DB queries -> instant guesses.
// Cheat-proof: word AES-encrypted, state HMAC-signed — client can't read or forge.
import { createHmac, createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from "crypto";

const SECRET = process.env.GAME_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || "glyph-dev-secret-change-me";
const KEY = createHash("sha256").update(SECRET).digest(); // 32B AES key

export interface GameTokenState {
  seed: string;          // opaque id (dedupe key at submit)
  word: string;          // secret answer (encrypted in transit)
  mode: string;          // classic | practice | duel | party
  dailyType?: string;
  dailyDate?: string;
  maxGuesses: number;
  guessesUsed: number;
  won: boolean;
  finished: boolean;
  createdAt: number;     // ms epoch — server-side duration
}

const TTL_MS = 1000 * 60 * 60 * 24;

function b64u(b: Buffer): string {
  return b.toString("base64url");
}

export function signGameToken(state: GameTokenState): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(state), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = `${b64u(iv)}.${b64u(enc)}.${b64u(tag)}`;
  const sig = createHmac("sha256", KEY).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyGameToken(token: string): GameTokenState | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 4) return null;
    const [ivB, encB, tagB, sig] = parts;
    const payload = `${ivB}.${encB}.${tagB}`;
    const expected = createHmac("sha256", KEY).update(payload).digest();
    const given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

    const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB, "base64url"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(encB, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const state = JSON.parse(dec) as GameTokenState;
    if (Date.now() - state.createdAt > TTL_MS) return null;
    return state;
  } catch {
    return null;
  }
}

export function newSeed(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString("hex").toUpperCase()}`;
}

/** Deterministic duel word: both players derive the SAME word from the shared
 *  socket wordSeed — no DB coordination needed. */
export function duelWordFromSeed(wordSeed: string, pool: string[]): string {
  const h = createHmac("sha256", KEY).update(`duel:${wordSeed}`).digest();
  const n = h.readUInt32BE(0);
  return pool[n % pool.length];
}
