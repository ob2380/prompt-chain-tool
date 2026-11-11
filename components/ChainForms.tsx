"use client";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createChain, updateChain, deleteChain, type ActionState } from "@/app/actions";

export function CreateChainForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createChain, undefined);
  return (
    <form action={action} className="card grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
      <div><label className="label" htmlFor="slug">New chain name</label><input id="slug" name="slug" className="input" placeholder="e.g. deadpan-roast" required /></div>
      <div><label className="label" htmlFor="description">Description</label><input id="description" name="description" className="input" placeholder="What is this chain for?" /></div>
      <button className="btn btn-primary" disabled={pending}>{pending ? "Creating…" : "Create chain"}</button>
      {state?.error && <p role="alert" className="text-sm text-red-600 dark:text-red-400 sm:col-span-3">{state.error}</p>}
    </form>
  );
}

export function EditChainForm({ id, slug, description, isPinned }: { id: number; slug: string; description: string | null; isPinned: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateChain, undefined);
  return (
    <form action={action} className="card grid gap-3 sm:grid-cols-[1fr_2fr_auto_auto] sm:items-end">
      <input type="hidden" name="id" value={id} />
      <div><label className="label" htmlFor="eslug">Name</label><input id="eslug" name="slug" defaultValue={slug} className="input" required /></div>
      <div><label className="label" htmlFor="edesc">Description</label><input id="edesc" name="description" defaultValue={description ?? ""} className="input" /></div>
      <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="is_pinned" defaultChecked={isPinned} /> Pinned</label>
      <button className="btn" disabled={pending}>{pending ? "Saving…" : "Save chain"}</button>
      {state?.error && <p role="alert" className="text-sm text-red-600 dark:text-red-400 sm:col-span-4">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-600 dark:text-green-400 sm:col-span-4">Saved.</p>}
    </form>
  );
}

export function DeleteChainButton({ id, slug, redirectTo }: { id: number; slug: string; redirectTo?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        className="btn btn-danger"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Delete chain "${slug}", all of its steps and its past runs? This can't be undone.`)) return;
          start(async () => {
            const r = await deleteChain(id);
            if (r?.error) setError(r.error);
            else if (redirectTo) router.push(redirectTo);
            else router.refresh();
          });
        }}
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error && <span role="alert" className="mt-1 max-w-xs text-right text-xs text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
