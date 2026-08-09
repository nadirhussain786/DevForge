"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Beaker,
  Briefcase,
  Code2,
  Flame,
  Gauge,
  Map as MapIcon,
  NotebookPen,
  RotateCcw,
  Search,
  Swords,
  Target,
  User,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Command palette (§54). Cmd/Ctrl-K.
 *
 * Commands first, then search results as you type. The command list is static
 * and instant; search is debounced and hits an RLS-scoped endpoint, so private
 * notes appear for their owner and for nobody else.
 */

interface Command {
  id: string;
  label: string;
  href: string;
  icon: typeof Target;
  keywords?: string;
}

const COMMANDS: Command[] = [
  { id: "today", label: "Start today's mission", href: "/today", icon: Target, keywords: "mission daily plan" },
  { id: "roadmap", label: "Open roadmap", href: "/roadmap", icon: MapIcon, keywords: "plan weeks" },
  { id: "learn", label: "Browse topics", href: "/learn", icon: Flame, keywords: "read study" },
  { id: "arena", label: "Start an interview drill", href: "/arena", icon: Swords, keywords: "questions practice test" },
  { id: "review", label: "Review what's due", href: "/review", icon: RotateCcw, keywords: "revision weakness spaced" },
  { id: "code", label: "Practice coding", href: "/code", icon: Code2, keywords: "dsa algorithms build" },
  { id: "notebook", label: "Open notebook", href: "/notebook", icon: NotebookPen, keywords: "research notes" },
  { id: "lab", label: "Start an experiment", href: "/notebook", icon: Beaker, keywords: "r&d lab hypothesis" },
  { id: "skills", label: "View skills and mastery", href: "/skills", icon: Gauge, keywords: "readiness evidence" },
  { id: "career", label: "Career and interviews", href: "/career", icon: Briefcase, keywords: "applications jobs log interview" },
  { id: "profile", label: "Profile and achievements", href: "/profile", icon: User, keywords: "xp level streak badges" },
];

interface Hit {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset when opening, in the event handler rather than an effect keyed on
  // `open` — setting state inside an effect body triggers a cascading render.
  const openPalette = useCallback(() => {
    setQuery("");
    setHits([]);
    setActive(0);
    setOpen(true);
    // Focus after the dialog paints, or the caret lands nowhere.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((wasOpen) => {
          if (wasOpen) return false;
          openPalette();
          return true;
        });
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPalette]);

  useEffect(() => {
    // Too short to search: nothing to fetch, and `visibleHits` below already
    // hides any stale results, so there is no state to clear here.
    if (query.trim().length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        setHits(data.hits ?? []);
      } catch {
        // Aborted or offline — leave the previous results rather than flashing.
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const filteredCommands = COMMANDS.filter((c) =>
    query.trim().length === 0
      ? true
      : `${c.label} ${c.keywords ?? ""}`.toLowerCase().includes(query.toLowerCase()),
  );

  // Derived, not stored: a query shorter than the search threshold hides stale
  // results without an effect having to clear them.
  const visibleHits = query.trim().length < 2 ? [] : hits;

  const rows = [
    ...filteredCommands.map((c) => ({ kind: "command" as const, ...c })),
    ...visibleHits.map((h) => ({ kind: "hit" as const, ...h })),
  ];

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3">
          <Search aria-hidden className="size-4 text-[var(--text-subtle)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, rows.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && rows[active]) {
                e.preventDefault();
                go(rows[active].href);
              }
            }}
            placeholder="Search topics, notes, problems — or jump somewhere"
            className="h-11 flex-1 bg-transparent text-sm outline-none"
          />
          <kbd className="metric rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-subtle)]">
            esc
          </kbd>
        </div>

        <ul className="max-h-[52vh] overflow-y-auto py-1">
          {rows.length === 0 && (
            <li className="px-4 py-6 text-center text-[13px] text-[var(--text-subtle)]">
              Nothing matches that.
            </li>
          )}

          {rows.map((row, i) => {
            const Icon = row.kind === "command" ? row.icon : Search;
            return (
              <li key={`${row.kind}-${row.id}`}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(row.href)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left text-[13px]",
                    i === active ? "bg-[var(--surface-2)]" : "",
                  )}
                >
                  <Icon aria-hidden className="size-4 shrink-0 text-[var(--text-subtle)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {row.kind === "command" ? row.label : row.title}
                    </span>
                    {row.kind === "hit" && row.subtitle && (
                      <span className="block truncate text-[11px] text-[var(--text-subtle)]">
                        {row.subtitle}
                      </span>
                    )}
                  </span>
                  {row.kind === "hit" && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--text-subtle)]">
                      {row.type}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
