import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A metric with optional week-over-week delta.
 *
 * The delta is coloured only when it means something — a 0.2% wobble in
 * readiness is noise, and colouring it trains people to ignore colour.
 */
export interface StatTileProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  delta?: number;
  deltaThreshold?: number;
  hint?: string;
  className?: string;
}

export function StatTile({
  label,
  value,
  unit,
  delta,
  deltaThreshold = 1,
  hint,
  className,
}: StatTileProps) {
  const meaningful = delta !== undefined && Math.abs(delta) >= deltaThreshold;

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4",
        className,
      )}
    >
      <span className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">{label}</span>

      <div className="flex items-baseline gap-1.5">
        <span className="metric text-2xl font-semibold text-[var(--text)]">{value}</span>
        {unit && <span className="text-[13px] text-[var(--text-subtle)]">{unit}</span>}

        {delta !== undefined && (
          <span
            className={cn(
              "metric ml-auto text-[12px]",
              meaningful && delta > 0 && "text-[var(--success)]",
              meaningful && delta < 0 && "text-[var(--danger)]",
              !meaningful && "text-[var(--text-subtle)]",
            )}
          >
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        )}
      </div>

      {hint && <span className="text-[11px] text-[var(--text-subtle)]">{hint}</span>}
    </div>
  );
}
