"use client";
import { useActionState, useEffect } from "react";
import { createStep, updateStep, type ActionState } from "@/app/actions";

export type Opt = { value: string; label: string };
export type Lookups = { models: Opt[] };
export type Step = {
  id: number; step_order: number; description: string | null; system_prompt: string | null; user_prompt: string | null;
  llm_temperature: number | null; llm_model_id: number; input_type: string; output_type: string; step_type: string; is_hidden: boolean;
};

export const STEP_TYPE_OPTS: Opt[] = [
  { value: "describe_image", label: "Describe image" }, { value: "generate_captions", label: "Generate captions" },
  { value: "judge", label: "Judge" }, { value: "rewrite", label: "Rewrite" },
];
export const INPUT_OPTS: Opt[] = [{ value: "image_and_text", label: "Image + text" }, { value: "text_only", label: "Text only" }];
export const OUTPUT_OPTS: Opt[] = [{ value: "string", label: "Text" }, { value: "array", label: "List (JSON array)" }];

function Select({ name, label, opts, value }: { name: string; label: string; opts: Opt[]; value?: string | number }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <select id={name} name={name} className="input" defaultValue={value != null ? String(value) : opts[0]?.value} required>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export default function StepEditor({ chainId, step, lookups, onDone }: { chainId: number; step?: Step; lookups: Lookups; onDone?: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(step ? updateStep : createStep, undefined);
  useEffect(() => { if (state?.ok) onDone?.(); }, [state, onDone]);
  const k = step ? `s${step.id}` : "new";
  return (
    <form action={action} key={state?.ok ? "done" : "form"} className="space-y-3">
      <input type="hidden" name="chainId" value={chainId} />
      {step && <input type="hidden" name="stepId" value={step.id} />}
      <div><label className="label" htmlFor={`${k}d`}>Description</label><input id={`${k}d`} name="description" className="input" defaultValue={step?.description ?? ""} placeholder="e.g. Describe the image" /></div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Select name="llm_model_id" label="Model" opts={lookups.models} value={step?.llm_model_id} />
        <Select name="step_type" label="Step type" opts={STEP_TYPE_OPTS} value={step?.step_type} />
        <Select name="input_type" label="Input" opts={INPUT_OPTS} value={step?.input_type} />
        <Select name="output_type" label="Output" opts={OUTPUT_OPTS} value={step?.output_type} />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="max-w-40"><label className="label" htmlFor={`${k}t`}>Temperature (0–2)</label><input id={`${k}t`} name="llm_temperature" type="number" step="0.1" min="0" max="2" className="input" defaultValue={step?.llm_temperature ?? ""} /></div>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="is_hidden" defaultChecked={step?.is_hidden ?? false} /> Skip this step when running</label>
      </div>
      <div><label className="label" htmlFor={`${k}s`}>System prompt</label><textarea id={`${k}s`} name="system_prompt" rows={4} className="input font-mono" defaultValue={step?.system_prompt ?? ""} /></div>
      <div>
        <label className="label" htmlFor={`${k}u`}>User prompt <span className="font-normal">— reference earlier results with {"{{step_1_output}}"}, {"{{step_2_output}}"}…</span></label>
        <textarea id={`${k}u`} name="user_prompt" rows={5} className="input font-mono" defaultValue={step?.user_prompt ?? ""} />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : step ? "Save step" : "Add step"}</button>
        {onDone && <button type="button" className="btn" onClick={onDone}>Cancel</button>}
        {state?.error && <span role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</span>}
      </div>
    </form>
  );
}
