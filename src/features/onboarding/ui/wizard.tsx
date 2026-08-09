"use client";

import { useActionState, useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { completeOnboarding, type OnboardingState } from "../actions";
import {
  DAILY_MINUTE_OPTIONS,
  EXPERIENCE_LEVELS,
  MARKETS,
  WEEKDAYS,
  type OnboardingInput,
} from "../schema";

export interface WizardProps {
  roleTracks: Array<{ slug: string; name: string; description: string | null }>;
  skills: Array<{ slug: string; name: string }>;
  defaultStartDate: string;
}

type Draft = Partial<OnboardingInput>;

const STEP_TITLES = [
  "What role are you targeting?",
  "What's your experience level?",
  "Where do you want to work?",
  "Which companies interest you?",
  "How much time can you study?",
  "What do you already know?",
] as const;

export function OnboardingWizard({ roleTracks, skills, defaultStartDate }: WizardProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({
    targetMarkets: [],
    companies: [],
    studyDays: [1, 2, 3, 4, 5],
    knownSkillSlugs: [],
    dailyMinutes: 60,
  });
  const [companyInput, setCompanyInput] = useState("");
  const [state, formAction, pending] = useActionState(completeOnboarding, {} as OnboardingState);

  const set = (patch: Draft) => setDraft((d) => ({ ...d, ...patch }));
  const toggle = <K extends keyof Draft>(key: K, value: string | number) =>
    setDraft((d) => {
      const list = (d[key] as unknown as Array<string | number>) ?? [];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...d, [key]: next } as Draft;
    });

  // Only role and time are mandatory — the engine has sane defaults for the rest.
  const canAdvance = [
    Boolean(draft.roleTrackSlug),
    Boolean(draft.experienceLevel),
    (draft.targetMarkets?.length ?? 0) > 0,
    true,
    Boolean(draft.dailyMinutes) && (draft.studyDays?.length ?? 0) > 0,
    true,
  ][step];

  const isLast = step === STEP_TITLES.length - 1;

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10">
      <div className="flex items-center gap-2">
        {STEP_TITLES.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-250",
              i <= step ? "bg-[var(--forge-500)]" : "bg-[var(--surface-3)]",
            )}
          />
        ))}
      </div>

      <p className="mt-6 text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">
        Step {step + 1} of {STEP_TITLES.length}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{STEP_TITLES[step]}</h1>

      <form action={formAction} className="mt-6">
        {/* Every answer travels as hidden fields so the whole wizard submits at once. */}
        <input type="hidden" name="roleTrackSlug" value={draft.roleTrackSlug ?? ""} />
        <input type="hidden" name="experienceLevel" value={draft.experienceLevel ?? "junior"} />
        <input type="hidden" name="dailyMinutes" value={draft.dailyMinutes ?? 60} />
        <input type="hidden" name="startDate" value={defaultStartDate} />
        <input type="hidden" name="weeks" value={8} />
        {draft.targetMarkets?.map((m) => <input key={m} type="hidden" name="targetMarkets" value={m} />)}
        {draft.studyDays?.map((d) => <input key={d} type="hidden" name="studyDays" value={d} />)}
        {draft.companies?.map((c) => <input key={c} type="hidden" name="companies" value={c} />)}
        {draft.knownSkillSlugs?.map((s) => (
          <input key={s} type="hidden" name="knownSkillSlugs" value={s} />
        ))}

        <div className="min-h-[280px]">
          {step === 0 && (
            <div className="flex flex-col gap-2">
              {roleTracks.map((t) => (
                <Choice
                  key={t.slug}
                  selected={draft.roleTrackSlug === t.slug}
                  onClick={() => set({ roleTrackSlug: t.slug })}
                  title={t.name}
                  hint={t.description ?? undefined}
                />
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-2">
              {EXPERIENCE_LEVELS.map((l) => (
                <Choice
                  key={l.value}
                  selected={draft.experienceLevel === l.value}
                  onClick={() => set({ experienceLevel: l.value })}
                  title={l.label}
                  hint={l.hint}
                />
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-2 gap-2">
              {MARKETS.map((m) => (
                <Choice
                  key={m.value}
                  selected={draft.targetMarkets?.includes(m.value) ?? false}
                  onClick={() => toggle("targetMarkets", m.value)}
                  title={m.label}
                />
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  value={companyInput}
                  onChange={(e) => setCompanyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const name = companyInput.trim();
                    if (!name || draft.companies?.includes(name)) return;
                    set({ companies: [...(draft.companies ?? []), name] });
                    setCompanyInput("");
                  }}
                  placeholder="Type a company and press Enter"
                  className="h-9 flex-1 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {(draft.companies ?? []).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set({ companies: draft.companies?.filter((x) => x !== c) })}
                    className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-[13px] hover:bg-[var(--surface-3)]"
                  >
                    {c} ×
                  </button>
                ))}
              </div>
              <p className="text-[13px] text-[var(--text-muted)]">
                Optional. Target companies shape which job descriptions inform your plan later.
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="mb-2 text-[13px] font-medium">Minutes per day</p>
                <div className="grid grid-cols-3 gap-2">
                  {DAILY_MINUTE_OPTIONS.map((m) => (
                    <Choice
                      key={m}
                      selected={draft.dailyMinutes === m}
                      onClick={() => set({ dailyMinutes: m })}
                      title={`${m} min`}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[13px] font-medium">Study days</p>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggle("studyDays", d.value)}
                      className={cn(
                        "h-9 w-14 rounded-[var(--radius)] border text-[13px]",
                        draft.studyDays?.includes(d.value)
                          ? "border-[var(--forge-500)] bg-[var(--forge-glow)] text-[var(--forge-500)]"
                          : "border-[var(--border-strong)] text-[var(--text-muted)]",
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[12px] text-[var(--text-subtle)]">
                  Days you don&apos;t pick never break your streak.
                </p>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {skills.map((s) => (
                  <button
                    key={s.slug}
                    type="button"
                    onClick={() => toggle("knownSkillSlugs", s.slug)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[13px]",
                      draft.knownSkillSlugs?.includes(s.slug)
                        ? "border-[var(--forge-500)] bg-[var(--forge-glow)] text-[var(--forge-500)]"
                        : "border-[var(--border-strong)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]",
                    )}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
              <p className="text-[13px] text-[var(--text-muted)]">
                This sets a starting point, not a score. Claiming a skill starts you at
                &ldquo;Familiar&rdquo; — everything above that has to be earned with evidence.
              </p>
            </div>
          )}
        </div>

        {state.error && (
          <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
            {state.error}
          </p>
        )}

        <div className="mt-6 flex items-center gap-2">
          {step > 0 && (
            <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft aria-hidden /> Back
            </Button>
          )}

          <div className="ml-auto">
            {isLast ? (
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? "Building your roadmap…" : "Generate my roadmap"}
                <Check aria-hidden />
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                disabled={!canAdvance}
                onClick={() => setStep((s) => s + 1)}
              >
                Continue <ArrowRight aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function Choice({
  selected,
  onClick,
  title,
  hint,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex flex-col items-start rounded-[var(--radius)] border px-4 py-3 text-left transition-colors duration-150",
        selected
          ? "border-[var(--forge-500)] bg-[var(--forge-glow)]"
          : "border-[var(--border-strong)] hover:bg-[var(--surface-2)]",
      )}
    >
      <span className="text-[13px] font-medium">{title}</span>
      {hint && <span className="mt-0.5 text-[12px] text-[var(--text-muted)]">{hint}</span>}
    </button>
  );
}
