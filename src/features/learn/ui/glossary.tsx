"use client";

import { Fragment, createContext, useContext, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Inline glossary.
 *
 * A beginner's most common failure mode isn't difficulty — it's vocabulary. One
 * unexplained word ("sargable", "p99", "idempotent") stops the sentence dead,
 * and nothing on the page says where to look.
 *
 * Two deliberate restraints:
 *
 *   Only the FIRST occurrence of a term on a page is marked. Highlighting every
 *   instance turns prose into a minefield of underlines and trains the reader
 *   to ignore them.
 *
 *   The marking is quiet — a dotted underline, not a colour. It should be
 *   available when wanted and invisible when not.
 */

export interface GlossaryTerm {
  term: string;
  aliases: string[];
  shortDef: string;
  longDef: string | null;
  skillSlug: string | null;
}

interface GlossaryContextValue {
  /** Lowercased surface form → term. */
  index: Map<string, GlossaryTerm>;
  /** Longest-first list of surface forms, so "dead letter queue" wins over "queue". */
  surfaces: string[];
  seen: Set<string>;
}

const GlossaryContext = createContext<GlossaryContextValue | null>(null);

export function GlossaryProvider({
  terms,
  children,
}: {
  terms: GlossaryTerm[];
  children: ReactNode;
}) {
  const value = useMemo<GlossaryContextValue>(() => {
    const index = new Map<string, GlossaryTerm>();
    for (const term of terms) {
      index.set(term.term.toLowerCase(), term);
      for (const alias of term.aliases) index.set(alias.toLowerCase(), term);
    }
    // Longest first so multi-word terms match before their constituent words.
    const surfaces = [...index.keys()].sort((a, b) => b.length - a.length);
    return { index, surfaces, seen: new Set() };
  }, [terms]);

  return <GlossaryContext.Provider value={value}>{children}</GlossaryContext.Provider>;
}

export function useGlossary() {
  return useContext(GlossaryContext);
}

/** Escape a surface form for safe use inside a RegExp. */
function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits a run of text and wraps the first unseen glossary term in it.
 * Returns the original string when nothing matches, so the common case costs
 * nothing.
 */
export function annotateText(text: string, ctx: GlossaryContextValue | null): ReactNode {
  if (!ctx || text.length < 3) return text;

  for (const surface of ctx.surfaces) {
    if (ctx.seen.has(surface)) continue;

    // Word boundaries so "index" doesn't match inside "indexed".
    const pattern = new RegExp(`\\b(${escape(surface)})\\b`, "i");
    const match = pattern.exec(text);
    if (!match) continue;

    const term = ctx.index.get(surface);
    if (!term) continue;

    ctx.seen.add(surface);
    // Mark every surface form of this term as seen, or a plural would match again.
    for (const alias of [term.term, ...term.aliases]) ctx.seen.add(alias.toLowerCase());

    const before = text.slice(0, match.index);
    const matched = text.slice(match.index, match.index + match[0].length);
    const after = text.slice(match.index + match[0].length);

    return (
      <>
        {before}
        <GlossaryMark term={term} label={matched} />
        {annotateText(after, ctx)}
      </>
    );
  }

  return text;
}

/** Recursively annotates React children, leaving elements untouched. */
export function annotateChildren(children: ReactNode, ctx: GlossaryContextValue | null): ReactNode {
  if (!ctx) return children;
  if (typeof children === "string") return annotateText(children, ctx);

  if (Array.isArray(children)) {
    return children.map((child, i) => (
      <Fragment key={i}>{annotateChildren(child, ctx)}</Fragment>
    ));
  }

  return children;
}

function GlossaryMark({ term, label }: { term: GlossaryTerm; label: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-expanded={open}
        aria-label={`What does "${term.term}" mean?`}
        className={cn(
          "cursor-help border-b border-dotted border-[var(--text-subtle)] bg-transparent p-0 font-inherit text-inherit",
          "hover:border-[var(--forge-500)] hover:text-[var(--forge-600)]",
        )}
      >
        {label}
      </button>

      {open && (
        <span
          role="tooltip"
          className={cn(
            "absolute bottom-full left-0 z-30 mb-2 block w-[min(20rem,80vw)]",
            "animate-fade rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] p-3",
            "text-left font-sans text-[13px] leading-relaxed text-[var(--text)]",
            "shadow-[var(--shadow-lg)]",
          )}
        >
          <span className="block font-semibold">{term.term}</span>
          <span className="mt-1 block text-[var(--text-muted)]">{term.shortDef}</span>
          {term.longDef && (
            <span className="mt-2 block text-[12px] text-[var(--text-muted)]">{term.longDef}</span>
          )}
          {term.skillSlug && (
            <Link
              href="/skills"
              className="mt-2 block text-[12px] text-[var(--forge-500)] hover:underline"
            >
              Learn this properly →
            </Link>
          )}
        </span>
      )}
    </span>
  );
}
