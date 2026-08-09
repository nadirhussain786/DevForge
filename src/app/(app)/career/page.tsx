import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/ui/stat-tile";
import { advanceApplication } from "@/features/career/actions";
import { InterviewForm } from "@/features/career/ui/interview-form";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Career · EngForge" };

/** The pipeline from §48, in the order a real search moves through it. */
const PIPELINE = [
  ["saved", "Saved"],
  ["preparing", "Preparing"],
  ["applied", "Applied"],
  ["recruiter_screen", "Recruiter"],
  ["technical_screen", "Tech screen"],
  ["technical_interview", "Technical"],
  ["system_design", "System design"],
  ["behavioral", "Behavioural"],
  ["final", "Final"],
  ["offer", "Offer"],
] as const;

const TERMINAL = new Set(["offer", "rejected", "withdrawn"]);

export default async function CareerPage() {
  const ctx = await requireOnboarded();
  const supabase = await createClient();

  const [{ data: applications }, { data: interviews }, { data: skills }, { data: companies }] =
    await Promise.all([
      supabase
        .from("applications")
        .select("id, company_id, role_title, status, applied_at, next_event_at")
        .eq("user_id", ctx.userId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("interview_records")
        .select("id, company_id, role_title, stage, occurred_at, outcome, confidence")
        .eq("user_id", ctx.userId)
        .order("occurred_at", { ascending: false })
        .limit(20),
      supabase.from("skills").select("id, name").eq("status", "published").order("name"),
      supabase.from("companies").select("id, name"),
    ]);

  const companyName = new Map((companies ?? []).map((c) => [c.id, c.name]));
  const active = (applications ?? []).filter((a) => !TERMINAL.has(a.status));

  const { count: questionCount } = await supabase
    .from("interview_record_questions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.userId);

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-6 md:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Career</h1>
        <p className="max-w-[70ch] text-[13px] text-[var(--text-muted)]">
          Your pipeline and your interview memory. Every real interview question you record becomes
          the strongest evidence in your readiness model — and every one that went badly becomes a
          study plan.
        </p>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Active applications" value={active.length} />
        <StatTile label="Interviews logged" value={interviews?.length ?? 0} />
        <StatTile label="Questions recorded" value={questionCount ?? 0} />
        <StatTile
          label="Offers"
          value={(applications ?? []).filter((a) => a.status === "offer").length}
        />
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Pipeline</h2>
        {!applications?.length ? (
          <p className="mt-2 text-[13px] text-[var(--text-muted)]">
            No applications yet. Career Mode becomes the primary surface once Phase 1 is complete.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {applications.map((a) => {
              const index = PIPELINE.findIndex(([s]) => s === a.status);
              const next = index > -1 ? PIPELINE[index + 1] : null;

              return (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">{a.role_title}</span>
                    <span className="block text-[12px] text-[var(--text-subtle)]">
                      {a.company_id ? companyName.get(a.company_id) : "No company"}
                      {a.applied_at ? ` · applied ${a.applied_at}` : ""}
                    </span>
                  </span>

                  <Badge
                    variant={
                      a.status === "offer"
                        ? "success"
                        : a.status === "rejected"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {a.status.replace(/_/g, " ")}
                  </Badge>

                  {next && (
                    <form action={advanceApplication}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="status" value={next[0]} />
                      <Button type="submit" size="sm" variant="outline">
                        → {next[1]}
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <h2 className="text-sm font-semibold">Interview memory</h2>
          <div className="mt-3">
            <InterviewForm skills={skills ?? []} />
          </div>
        </div>

        <aside>
          <h2 className="text-sm font-semibold">Recent interviews</h2>
          {!interviews?.length ? (
            <p className="mt-2 text-[13px] text-[var(--text-muted)]">
              Nothing recorded yet.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {interviews.map((i) => (
                <li
                  key={i.id}
                  className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium">{i.role_title}</span>
                    <Badge variant="outline">{i.stage.replace(/_/g, " ")}</Badge>
                  </div>
                  <p className="mt-0.5 text-[12px] text-[var(--text-subtle)]">
                    {i.company_id ? `${companyName.get(i.company_id)} · ` : ""}
                    {i.occurred_at}
                    {i.outcome ? ` · ${i.outcome}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </section>
    </div>
  );
}
