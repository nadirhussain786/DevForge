"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Code2,
  Flame,
  Gauge,
  Map as MapIcon,
  NotebookPen,
  RotateCcw,
  Swords,
  Target,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/today", label: "Today", icon: Target },
  { href: "/roadmap", label: "Roadmap", icon: MapIcon },
  { href: "/learn", label: "Learn", icon: Flame },
  { href: "/code", label: "Code", icon: Code2 },
  { href: "/arena", label: "Arena", icon: Swords },
  { href: "/review", label: "Review", icon: RotateCcw },
  { href: "/notebook", label: "Notebook", icon: NotebookPen },
  { href: "/skills", label: "Skills", icon: Gauge },
  { href: "/career", label: "Career", icon: Briefcase },
] as const;

export function NavRail() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop rail */}
      <nav
        aria-label="Main"
        className="hidden w-[68px] shrink-0 flex-col gap-1 border-r border-[var(--border)] bg-[var(--surface)] py-3 md:flex xl:w-[188px]"
      >
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "mx-2 flex items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-[13px] transition-colors duration-150",
                "xl:justify-start justify-center",
                active
                  ? "bg-[var(--forge-glow)] text-[var(--forge-500)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
              )}
            >
              <Icon aria-hidden className="size-[18px] shrink-0" />
              <span className="hidden xl:inline">{label}</span>
              <span className="sr-only xl:hidden">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Mobile tab bar — the daily loop must work from a phone (§51) */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV.slice(0, 5).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px]",
                active ? "text-[var(--forge-500)]" : "text-[var(--text-muted)]",
              )}
            >
              <Icon aria-hidden className="size-5" />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
