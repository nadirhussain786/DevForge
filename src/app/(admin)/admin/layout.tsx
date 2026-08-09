import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";

import { requireAdmin } from "@/lib/auth/session";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/insights", label: "Learning insights" },
] as const;

/**
 * The admin console is a separate route group, never a toggle on the user UI
 * (§63). Owner mode switching is explicit, and the banner is always present so
 * platform metrics can never be mistaken for personal progress.
 *
 * Authorisation here decides only what renders. RLS is the real boundary — a
 * forged session gains nothing, and `owner_only` tables stay unreadable even
 * to a genuine admin.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const ctx = await requireAdmin();

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--warn)]/40 bg-[var(--warn)]/10 px-4 py-2 text-[12px]">
        <ShieldAlert aria-hidden className="size-4 text-[var(--warn)]" />
        <span className="font-medium">Admin console</span>
        <span className="text-[var(--text-muted)]">
          Platform-wide data — not your own progress. Private notebooks and interview transcripts
          are unreadable here by database policy.
        </span>
        <Link
          href="/today"
          className="ml-auto inline-flex items-center gap-1 text-[var(--forge-500)] hover:underline"
        >
          <ArrowLeft aria-hidden className="size-3.5" /> My progress
        </Link>
      </div>

      <header className="flex h-12 items-center gap-1 border-b border-[var(--border)] bg-[var(--surface)] px-4">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-[var(--radius)] px-3 py-1.5 text-[13px] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            {item.label}
          </Link>
        ))}
        <span className="ml-auto text-[12px] text-[var(--text-subtle)]">
          {ctx.profile?.role}
        </span>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
