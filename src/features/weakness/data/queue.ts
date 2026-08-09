import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface DueRevisionItem {
  id: string;
  skillId: string;
  skillName: string;
  weaknessId: string | null;
  itemRefType: string;
  itemRefId: string | null;
  dueAt: string;
  intervalDays: number;
  ease: number;
  repetitions: number;
  /** Negative means overdue. */
  daysUntilDue: number;
}

export interface OpenWeakness {
  id: string;
  skillId: string;
  skillName: string;
  domainName: string;
  severity: number;
  status: string;
  openedAt: string;
  reason: string;
  researchTask: { id: string; prompt: string; status: string } | null;
  revisionCount: number;
  revisionDone: number;
}

export async function getDueRevision(userId: string, now = new Date()): Promise<DueRevisionItem[]> {
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("revision_items")
    .select("id, skill_id, weakness_id, item_ref_type, item_ref_id, due_at, interval_days, ease, repetitions")
    .eq("user_id", userId)
    .is("retired_at", null)
    .lte("due_at", now.toISOString())
    .order("due_at");

  if (!items?.length) return [];

  const { data: skills } = await supabase
    .from("skills")
    .select("id, name")
    .in("id", [...new Set(items.map((i) => i.skill_id))]);
  const nameById = new Map((skills ?? []).map((s) => [s.id, s.name]));

  return items.map((i) => ({
    id: i.id,
    skillId: i.skill_id,
    skillName: nameById.get(i.skill_id) ?? "Skill",
    weaknessId: i.weakness_id,
    itemRefType: i.item_ref_type,
    itemRefId: i.item_ref_id,
    dueAt: i.due_at,
    intervalDays: i.interval_days,
    ease: Number(i.ease),
    repetitions: i.repetitions,
    daysUntilDue: Math.round((new Date(i.due_at).getTime() - now.getTime()) / 86_400_000),
  }));
}

export async function getOpenWeaknesses(userId: string): Promise<OpenWeakness[]> {
  const supabase = await createClient();

  const { data: weaknesses } = await supabase
    .from("weaknesses")
    .select("id, skill_id, severity, status, opened_at, evidence")
    .eq("user_id", userId)
    .in("status", ["open", "researching", "retesting"])
    .order("severity", { ascending: false })
    .order("opened_at");

  if (!weaknesses?.length) return [];

  const skillIds = [...new Set(weaknesses.map((w) => w.skill_id))];
  const weaknessIds = weaknesses.map((w) => w.id);

  const [{ data: skills }, { data: domains }, { data: tasks }, { data: revisions }] =
    await Promise.all([
      supabase.from("skills").select("id, name, domain_id").in("id", skillIds),
      supabase.from("domains").select("id, name"),
      supabase
        .from("research_tasks")
        .select("id, weakness_id, prompt_md, status")
        .in("weakness_id", weaknessIds),
      supabase
        .from("revision_items")
        .select("id, weakness_id, repetitions, last_result")
        .in("weakness_id", weaknessIds),
    ]);

  const skillById = new Map((skills ?? []).map((s) => [s.id, s]));
  const domainById = new Map((domains ?? []).map((d) => [d.id, d.name]));
  const taskByWeakness = new Map((tasks ?? []).map((t) => [t.weakness_id, t]));

  return weaknesses.map((w) => {
    const skill = skillById.get(w.skill_id);
    const mine = (revisions ?? []).filter((r) => r.weakness_id === w.id);
    const task = taskByWeakness.get(w.id);
    const evidence = (w.evidence ?? {}) as { reason?: string };

    return {
      id: w.id,
      skillId: w.skill_id,
      skillName: skill?.name ?? "Skill",
      domainName: domainById.get(skill?.domain_id ?? "") ?? "",
      severity: w.severity,
      status: w.status,
      openedAt: w.opened_at,
      reason: evidence.reason ?? "Scored below the pass threshold.",
      researchTask: task ? { id: task.id, prompt: task.prompt_md, status: task.status } : null,
      revisionCount: mine.length,
      revisionDone: mine.filter((r) => r.last_result === true).length,
    };
  });
}
