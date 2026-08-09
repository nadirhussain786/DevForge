"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { AuthState } from "./actions";

export interface AuthFormProps {
  mode: "sign-in" | "sign-up";
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  next?: string;
}

export function AuthForm({ mode, action, next }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, {} as AuthState);
  const isSignIn = mode === "sign-in";

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">
          {isSignIn ? "Sign in to EngForge" : "Create your account"}
        </h1>
        <p className="text-[13px] text-[var(--text-muted)]">
          {isSignIn
            ? "Pick up where your roadmap left off."
            : "Six questions, then your first mission."}
        </p>
      </div>

      {next && <input type="hidden" name="next" value={next} />}

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="h-9 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={isSignIn ? "current-password" : "new-password"}
          className="h-9 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm"
        />
      </label>

      {state.error && (
        <p role="alert" className="text-[13px] text-[var(--danger)]">
          {state.error}
        </p>
      )}

      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Working…" : isSignIn ? "Sign in" : "Create account"}
      </Button>

      <p className="text-[13px] text-[var(--text-muted)]">
        {isSignIn ? (
          <>
            No account?{" "}
            <Link href="/sign-up" className="text-[var(--forge-500)] hover:underline">
              Create one
            </Link>
          </>
        ) : (
          <>
            Already have one?{" "}
            <Link href="/sign-in" className="text-[var(--forge-500)] hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
