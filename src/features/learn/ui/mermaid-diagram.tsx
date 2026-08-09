"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Renders a Mermaid diagram, themed to the app palette in both light and dark.
 *
 * Mermaid is imported dynamically: it is a large dependency, and most pages
 * never show a diagram. Loading it eagerly would tax every route for the
 * benefit of a few.
 */

function readToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function MermaidDiagram({
  source,
  caption,
  className,
}: {
  source: string;
  caption?: string | null;
  className?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          fontFamily: readToken("--font-geist-sans", "sans-serif"),
          themeVariables: {
            background: "transparent",
            primaryColor: readToken("--surface-2", "#f4f4f5"),
            primaryTextColor: readToken("--text", "#18181b"),
            primaryBorderColor: readToken("--border-strong", "#d4d4d8"),
            lineColor: readToken("--text-subtle", "#a1a1aa"),
            secondaryColor: readToken("--surface-3", "#e4e4e7"),
            tertiaryColor: readToken("--surface", "#ffffff"),
            fontSize: "14px",
          },
        });

        const { svg } = await mermaid.render(`m${id}`, source);
        if (cancelled || !containerRef.current) return;

        containerRef.current.innerHTML = svg;
        setRendered(true);
      } catch (e) {
        if (cancelled) return;
        // A broken diagram must never take the lesson down with it — show the
        // source so the content is still readable and the author can see why.
        setError(e instanceof Error ? e.message : "Diagram could not be rendered");
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [source, id]);

  if (error) {
    return (
      <figure className={cn("my-6", className)}>
        <pre className="metric overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-4 text-[12px]">
          {source}
        </pre>
        <figcaption className="mt-2 text-[12px] text-[var(--text-subtle)]">
          Diagram could not be rendered — showing the source. ({error})
        </figcaption>
      </figure>
    );
  }

  return (
    <figure className={cn("my-6", className)}>
      <div
        className={cn(
          "overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5",
          "flex justify-center",
          rendered ? "animate-fade" : "min-h-[120px]",
        )}
      >
        <div ref={containerRef} aria-hidden={!rendered} />
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-[13px] text-[var(--text-muted)]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
