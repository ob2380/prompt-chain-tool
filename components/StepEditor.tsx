"use client";
import { useActionState, useEffect } from "react";
import { createStep, updateStep, type ActionState } from "@/app/actions";

export type Opt = { id: number; label: string };
export type Lookups = { models: Opt[]; inputTypes: Opt[]; outputTypes: Opt[]; stepTypes: Opt[] };
export type Step = {
  id: number; order_by: number; description: string | null; llm_system_prompt: string | null; llm_user_prompt: string | null;
  llm_temperature: number | null; llm_model_id: number; llm_input_type_id: number; llm_output_type_id: number; humor_flavor_step_type_id: number;
};

function Select({ name, label, opts, value }: { name: string; label: string; opts: Opt[]; value?: number }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <select id={name} name={name} className="input" defaultValue={value ?? opts[0]?.id} required>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}

export default function StepEditor({ flavorId, step, lookups, onDone }: { flavorId: number; step?: Step; lookups: Lookups; onDone?: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(step ? updateStep : createStep, undefined);
  useEffect(() => { if (state?.ok) onDone?.(); }, [state, onDone]);
  const k = step ? `s${step.id}` : "new";
  return (
    <form action={action} key={state?.ok ? "done" : "form"} className="space-y-3">
      <input type="hidden" name="flavorId" value={flavorId} />
      {step && <input type="hidden" name="stepId" value={step.id} />}
      <div><label className="label" htmlFor={`${k}d`}>Description</label><input id={`${k}d`} name="description" className="input" defaultValue={step?.description ?? ""} placeholder="e.g. Describe the image" /></div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Select name="llm_model_id" label="Model" opts={lookups.models} value={step?.llm_model_id} />
        <Select name="humor_flavor_step_type_id" label="Step type" opts={lookups.stepTypes} value={step?.humor_flavor_step_type_id} />
        <Select name="llm_input_type_id" label="Input" opts={lookups.inputTypes} value={step?.llm_input_type_id} />
        <Select name="llm_output_type_id" label="Output" opts={lookups.outputTypes} value={step?.llm_output_type_id} />
      </div>
      <div className="max-w-40"><label className="label" htmlFor={`${k}t`}>Temperature (0–2)</label><input id={`${k}t`} name="llm_temperature" type="number" step="0.1" min="0" max="2" className="input" defaultValue={step?.llm_temperature ?? ""} /></div>
      <div><label className="label" htmlFor={`${k}s`}>System prompt</label><textarea id={`${k}s`} name="llm_system_prompt" rows={4} className="input font-mono" defaultValue={step?.llm_system_prompt ?? ""} /></div>
      <div>
        <label className="label" htmlFor={`${k}u`}>User prompt <span className="font-normal">— reference earlier results with {"${step1Output}"}, {"${step2Output}"}…</span></label>
        <textarea id={`${k}u`} name="llm_user_prompt" rows={5} className="input font-mono" defaultValue={step?.llm_user_prompt ?? ""} />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : step ? "Save step" : "Add step"}</button>
        {onDone && <button type="button" className="btn" onClick={onDone}>Cancel</button>}
        {state?.error && <span role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</span>}
      </div>
    </form>
  );
}
