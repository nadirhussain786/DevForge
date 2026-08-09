import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteNote } from "@/features/notebook/actions";
import { NoteEditor } from "@/features/notebook/ui/note-editor";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Note · EngForge" };

export default async function NotePage({ params }: PageProps<"/notebook/[id]">) {
  const { id } = await params;
  const ctx = await requireOnboarded();
  const supabase = await createClient();

  // RLS already scopes this to the owner; the explicit user_id filter makes
  // the intent obvious at the call site rather than relying on the policy.
  const { data: note } = await supabase
    .from("research_notes")
    .select("*")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (!note) notFound();

  const { data: skills } = await supabase
    .from("skills")
    .select("id, name")
    .eq("status", "published")
    .order("name");

  return (
    <div className="mx-auto w-full max-w-[820px] px-4 py-6 md:px-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/notebook"
          className="inline-flex items-center gap-1 text-[12px] text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <ArrowLeft aria-hidden className="size-3.5" /> Notebook
        </Link>

        <form action={deleteNote}>
          <input type="hidden" name="id" value={note.id} />
          <Button type="submit" variant="ghost" size="sm">
            <Trash2 aria-hidden /> Delete
          </Button>
        </form>
      </div>

      <div className="mt-5">
        <NoteEditor
          note={note as never}
          skills={skills ?? []}
        />
      </div>
    </div>
  );
}
