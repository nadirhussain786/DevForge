import { CommandPalette } from "@/components/shell/command-palette";
import { NavRail } from "@/components/shell/nav-rail";
import { TopBar } from "@/components/shell/top-bar";
import { requireSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireSessionContext();
  const supabase = await createClient();

  const [{ data: progress }, { data: streak }] = await Promise.all([
    supabase.from("user_progress").select("total_xp").eq("user_id", ctx.userId).maybeSingle(),
    supabase
      .from("streaks")
      .select("current_streak, shields")
      .eq("user_id", ctx.userId)
      .maybeSingle(),
  ]);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        displayName={ctx.profile?.display_name ?? null}
        totalXp={progress?.total_xp ?? 0}
        currentStreak={streak?.current_streak ?? 0}
        shields={streak?.shields ?? 0}
      />

      <div className="flex flex-1">
        <NavRail />
        {/* pb-20 clears the mobile tab bar. */}
        <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>
      </div>

      <CommandPalette />
    </div>
  );
}
