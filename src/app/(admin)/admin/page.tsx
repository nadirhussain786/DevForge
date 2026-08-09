import type { Metadata } from "next";

import { StatTile } from "@/components/ui/stat-tile";
import { getOverview } from "@/features/admin/data/analytics";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Admin · EngForge" };

export default async function AdminOverviewPage() {
  await requireAdmin();
  const o = await getOverview();

  const stickiness = o.activeThisWeek > 0 ? Math.round((o.activeToday / o.activeThisWeek) * 100) : 0;
  const onboardRate = o.totalUsers > 0 ? Math.round((o.onboarded / o.totalUsers) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <p className="mt-1 max-w-[70ch] text-[13px] text-[var(--text-muted)]">
        Built entirely from product events and aggregate progress tables. No query on this page can
        reach a private notebook, interview transcript, or pasted job description.
      </p>

      <section className="mt-6">
        <h2 className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">Users</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Total" value={o.totalUsers} />
          <StatTile label="Active today" value={o.activeToday} />
          <StatTile label="Active this week" value={o.activeThisWeek} />
          <StatTile label="New this week" value={o.newThisWeek} />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">
          Engagement
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Stickiness" value={stickiness} unit="%" hint="daily ÷ weekly active" />
          <StatTile label="Onboarded" value={onboardRate} unit="%" hint={`${o.onboarded} of ${o.totalUsers}`} />
          <StatTile label="Avg streak" value={o.avgStreak} unit="days" />
          <StatTile
            label="Study time"
            value={Math.round(o.totalStudyMinutes / 60)}
            unit="hrs"
            hint="all users, all time"
          />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">Outcomes</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Avg readiness"
            value={o.avgReadiness ?? "—"}
            unit={o.avgReadiness === null ? undefined : "%"}
            hint={o.avgReadiness === null ? "no snapshots yet" : undefined}
          />
          <StatTile label="Questions answered" value={o.questionsAnswered} />
          <StatTile label="Open weaknesses" value={o.weaknessesOpen} />
          <StatTile
            label="Weaknesses / user"
            value={o.totalUsers > 0 ? Math.round((o.weaknessesOpen / o.totalUsers) * 10) / 10 : 0}
          />
        </div>
      </section>

      {o.totalUsers <= 1 && (
        <p className="mt-8 rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] p-5 text-[13px] text-[var(--text-muted)]">
          With a single account these numbers are a smoke test, not analytics. They become
          meaningful once real users are on the platform — the point of building this now is that
          the privacy boundary is enforced from the first row, not retrofitted later.
        </p>
      )}
    </div>
  );
}
