"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/auth";

export type ActionState = { error?: string; ok?: boolean } | undefined;

export const STEP_TYPES = ["describe_image", "generate_captions", "judge", "rewrite"] as const;
export const INPUT_TYPES = ["image_and_text", "text_only"] as const;
export const OUTPUT_TYPES = ["string", "array"] as const;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const nullable = (fd: FormData, k: string) => str(fd, k) || null;
const num = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v === "" ? null : Number(v);
};
const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function stepFields(fd: FormData) {
  const f = {
    description: nullable(fd, "description"),
    system_prompt: nullable(fd, "system_prompt"),
    user_prompt: nullable(fd, "user_prompt"),
    llm_temperature: num(fd, "llm_temperature"),
    llm_model_id: num(fd, "llm_model_id"),
    input_type: str(fd, "input_type"),
    output_type: str(fd, "output_type"),
    step_type: str(fd, "step_type"),
    is_hidden: fd.get("is_hidden") === "on",
  };
  if (f.llm_model_id == null || Number.isNaN(f.llm_model_id)) return { error: "Pick a model." as const };
  if (!(STEP_TYPES as readonly string[]).includes(f.step_type)) return { error: "Pick a step type." as const };
  if (!(INPUT_TYPES as readonly string[]).includes(f.input_type)) return { error: "Pick an input type." as const };
  if (!(OUTPUT_TYPES as readonly string[]).includes(f.output_type)) return { error: "Pick an output type." as const };
  if (f.llm_temperature != null && (Number.isNaN(f.llm_temperature) || f.llm_temperature < 0 || f.llm_temperature > 2))
    return { error: "Temperature must be a number between 0 and 2." as const };
  return { fields: f };
}

/* ---------- chains (prompt_chains) ---------- */

export async function createChain(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireSuperadmin();
  const slug = toSlug(str(fd, "slug"));
  if (!slug) return { error: "Give the chain a name (letters, numbers and dashes)." };
  const { data, error } = await supabase
    .from("prompt_chains")
    .insert({ slug, description: nullable(fd, "description"), created_by: user.id, modified_by: user.id })
    .select("id")
    .single();
  if (error) return { error: error.code === "23505" ? `A chain named "${slug}" already exists.` : error.message };
  revalidatePath("/");
  redirect(`/chains/${data.id}`);
}

export async function updateChain(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireSuperadmin();
  const id = Number(fd.get("id"));
  const slug = toSlug(str(fd, "slug"));
  if (!slug) return { error: "Give the chain a name (letters, numbers and dashes)." };
  const { error } = await supabase
    .from("prompt_chains")
    .update({ slug, description: nullable(fd, "description"), is_pinned: fd.get("is_pinned") === "on", modified_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.code === "23505" ? `The name "${slug}" is already taken.` : error.message };
  revalidatePath("/");
  revalidatePath(`/chains/${id}`);
  return { ok: true };
}

export async function deleteChain(id: number): Promise<ActionState> {
  const { supabase } = await requireSuperadmin();
  // past runs would be orphaned (FK is SET NULL), so remove them with the chain; their responses cascade
  const { error: runErr } = await supabase.from("generation_requests").delete().eq("prompt_chain_id", id);
  if (runErr) return { error: runErr.message };
  const { error } = await supabase.from("prompt_chains").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/");
  return { ok: true };
}

/* ---------- steps (prompt_chain_steps) ---------- */

export async function createStep(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireSuperadmin();
  const chainId = Number(fd.get("chainId"));
  const parsed = stepFields(fd);
  if ("error" in parsed) return { error: parsed.error };
  const { data: last } = await supabase
    .from("prompt_chain_steps")
    .select("step_order")
    .eq("prompt_chain_id", chainId)
    .order("step_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase
    .from("prompt_chain_steps")
    .insert({ ...parsed.fields, prompt_chain_id: chainId, step_order: (last?.step_order ?? 0) + 1, created_by: user.id, modified_by: user.id });
  if (error) return { error: error.message };
  revalidatePath(`/chains/${chainId}`);
  return { ok: true };
}

export async function updateStep(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireSuperadmin();
  const chainId = Number(fd.get("chainId"));
  const stepId = Number(fd.get("stepId"));
  const parsed = stepFields(fd);
  if ("error" in parsed) return { error: parsed.error };
  const { error } = await supabase
    .from("prompt_chain_steps")
    .update({ ...parsed.fields, modified_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", stepId)
    .eq("prompt_chain_id", chainId);
  if (error) return { error: error.message };
  revalidatePath(`/chains/${chainId}`);
  return { ok: true };
}

type Sb = Awaited<ReturnType<typeof requireSuperadmin>>["supabase"];

/** (prompt_chain_id, step_order) is unique, so a swap goes through a temporary order value. */
async function swapSteps(supabase: Sb, a: { id: number; step_order: number }, b: { id: number; step_order: number }) {
  const TEMP = 32000;
  const steps: [number, number][] = [[a.id, TEMP], [b.id, a.step_order], [a.id, b.step_order]];
  for (const [id, order] of steps) {
    const { error } = await supabase.from("prompt_chain_steps").update({ step_order: order }).eq("id", id);
    if (error) return error.message;
  }
  return null;
}

async function renumber(supabase: Sb, chainId: number) {
  const { data: steps, error } = await supabase
    .from("prompt_chain_steps")
    .select("id, step_order")
    .eq("prompt_chain_id", chainId)
    .order("step_order", { ascending: true });
  if (error) return error.message;
  for (let idx = 0; idx < (steps ?? []).length; idx++) {
    const s = steps![idx];
    if (s.step_order === idx + 1) continue;
    const { error: e } = await supabase.from("prompt_chain_steps").update({ step_order: idx + 1 }).eq("id", s.id);
    if (e) return e.message;
  }
  return null;
}

export async function moveStep(chainId: number, stepId: number, dir: "up" | "down"): Promise<ActionState> {
  const { supabase } = await requireSuperadmin();
  const { data: steps, error } = await supabase
    .from("prompt_chain_steps")
    .select("id, step_order")
    .eq("prompt_chain_id", chainId)
    .order("step_order", { ascending: true });
  if (error) return { error: error.message };
  const list = steps ?? [];
  const i = list.findIndex((s) => s.id === stepId);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return { ok: true };
  const err = await swapSteps(supabase, list[i], list[j]);
  if (err) return { error: err };
  revalidatePath(`/chains/${chainId}`);
  return { ok: true };
}

export async function deleteStep(chainId: number, stepId: number): Promise<ActionState> {
  const { supabase } = await requireSuperadmin();
  const { error } = await supabase.from("prompt_chain_steps").delete().eq("id", stepId).eq("prompt_chain_id", chainId);
  if (error) return { error: error.message };
  const err = await renumber(supabase, chainId);
  if (err) return { error: err };
  revalidatePath(`/chains/${chainId}`);
  return { ok: true };
}
