import { cn } from "@/lib/utils";

import type { SkillRank } from "../domain/mastery";

/**
 * Mastery with an explicit confidence band.
 *
 * The band is the point: a wide band visibly means "we don't have enough
 * evidence to trust this number yet". Showing 82% with no qualifier would be
 * false precision, which is exactly what the readiness model exists to avoid.
 *
 * The heat scale is reserved for mastery. Never reuse it for status or severity.
 */

const RANK_HEAT: Record<SkillRank, string> = {
  novice: "var(--heat-0)",
  familiar: "var(--heat-1)",
  working: "var(--heat-2)",
  proficient: "var(--heat-3)",
  strong: "var(--heat-4)",
  expert: "var(--heat-5)",
};

export const RANK_LABEL: Record<SkillRank, string> = {
  novice: "Novice",
  familiar: "Familiar",
  working: "Working",
  proficient: "Proficient",
  strong: "Strong",
  expert: "Expert",
};

export interface HeatBarProps {
  mastery: number;
  confidence: number;
  rank: SkillRank;
  label?: string;
  showBand?: boolean;
  className?: string;
}

export function HeatBar({
  mastery,
  confidence,
  rank,
  label,
  showBand = true,
  className,
}: HeatBarProps) {
  const pct = Math.max(0, Math.min(100, mastery));
  // Low confidence → wide band. At confidence 1 the band collapses to nothing.
  const bandWidth = showBand ? (1 - confidence) * 25 : 0;
  const bandStart = Math.max(0, pct - bandWidth / 2);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[13px] text-[var(--text)]">{label}</span>
          <span className="metric shrink-0 text-[13px] text-[var(--text-muted)]">
            {Math.round(pct)}
            <span className="text-[var(--text-subtle)]">%</span>
          </span>
        </div>
      )}

      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--surface-3)]"
        role="meter"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label ?? "Mastery"}: ${Math.round(pct)} percent, ${RANK_LABEL[rank]}, confidence ${Math.round(confidence * 100)} percent`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-250"
          style={{ width: `${pct}%`, background: RANK_HEAT[rank] }}
        />
        {bandWidth > 0.5 && (
          <div
            className="absolute inset-y-0 rounded-full opacity-40"
            style={{
              left: `${bandStart}%`,
              width: `${Math.min(bandWidth, 100 - bandStart)}%`,
              background: `repeating-linear-gradient(90deg, ${RANK_HEAT[rank]} 0 2px, transparent 2px 4px)`,
            }}
          />
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-[var(--text-subtle)]">
        <span>{RANK_LABEL[rank]}</span>
        {showBand && (
          <span className="metric">
            {confidence < 0.35
              ? "low confidence — needs more evidence"
              : `${Math.round(confidence * 100)}% confidence`}
          </span>
        )}
      </div>
    </div>
  );
}
