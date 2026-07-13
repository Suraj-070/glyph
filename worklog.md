# GLYPH — Multiplayer Wordle Arena — Worklog

This is the shared worklog for all agents working on the GLYPH platform.
Each agent MUST read this before starting and append a new section (starting with `---`) after finishing.

---
Task ID: 1
Agent: Main (orchestrator)
Task: Foundation — Prisma schema, word lists, game logic, types, store, dark futuristic theme

Work Log:
- Explored existing Next.js 16 project structure, shadcn/ui components, websocket example, Caddy gateway config
- Wrote `prisma/schema.prisma` with models: Player, PlayerProfile, StreakFreeze, DailyChallenge, Game, Guess, Achievement, Friendship
- Ran `bun run db:push` — schema synced to SQLite at db/custom.db, Prisma Client generated
- Created `src/lib/words.ts` — curated 5-letter word dataset (ANSWER_WORDS + EXTRA_VALID), with `isValidWord`, `randomAnswer`, `dailyWordForDate`, `dailyTypeForDate`. Strict 5-letter filtering applied.
- Created `src/lib/types.ts` — shared types (GameMode, TileStatus, OpponentState, RANKS, levelForXp, xpProgress)
- Created `src/lib/game.ts` — `evaluateGuess` (two-pass Wordle algorithm), `computeKeyStates`, `computeXp`, `computeRankPoints`, `maxGuessesFor`
- Created `src/lib/session.ts` — cookie-based local player identity (`getCurrentPlayer`, `getPlayerById`)
- Created `src/lib/store.ts` — Zustand client store (view routing, player, duel room, stats nonce)
- Rewrote `src/app/globals.css` — GLYPH dark-first theme: deep space-black bg with teal/violet radial gradients, glassmorphism utilities, Wordle tile color tokens, animations (tile-flip, tile-pop, shake, celebrate, pulse-glow, slide-up, fade-in, confetti-fall, shimmer, spin-slow), custom scrollbars
- Updated `src/app/layout.tsx` — forced dark mode, GLYPH metadata

