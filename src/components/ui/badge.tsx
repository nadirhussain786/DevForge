import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
  {
    variants: {
      variant: {
        neutral: "bg-[var(--surface-2)] text-[var(--text-muted)]",
        outline: "border border-[var(--border-strong)] text-[var(--text-muted)]",
        forge: "bg-[var(--forge-glow)] text-[var(--forge-500)]",
        success: "bg-[var(--success)]/15 text-[var(--success)]",
        warn: "bg-[var(--warn)]/15 text-[var(--warn)]",
        danger: "bg-[var(--danger)]/15 text-[var(--danger)]",
        info: "bg-[var(--info)]/15 text-[var(--info)]",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
