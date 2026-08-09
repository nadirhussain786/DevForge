import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center px-4">
        <Link href="/" className="flex items-center gap-2">
          <span
            aria-hidden
            className="grid size-6 place-items-center rounded-[6px] bg-[var(--forge-500)] text-[13px] font-bold text-[var(--on-forge)]"
          >
            E
          </span>
          <span className="text-sm font-semibold tracking-tight">EngForge</span>
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">{children}</main>
    </div>
  );
}