Stage Summary:
- Brand: **GLYPH** — "Decode the Grid. Dominate the Arena."
- Color identity: teal (#2dd4bf) primary + violet (#a78bfa) accent + amber (#fbbf24) for streaks/warm + rose (#fb7185) danger. NO indigo/blue.
- Architecture: single `/` route with Zustand view router (dashboard, classic, practice, duel, party, profile, leaderboard, howto)
- Server-authoritative: secret words live only server-side; clients get color results from /api/words/validate
- Foundation ready for: backend APIs (task 2), AI features (task 3), socket mini-service (task 4), frontend components (tasks 5-7)

---
Task ID: 3
Agent: AI Features (z-ai-web-dev-sdk LLM routes)
Task: Build two server-side AI API routes — `/api/ai/explain` and `/api/ai/hint` — using the z-ai-web-dev-sdk LLM chat completions.

Work Log:
- Read worklog.md (Task 1 foundation: Prisma schema, words.ts, game.ts, types.ts, session.ts, dark theme) and invoked the `LLM` Skill to confirm exact SDK calling conventions: `import ZAI from "z-ai-web-dev-sdk"` (default export) → `await ZAI.create()` → `zai.chat.completions.create({ messages, thinking: { type: "disabled" } })` → read `completion.choices[0].message.content`. SDK runs server-side only; set `export const runtime = "nodejs"` on both routes.
- Inspected `node_modules/z-ai-web-dev-sdk/dist/index.d.ts` — confirmed `ChatMessage.role` accepts `'system' | 'user' | 'assistant'`, and `chat.completions.create` returns `Promise<any>` (so the completion is treated as `unknown` and walked via typed guards — no `any` in our code).
- Created `src/app/api/ai/explain/route.ts` (POST):
  - Validates `word` is a 5-letter alphabetic string (uppercase-normalized, `/^[A-Z]{5}$/`); 400 otherwise.
  - System prompt asks GLYPH (AI word curator) to return STRICT JSON `{word, partOfSpeech, meaning, funFact, example}` — no markdown, no commentary.
  - Parses JSON defensively (strips ```json fences, slices outermost `{…}` if model pads prose), validates keys via `unknown` + type guards.
  - In-memory cache `Map<word, {data, ts}>` with 6-hour TTL; only successful LLM results are cached (fallbacks are not cached so a later success can populate).
  - Graceful fallback on any parse/SDK/network error: `{word, partOfSpeech:"n.", meaning:"A common English word.", funFact:"Words are the building blocks of thought.", example:""}` — UI never breaks.
- Created `src/app/api/ai/hint/route.ts` (POST):
  - Validates `word` (5-letter alphabetic) and `level` (1|2|3, accepts number or string digit); 400 otherwise.
  - System prompt: "You are GLYPH's hint engine. The secret word is '{word}'. Give a hint at level {level} (1=vague, 2=specific, 3=strongest-without-revealing). NEVER output the secret word itself or spell it out. Return ONLY a JSON object {hint: string}. Max 20 words. No markdown."
  - Safety filter `hintIsSafe()` post-checks the LLM output: rejects hints containing the word (case-insensitive substring) OR letter-by-letter spellings like "c r a n e" / "c-r-a-n-e" (regex `c[\s\-]r[\s\-]a[\s\-]n[\s\-]e`). Any failure → fallback.
  - Per-level fallbacks: L1 "It's a common five-letter English word.", L2 "Think about everyday vocabulary.", L3 "Try words with common vowels."
  - In-memory cache keyed by `word|level` with 1-hour TTL; only successful+safe results cached.
- Both routes: `export async function POST(req: Request)` with `NextResponse` from `next/server`; TypeScript strict-clean, zero `any` (verified via grep); all SDK calls wrapped in try/catch; `export const dynamic = "force-dynamic"` to ensure fresh POST handling.
- Verified compilation: `npx tsc --noEmit` reports NO errors in `src/app/api/ai/` (pre-existing errors only in unrelated `examples/` and `skills/` dirs).

Stage Summary:
- Two AI routes shipped: `/api/ai/explain` (post-game word explanation) and `/api/ai/hint` (3-tier progressive practice hints that never reveal the word).
- Both use the z-ai-web-dev-sdk LLM server-side, with strict-JSON system prompts, defensive parsing, in-memory caching (6h / 1h TTLs), and graceful fallbacks so the frontend can never hard-crash on an AI failure.
- Safety: the hint route adds a redundant post-hoc filter that discards any LLM output containing the secret word or its spelled-out letters, layering defense on top of the prompt instruction.
- No files modified outside `src/app/api/ai/`. Frontend (tasks 5-7) can now `fetch('/api/ai/explain', {method:POST, body:JSON.stringify({word})})` after a game ends, and `fetch('/api/ai/hint', {method:POST, body:JSON.stringify({word, level})})` during practice.

---

Task ID: 4
Agent: socket-mini-service
Task: Standalone socket.io mini-service for real-time multiplayer (duel rooms, presence, opponent progress relay, chat, reactions)

Work Log:
- Read shared worklog (Task 1 foundation) and `examples/websocket/server.ts` for the exact server setup pattern (path `/`, cors `*`, pingTimeout 60000, pingInterval 25000, port 3003).
- Created a NEW independent Bun project at `mini-services/word-arena/` (sibling to the Next.js app, NOT inside it):
  - `mini-services/word-arena/package.json` — name `glyph-word-arena`, private, type `module`, scripts `dev` (`bun --hot index.ts`) and `start` (`bun index.ts`), dependency `socket.io@^4`.
  - `mini-services/word-arena/index.ts` — full TypeScript ESM socket.io server on port 3003.
- Ran `bun install` → resolved `socket.io@4.8.3` (+ 21 transitive packages).
- Started the service in the background (`bun run dev` → `/home/z/my-project/word-arena.log`). Verified:
  - Log shows `[word-arena] socket.io server running on port 3003`.
  - `ss -ltnp` confirms `bun` (pid 2020) LISTEN on `*:3003`.
  - Engine.io polling handshake `GET /?EIO=4&transport=polling` returns a valid `sid` with `pingInterval:25000`, `pingTimeout:60000`, `upgrades:["websocket"]`.

Design notes:
- In-memory state only (no DB): `players: Map<socketId, Player>` and `rooms: Map<roomId, Room>`.
- The secret word is NEVER sent over the socket. `game:progress` accepts only `statuses: ("correct"|"present"|"absent")[]` — letters are rejected with an error. The server generates an opaque `wordSeed` (UUID) on `game:start`; both clients use it to fetch the SAME word from the Next.js `/api/words/...` endpoint. The socket server itself never knows the word.
- Room codes are 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no ambiguous O/0/I/1). Join validates with `/^[A-Z0-9]{6}$/`.
- Duel = max 2 players per room. Host (creator) controls `game:start`. Host auto-transfers to the next occupant when the host leaves.
- Match ends (`state → finished`) when a player wins OR all players have called `game:finish`.
- Chat: content normalized (collapse whitespace, trim, truncate to 200 chars); empty messages rejected.
- Reactions: allow-list `🔥 😂 😱 👏 🤔 ⚡`; others rejected.
- Presence: global broadcast on `presence:update` and on `disconnect` (status `offline`).
- All handlers wrapped in try/catch; on failure emit `error { message }` to the offending socket — the server never crashes.
- Graceful shutdown on SIGTERM/SIGINT (`io.close` → `httpServer.close` → `process.exit(0)`).
- Logs prefixed `[word-arena]` for connections, identifies, room create/join/leave, game start/finish, presence changes, disconnects, and errors.

Frontend connection reminder:
- The Next.js app connects with `io("/?XTransformPort=3003")` (path MUST be `/`, port via query) — Caddy forwards to port 3003. The frontend should NOT pass a custom `path` option.

Stage Summary — exact event names the frontend must use:

Client → Server (emit these):
1. `player:identify`        `{ id, name, avatarSeed }`
2. `room:create`            `{ name, avatarSeed, playerId }`
3. `room:join`              `{ roomId, name, avatarSeed, playerId }`
4. `room:leave`             (no payload)
5. `room:chat`              `{ content }`                       // ≤200 chars, whitespace collapsed
6. `room:reaction`          `{ emoji }`                         // 🔥 😂 😱 👏 🤔 ⚡ only
7. `game:start`             `{ roomId }`                        // host only
8. `game:progress`          `{ roomId, attempt, statuses, final }`  // statuses: ("correct"|"present"|"absent")[] — NO letters
9. `game:typing`            `{ roomId, typing }`
10. `game:finish`           `{ roomId, won, guessesUsed, durationMs }`
11. `presence:update`       `{ status }`                        // "online"|"idle"|"playing"|"offline"

Server → Client (listen for these):
1. `player:ready`           `{ id }`
2. `room:created`           `{ roomId }`
3. `room:joined`            `{ roomId, players: PlayerPublic[] }`
4. `room:state`             `{ id, players, hostId, state, wordSeed, matchStartedAt, maxGuesses }`
5. `chat:message`           `{ id, name, avatarSeed, content, type: "user"|"system", ts }`
6. `room:reaction`          `{ name, avatarSeed, emoji, ts }`
7. `game:started`           `{ wordSeed, matchStartedAt, maxGuesses }`
8. `opponent:progress`      `{ name, avatarSeed, attempt, statuses, final }`  // color codes only
9. `opponent:typing`        `{ name, typing }`
10. `opponent:finish`       `{ name, won, guessesUsed, durationMs }`
11. `presence:changed`      `{ id, name, status }`              // global broadcast
12. `player:left`           `{ id, name }`                      // to remaining room occupants
13. `error`                 `{ message }`                       // per-socket error recovery

Files created (all under `mini-services/word-arena/`, nothing outside modified):
- `/home/z/my-project/mini-services/word-arena/package.json`
- `/home/z/my-project/mini-services/word-arena/index.ts`
- `/home/z/my-project/mini-services/word-arena/bun.lock` (auto-generated)
- `/home/z/my-project/mini-services/word-arena/node_modules/` (socket.io@4.8.3 + deps)

Service status: RUNNING on port 3003 (pid 2020, `bun --hot index.ts`). Logs at `/home/z/my-project/word-arena.log`.

---
Task ID: 5,6,7,8
Agent: Main (orchestrator)
Task: Frontend components, app shell, views, polish & Agent Browser verification

Work Log:
- Built core game components: Tile (flip/pop animations), WordleBoard, WordleKeyboard (color-state keys), OpponentBoard (color-only, never letters), GameTimer + Countdown, Confetti, WordExplain (AI meaning/example/fun-fact/hints), ResultModal (win/loss, XP/RP/streak, achievements, AI panel, share, rematch)
- Built useWordleGame hook: server-authoritative validation via /api/words/validate, physical + on-screen keyboard, flip-animation timing, win/lose detection, game-end callback
- Built useDuel hook: socket.io connection to word-arena (port 3003 via XTransformPort), room create/join, presence, progress relay (colors only), chat, reactions, AND a believable bot opponent (simulated guesses with realistic timing & color patterns) so duels are always playable
- Built app shell: Sidebar (desktop nav with player card + streak), Topbar (title, XP/streak pills, XP progress bar, avatar), sticky Footer, MobileNav (bottom bar), view router via Zustand
- Built 8 views: Dashboard (today's challenge hero w/ countdown, stat cards, rank card, recent matches, friends online, quick-play modes), Classic & Practice (single-player game w/ AI hints), Duel (lobby + live 1v1 w/ opponent panel + chat + reactions + timer), Party (live multi-bot race w/ real-time leaderboard), Profile (stats, guess distribution, streak calendar + freezes, achievements grid, rank ladder, match history), Leaderboard (podium + searchable list + friends tab), HowTo (rules, modes, features)
- Created /api/words/practice/reveal route (practice-only word reveal for AI hints; hard 403 gate for daily/duel — anti-cheat)
- Fixed Prisma StreakFreeze unique constraint; fixed lint (setState-in-effect) via useMemo confetti + key-based Countdown remount
- Fixed AI route system-prompt role (assistant → system)

Agent Browser Verification (end-to-end):
- Dashboard renders: hero, stat cards, rank, friends online (8 bots), recent matches, quick-play ✓
- Daily challenge: typed CRANE → tiles flipped to absent/correct/present, keyboard reflected states ✓
- Duel vs bot: opponent panel shows color-only progress (15 tiles = 3 bot guesses, NO letters), "letters hidden" note, chat + reactions + timer ✓
- Leaderboard: global + friends tabs, search, podium, ~13 entries, "(you)" marker ✓
- Profile: username, guess distribution bars, achievements grid, rank ladder, streak history calendar ✓
- Full game → result modal: "Grid Locked", word revealed (DRAWN), +20 XP / +4 RP / 0 streak, AI Word Insight loaded (meaning "To pull or cause to move...", example sentence, fun fact, 3 hint levels) ✓
- Stats persisted: XP updated 0→20 on dashboard after game, recent match recorded ✓
- Mobile responsive: bottom nav present, sticky footer pushed to bottom on long content ✓
- No console errors, no runtime errors, lint clean ✓
- Both services running: Next.js on :3000, word-arena socket.io on :3003 ✓

Stage Summary:
- GLYPH platform COMPLETE and fully verified end-to-end in browser
- All 5 game modes implemented: Classic (daily), Practice (unlimited + AI hints), Duel (1v1 live w/ bot + online rooms), Party (multi-bot race), How-to
- Server-authoritative security: secret words held in-memory server-side, opaque seeds, validate endpoint reveals word only on game-over, practice-only reveal gate
- AI features live: LLM word explanations + progressive hints via z-ai-web-dev-sdk
- Real-time: socket.io rooms, presence, color-only progress relay, chat, reactions
- Progression: XP/levels, 7-tier ranks, streaks (daily/win/challenge) + freezes, 8 achievements, guess distribution
- Brand: GLYPH, teal/violet neon on space-black, glassmorphism, full animation suite
