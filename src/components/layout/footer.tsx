"use client";
import { Github, Heart } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-white/5 glass">
      <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-md bg-gradient-to-br from-teal to-violet flex items-center justify-center font-black text-black text-[10px]">
            G
          </div>
          <span className="font-semibold text-foreground">GLYPH</span>
          <span>· Decode the Grid. Dominate the Arena.</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3 text-rose-400" /> Built for word warriors
          </span>
          <span className="flex items-center gap-1">
            <Github className="h-3 w-3" /> v1.0 · Next.js 16
          </span>
        </div>
      </div>
    </footer>
  );
}
