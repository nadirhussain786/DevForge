import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * Content renderer for authored topic bodies.
 *
 * Reading views cap at ~72ch and run looser than the console density — see
 * docs/06-design-system.md §3. Trade-off tables get horizontal scroll rather
 * than squeezing the page.
 */
export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 text-[15px] leading-relaxed", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => <h2 className="mt-2 text-lg font-semibold tracking-tight" {...props} />,
          h2: (props) => <h3 className="mt-2 text-base font-semibold tracking-tight" {...props} />,
          h3: (props) => <h4 className="mt-2 text-sm font-semibold" {...props} />,
          p: (props) => <p className="max-w-[72ch]" {...props} />,
          ul: (props) => <ul className="ml-5 flex list-disc flex-col gap-1.5" {...props} />,
          ol: (props) => <ol className="ml-5 flex list-decimal flex-col gap-1.5" {...props} />,
          strong: (props) => <strong className="font-semibold text-[var(--text)]" {...props} />,
          a: (props) => (
            <a className="text-[var(--forge-500)] underline underline-offset-2" {...props} />
          ),
          code: ({ className: cls, children: code, ...rest }) => {
            const isBlock = /language-/.test(cls ?? "");
            if (isBlock) {
              return (
                <code className="metric block text-[13px] leading-relaxed" {...rest}>
                  {code}
                </code>
              );
            }
            return (
              <code
                className="metric rounded bg-[var(--surface-2)] px-1 py-0.5 text-[13px]"
                {...rest}
              >
                {code}
              </code>
            );
          },
          pre: (props) => (
            <pre
              className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-3"
              {...props}
            />
          ),
          table: (props) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]" {...props} />
            </div>
          ),
          th: (props) => (
            <th
              className="border-b border-[var(--border-strong)] px-3 py-2 text-left font-medium"
              {...props}
            />
          ),
          td: (props) => (
            <td className="border-b border-[var(--border)] px-3 py-2 align-top" {...props} />
          ),
          blockquote: (props) => (
            <blockquote
              className="border-l-2 border-[var(--forge-500)] pl-4 text-[var(--text-muted)]"
              {...props}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
