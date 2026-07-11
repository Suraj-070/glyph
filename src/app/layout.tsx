import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GLYPH — Decode the Grid. Dominate the Arena.",
  description:
    "GLYPH is a futuristic multiplayer Wordle arena. Daily challenges, real-time duels, streaks, ranks, and AI-powered word insights. Crack the code. Claim the grid.",
  keywords: [
    "GLYPH", "Wordle", "multiplayer Wordle", "word game", "daily challenge",
    "duel", "puzzle", "AI word game", "competitive wordle",
  ],
  authors: [{ name: "GLYPH Arena" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "GLYPH — Decode the Grid",
    description: "Futuristic multiplayer Wordle arena with duels, streaks & ranks.",
    siteName: "GLYPH",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
