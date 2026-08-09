"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

import { annotateChildren, useGlossary } from "./glossary";
import { MermaidDiagram } from "./mermaid-diagram";

/**
 * Content renderer for authored learning material.
 *
 * Three things beyond plain markdown:
 *
 *   `.reading` — serif body at a generous measure and leading, because this is
 *   where a learner spends hours and comfort compounds.
 *
 *   ```mermaid fences render as diagrams, so a mechanism can be shown as well
 *   as described.
 *
 *   Glossary terms are marked inline on first occurrence, so unfamiliar
 *   vocabulary never stops a sentence dead.
 *
 * Set `plain` for UI copy that should not be annotated or set in serif —
 * question prompts, for instance, where a tooltip would be a distraction
 * mid-assessment.
 */
export function Markdown({
  content,
  className,
  plain = false,
}: {
  content: string;
  className?: string;
  plain?: boolean;
}) {
  const glossary = useGlossary();
  const annotate = (children: React.ReactNode) =>
    plain ? children : annotateChildren(children, glossary);

  return (
    <div className={cn(plain ? "text-[15px] leading-relaxed" : "reading", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h2>{children}</h2>,
          h2: ({ children }) => <h2>{children}</h2>,
          h3: ({ children }) => <h3>{children}</h3>,
          h4: ({ children }) => <h4>{children}</h4>,

          p: ({ children }) => <p>{annotate(children)}</p>,
          li: ({ children }) => <li>{annotate(children)}</li>,

          ul: ({ children }) => (
            <ul className="ml-5 list-disc space-y-1.5 marker:text-[var(--text-subtle)]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="ml-5 list-decimal space-y-1.5 marker:text-[var(--text-subtle)]">
              {children}
            </ol>
          ),

          a: ({ children, href }) => (
            <a
              href={href}
              className="text-[var(--forge-600)] underline decoration-[var(--forge-500)]/40 underline-offset-2 hover:decoration-[var(--forge-500)]"
            >
              {children}
            </a>
          ),

          code: ({ className: cls, children }) => {
            const isBlock = /language-/.test(cls ?? "");
            if (isBlock) {
              return <code className={cn("metric text-[13px] leading-relaxed", cls)}>{children}</code>;
            }
            return (
              <code className="metric rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[0.875em] text-[var(--text)]">
                {children}
              </code>
            );
          },

          pre: ({ children }) => {
            // A ```mermaid fence becomes a rendered diagram rather than a code
            // block. Reaching into the child to find the source is unpleasant,
            // but it is the only place remark exposes the language.
            const child = (children as { props?: { className?: string; children?: unknown } })?.props;
            const language = child?.className ?? "";

            if (/language-mermaid/.test(language)) {
              const source = String(child?.children ?? "").trim();
              return <MermaidDiagram source={source} />;
            }

            return (
              <pre className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-4">
                {children}
              </pre>
            );
          },

          table: ({ children }) => (
            <div className="my-5 overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
              <table className="w-full border-collapse font-sans text-[13px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-[var(--surface-2)]">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-[var(--border-strong)] px-3 py-2 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-[var(--border)] px-3 py-2 align-top">
              {annotate(children)}
            </td>
          ),

          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[var(--forge-500)] pl-4 text-[var(--text-muted)] italic">
              {children}
            </blockquote>
          ),

          hr: () => <hr className="my-8 border-[var(--border)]" />,

          img: ({ src, alt }) => (
            <figure className="my-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={typeof src === "string" ? src : ""}
                alt={alt ?? ""}
                loading="lazy"
                className="mx-auto max-w-full rounded-[var(--radius)] border border-[var(--border)]"
              />
              {alt && (
                <figcaption className="mt-2 text-center text-[13px] text-[var(--text-muted)]">
                  {alt}
                </figcaption>
              )}
            </figure>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
