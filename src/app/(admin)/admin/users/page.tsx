import type { Metadata } from "next";
import { Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Users · EngForge" };

/**
 * User inspection (§32, §65).
 *
 * Deliberately shows progress, scores, and activity — never prose. There is no
 * query here for `research_notes`, `mock_interview_turns`,
 * `interview_records.notes_md`, or `job_descriptions.raw_text`, and RLS would
 * refuse most of them regardless of what this page asked for.
 */
export default async function AdminUsersPage() {
  await requireAdmin();
  const db = createAdminClient();

  const [{ data: profiles }, { data: careers }, { data: streaks }, { data: progress }, { data: weaknesses }, { data: tracks }] =
    await Promise.all([
      db
        .from("profiles")
        .select("id, display_name, role, created_at, last_active_at, deleted_at")
        .order("created_at", { ascending: false })
        .limit(200),
      db.from("career_profiles").select("user_id, role_track_id, phase, daily_minutes, onboarding_completed_at"),
      db.from("streaks").select("user_id, current_streak, longest_streak, total_minutes"),
      db.from("user_progress").select("user_id, total_xp, level_name"),
      db.from("weaknesses").select("user_id, status"),
      db.from("role_tracks").select("id, name"),
    ]);

  const careerBy = new Map((careers ?? []).map((c) => [c.user_id, c]));
  const streakBy = new Map((streaks ?? []).map((s) => [s.user_id, s]));
  const progressBy = new Map((progress ?? []).map((p) => [p.user_id, p]));
  const trackName = new Map((tracks ?? []).map((t) => [t.id, t.name]));

  const openWeaknessBy = new Map<string, number>();
  for (const w of weaknesses ?? []) {
    if (w.status === "resolved" || w.status === "dismissed") continue;
    openWeaknessBy.set(w.user_id, (openWeaknessBy.get(w.user_id) ?? 0) + 1);
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[var(--text-muted)]">
        <Lock aria-hidden className="size-3.5" />
        Progress and scores only. Private notebooks, interview transcripts, and pasted job
        descriptions are not readable from here.
      </p>

      <div className="mt-5 overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
        <table className="w-full border-collapse text-[13px]">
          <thead className="bg-[var(--surface-2)]">
            <tr>
              {["User", "Track", "Phase", "Level", "XP", "Streak", "Minutes", "Open weaknesses", "Last active"].map(
                (h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-medium text-[var(--text-muted)]">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {(profiles ?? []).map((p) => {
              const career = careerBy.get(p.id);
              const streak = streakBy.get(p.id);
              const prog = progressBy.get(p.id);

              return (
                <tr key={p.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span>{p.display_name ?? <em className="text-[var(--text-subtle)]">no name</em>}</span>
                      {p.role !== "user" && <Badge variant="warn">{p.role}</Badge>}
                      {p.deleted_at && <Badge variant="neutral">deleted</Badge>}
                      {!career?.onboarding_completed_at && !p.deleted_at && (
                        <Badge variant="outline">onboarding</Badge>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">
                    {career?.role_track_id ? trackName.get(career.role_track_id) : "—"}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{career?.phase ?? "—"}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{prog?.level_name ?? "—"}</td>
                  <td className="metric px-3 py-2">{prog?.total_xp ?? 0}</td>
                  <td className="metric px-3 py-2">{streak?.current_streak ?? 0}</td>
                  <td className="metric px-3 py-2">{streak?.total_minutes ?? 0}</td>
                  <td className="metric px-3 py-2">{openWeaknessBy.get(p.id) ?? 0}</td>
                  <td className="metric px-3 py-2 text-[var(--text-subtle)]">
                    {p.last_active_at ? p.last_active_at.slice(0, 10) : "never"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(profiles?.length ?? 0) === 0 && (
        <p className="mt-4 text-[13px] text-[var(--text-muted)]">No users yet.</p>
      )}
    </div>
  );
}
