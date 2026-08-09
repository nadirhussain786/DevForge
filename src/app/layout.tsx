import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Long-form learning content is set in a serif designed for screen reading.
 *
 * This is the single highest-leverage comfort decision in the product: a
 * learner spends hours on topic pages, and serif at a generous measure and
 * leading is measurably easier to read at length than UI sans. The interface
 * itself stays sans — headings, buttons, and tables are signposts, not prose.
 */
const readingSerif = Source_Serif_4({
  variable: "--font-reading",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "EngForge — Forge the Engineer Companies Want",
    template: "%s · EngForge",
  },
  description:
    "An engineering career operating system: personalised roadmaps, evidence-based mastery, interview simulation, and a failure-to-skill loop.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${readingSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
