"use client";
// Discord-style mobile HUD for multiplayer:
// - OpponentBubble: fixed top-left avatar + progress; tap = mini color board popover
// - FloatingChatBubble: draggable bubble; tap = floating chat sheet
// CSS/pointer-events only — no framer-motion (mobile perf).
import { useRef, useState, useCallback, type ReactNode } from "react";
import { MessageCircle, X } from "lucide-react";
import { Avatar } from "@/components/common/avatar";
import { classNames } from "@/lib/api";
import { OpponentBoard, type OpponentRow } from "./opponent-board";

// ---------- Opponent bubble (top-left) ----------

export function OpponentBubble({
  name,
  avatarSeed,
  rows,
  maxGuesses,
  wordLength,
  typing,
  won,
  lost,
}: {
  name: string;
  avatarSeed: string;
  rows: OpponentRow[];
  maxGuesses: number;
  wordLength: number;
  typing?: boolean;
  won?: boolean;
  lost?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pct = Math.min(100, (rows.length / maxGuesses) * 100);

  return (
    <div className="lg:hidden relative z-40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center gap-2 glass-strong rounded-full pl-1 pr-3 py-1 shadow-lg active:scale-95 transition-transform"
        aria-label={`Opponent ${name}, guess ${rows.length} of ${maxGuesses}`}
      >
        <span className="relative inline-flex">
          <Avatar seed={avatarSeed} name={name} size={32} status="playing" />
          {/* progress ring */}
          <svg className="absolute -inset-0.5" viewBox="0 0 36 36" aria-hidden>
            <circle
              cx="18" cy="18" r="16.5" fill="none" strokeWidth="2.5"
              className={won ? "stroke-emerald-400" : lost ? "stroke-rose-400" : "stroke-teal"}
              strokeDasharray={`${pct} 100`}
              strokeLinecap="round"
              pathLength={100}
              transform="rotate(-90 18 18)"
              opacity="0.9"
            />
          </svg>
        </span>
        <span className="flex flex-col items-start leading-none">
          <span className="text-[11px] font-semibold max-w-[72px] truncate">{name}</span>
          <span
            className={classNames(
              "text-[9px] font-bold tabular-nums",
              won ? "text-emerald-300" : lost ? "text-rose-300" : "text-muted-foreground"
            )}
          >
            {won ? "SOLVED" : lost ? "OUT" : `${rows.length}/${maxGuesses}`}
          </span>
        </span>
        {typing ? (
          <span className="flex gap-0.5 ml-0.5" aria-label="typing">
            <span className="w-1 h-1 rounded-full bg-teal animate-bounce" />
            <span className="w-1 h-1 rounded-full bg-teal animate-bounce" style={{ animationDelay: "120ms" }} />
            <span className="w-1 h-1 rounded-full bg-teal animate-bounce" style={{ animationDelay: "240ms" }} />
          </span>
        ) : null}
      </button>

      {/* popover: color-only mini board */}
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute top-full left-0 mt-2 z-50 glass-strong rounded-xl p-3 shadow-xl animate-fade-in">
          <OpponentBoard
            rows={rows}
            maxGuesses={maxGuesses}
            wordLength={wordLength}
            typing={typing}
            won={won}
            lost={lost}
            size="sm"
          />
            <div className="mt-2 text-[9px] text-center text-muted-foreground">🔒 colors only</div>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ---------- Draggable floating chat ----------

export function FloatingChatBubble({
  unread,
  children,
}: {
  unread: number;
  children: ReactNode; // chat panel content rendered in the sheet
}) {
  const [open, setOpen] = useState(false);
  // bubble position: offsets from bottom-right
  const [pos, setPos] = useState({ right: 12, bottom: 132 });
  const drag = useRef<{
    startX: number; startY: number;
    right: number; bottom: number;
    moved: boolean; id: number;
  } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      startX: e.clientX, startY: e.clientY,
      right: pos.right, bottom: pos.bottom,
      moved: false, id: e.pointerId,
    };
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 6) return; // tap tolerance
    d.moved = true;
    const vw = window.innerWidth, vh = window.innerHeight;
    setPos({
      right: Math.min(vw - 56, Math.max(4, d.right - dx)),
      bottom: Math.min(vh - 56, Math.max(4, d.bottom - dy)),
    });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) setOpen(true); // tap = open
    else {
      // snap to nearest horizontal edge (Discord behaviour)
      setPos((p) => ({
        ...p,
        right: p.right < window.innerWidth / 2 - 28 ? 12 : window.innerWidth - 56 - 12,
      }));
    }
  }, []);

  return (
    <>
      {/* bubble */}
      {!open ? (
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="lg:hidden fixed z-40 h-12 w-12 rounded-full glass-strong shadow-lg flex items-center justify-center active:scale-95 transition-transform touch-none"
          style={{ right: pos.right, bottom: pos.bottom }}
          aria-label={`Open chat${unread ? `, ${unread} unread` : ""}`}
        >
          <MessageCircle className="h-5 w-5 text-teal" />
          {unread > 0 ? (
            <span className="absolute -top-1 -right-1 min-w-4.5 h-4.5 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      ) : null}

      {/* floating sheet */}
      {open ? (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40 animate-fade-in"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-2 right-2 bottom-2 max-h-[60dvh] glass-strong rounded-2xl shadow-2xl flex flex-col animate-slide-up pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Match chat
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-7 w-7 rounded-full glass flex items-center justify-center active:scale-95"
                aria-label="Close chat"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden px-1 pb-1">{children}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
