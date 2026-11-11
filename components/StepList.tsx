"use client";
import { useState, useTransition } from "react";
import { moveStep, deleteStep } from "@/app/actions";
import StepEditor, { type Lookups, type Step, STEP_TYPE_OPTS, INPUT_OPTS, OUTPUT_OPTS } from "./StepEditor";

export default function StepList({ chainId, steps, lookups }: { chainId: number; steps: Step[]; lookups: Lookups }) {
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const label = (opts: { value: string; label: string }[], v: string | number) => opts.find((o) => o.value === String(v))?.label ?? v;

  const run = (fn: () => Promise<{ error?: string } | undefined>) =>
    start(async () => { const r = await fn(); setError(r?.error ?? null); });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Steps <span className="text-sm font-normal text-muted">({steps.length})</span></h2>
        <button className="btn btn-primary" onClick={() => setAdding((v) => !v)}>{adding ? "Close" : "+ Add step"}</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {adding && <div className="card"><StepEditor chainId={chainId} lookups={lookups} onDone={() => setAdding(false)} /></div>}
      {steps.length === 0 && !adding && <p className="card text-sm text-muted">No steps yet. Add the first step to start building this chain.</p>}
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-full bg-accent text-xs font-semibold text-white">{i + 1}</span>
                  <span className="font-medium">{s.description || "Untitled step"}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {label(lookups.models, s.llm_model_id)} · {label(STEP_TYPE_OPTS, s.step_type)} · in: {label(INPUT_OPTS, s.input_type)} · out: {label(OUTPUT_OPTS, s.output_type)}{s.is_hidden && " · skipped"}
                  {s.llm_temperature != null && ` · temp ${s.llm_temperature}`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button className="btn" aria-label={`Move step ${i + 1} up`} disabled={pending || i === 0} onClick={() => run(() => moveStep(chainId, s.id, "up"))}>↑</button>
                <button className="btn" aria-label={`Move step ${i + 1} down`} disabled={pending || i === steps.length - 1} onClick={() => run(() => moveStep(chainId, s.id, "down"))}>↓</button>
                <button className="btn" onClick={() => setEditing(editing === s.id ? null : s.id)}>{editing === s.id ? "Close" : "Edit"}</button>
                <button className="btn btn-danger" disabled={pending} onClick={() => { if (confirm(`Delete step ${i + 1}?`)) run(() => deleteStep(chainId, s.id)); }}>Delete</button>
              </div>
            </div>
            {editing === s.id ? (
              <div className="mt-4 border-t border-line pt-4"><StepEditor chainId={chainId} step={s} lookups={lookups} onDone={() => setEditing(null)} /></div>
            ) : (
              (s.system_prompt || s.user_prompt) && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-muted">View prompts</summary>
                  {s.system_prompt && <><p className="label mt-2">System</p><pre className="whitespace-pre-wrap rounded-lg bg-foreground/5 p-3 font-mono text-xs">{s.system_prompt}</pre></>}
                  {s.user_prompt && <><p className="label mt-2">User</p><pre className="whitespace-pre-wrap rounded-lg bg-foreground/5 p-3 font-mono text-xs">{s.user_prompt}</pre></>}
                </details>
              )
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
