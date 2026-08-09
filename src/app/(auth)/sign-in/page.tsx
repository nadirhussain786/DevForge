import type { Metadata } from "next";

import { signIn } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in · EngForge" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = typeof params.next === "string" && params.next.startsWith("/") ? params.next : undefined;

  return <AuthForm mode="sign-in" action={signIn} next={next} />;
}
