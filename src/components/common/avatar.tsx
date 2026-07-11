"use client";
import { avatarGradient, initials } from "@/lib/api";

interface AvatarProps {
  seed: string;
  name?: string;
  size?: number;
  status?: string;
  ring?: boolean;
  className?: string;
}

export function Avatar({
  seed,
  name,
  size = 40,
  status,
  ring,
  className = "",
}: AvatarProps) {
  const [c1, c2] = avatarGradient(seed);
  const label = name || seed;
  const initialsStr = initials(label);
  const id = `g-${seed.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <div
      className={`relative inline-flex shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        className={`rounded-xl ${ring ? "ring-2 ring-offset-2 ring-offset-background" : ""}`}
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="11" fill={`url(#${id})`} />
        <text
          x="50%"
          y="54%"
          dominantBaseline="middle"
          textAnchor="middle"
          fontSize="15"
          fontWeight="700"
          fill="#0b0b12"
          fontFamily="var(--font-geist-sans), system-ui, sans-serif"
        >
          {initialsStr}
        </text>
      </svg>
      {status ? (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-background"
          style={{
            width: Math.max(10, size * 0.3),
            height: Math.max(10, size * 0.3),
            backgroundColor:
              status === "online"
                ? "#34d399"
                : status === "playing"
                ? "#2dd4bf"
                : status === "idle"
                ? "#fbbf24"
                : "#64748b",
          }}
        />
      ) : null}
    </div>
  );
}
