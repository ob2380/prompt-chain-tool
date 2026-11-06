"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/auth";

export type ActionState = { error?: string; ok?: boolean } | undefined;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const nullable = (fd: FormData, k: string) => str(fd, k) || null;
const num = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v === "" ? null : Number(v);
};

function stepFields(fd: FormData) {
  const f = {
    description: nullable(fd, "description"),
    llm_system_prompt: nullable(fd, "llm_system_prompt"),
    llm_user_prompt: nullable(fd, "llm_user_prompt"),
    llm_temperature: num(fd, "llm_temperature"),
    llm_model_id: num(fd, "llm_model_id"),
    llm_input_type_id: num(fd, "llm_input_type_id"),
    llm_output_type_id: num(fd, "llm_output_type_id"),
    humor_flavor_step_type_id: num(fd, "humor_flavor_step_type_id"),
  };
  if (f.llm_model_id == null || f.llm_input_type_id == null || f.llm_output_type_id == null || f.humor_flavor_step_type_id == null)
    return { error: "Model, input type, output type and step type are required." as const };
  if (f.llm_temperature != null && (Number.isNaN(f.llm_temperature) || f.llm_temperature < 0 || f.llm_temperature > 2))
    return { error: "Temperature must be a number between 0 and 2." as const };
  return { fields: f };
}

/* ---------- chains (humor_flavors) ---------- */

export async function createFlavor(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireSuperadmin();
  const slug = str(fd, "slug");
  if (!slug) return { error: "Slug is required." };
  const { data, error } = await supabase
    .from("humor_flavors")
    .insert({ slug, description: nullable(fd, "description") })
    .select("id")
    .single();
  if (error) return { error: error.code === "23505" ? `A chain with slug "${slug}" already exists.` : error.message };
  revalidatePath("/");
  redirect(`/flavors/${data.id}`);
}

export async function updateFlavor(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireSuperadmin();
  const id = Number(fd.get("id"));
  const slug = str(fd, "slug");
  if (!slug) return { error: "Slug is required." };
  const { error } = await supabase
    .from("humor_flavors")
    .update({ slug, description: nullable(fd, "description"), modified_by_user_id: user.id, modified_datetime_utc: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.code === "23505" ? `Slug "${slug}" is already taken.` : error.message };
  revalidatePath("/");
  revalidatePath(`/flavors/${id}`);
  return { ok: true };
}

export async function deleteFlavor(id: number): Promise<ActionState> {
  const { supabase } = await requireSuperadmin();
  const { error } = await supabase.from("humor_flavors").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/");
  return { ok: true };
}

/* ---------- steps (humor_flavor_steps) ---------- */

export async function createStep(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireSuperadmin();
  const flavorId = Number(fd.get("flavorId"));
  const parsed = stepFields(fd);
  if ("error" in parsed) return { error: parsed.error };
  const { data: last } = await supabase
    .from("humor_flavor_steps")
    .select("order_by")
    .eq("humor_flavor_id", flavorId)
    .order("order_by", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase
    .from("humor_flavor_steps")
    .insert({ ...parsed.fields, humor_flavor_id: flavorId, order_by: (last?.order_by ?? 0) + 1 });
  if (error) return { error: error.message };
  revalidatePath(`/flavors/${flavorId}`);
  return { ok: true };
}

export async function updateStep(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireSuperadmin();
  const flavorId = Number(fd.get("flavorId"));
  const stepId = Number(fd.get("stepId"));
  const parsed = stepFields(fd);
  if ("error" in parsed) return { error: parsed.error };
  const { error } = await supabase
    .from("humor_flavor_steps")
    .update({ ...parsed.fields, modified_by_user_id: user.id, modified_datetime_utc: new Date().toISOString() })
    .eq("id", stepId)
    .eq("humor_flavor_id", flavorId);
  if (error) return { error: error.message };
  revalidatePath(`/flavors/${flavorId}`);
  return { ok: true };
}

async function renumber(supabase: Awaited<ReturnType<typeof requireSuperadmin>>["supabase"], flavorId: number, move?: { stepId: number; dir: "up" | "down" }) {
  const { data: steps, error } = await supabase
    .from("humor_flavor_steps")
    .select("id, order_by")
    .eq("humor_flavor_id", flavorId)
    .order("order_by", { ascending: true })
    .order("id", { ascending: true });
  if (error) return error.message;
  const list = [...(steps ?? [])];
  if (move) {
    const i = list.findIndex((s) => s.id === move.stepId);
    const j = move.dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return null;
    [list[i], list[j]] = [list[j], list[i]];
  }
  for (let idx = 0; idx < list.length; idx++) {
    if (list[idx].order_by === idx + 1) continue;
    const { error: e } = await supabase.from("humor_flavor_steps").update({ order_by: idx + 1 }).eq("id", list[idx].id);
    if (e) return e.message;
  }
  return null;
}

export async function moveStep(flavorId: number, stepId: number, dir: "up" | "down"): Promise<ActionState> {
  const { supabase } = await requireSuperadmin();
  const err = await renumber(supabase, flavorId, { stepId, dir });
  if (err) return { error: err };
  revalidatePath(`/flavors/${flavorId}`);
  return { ok: true };
}

export async function deleteStep(flavorId: number, stepId: number): Promise<ActionState> {
  const { supabase } = await requireSuperadmin();
  const { error } = await supabase.from("humor_flavor_steps").delete().eq("id", stepId).eq("humor_flavor_id", flavorId);
  if (error) return { error: error.message };
  const err = await renumber(supabase, flavorId);
  if (err) return { error: err };
  revalidatePath(`/flavors/${flavorId}`);
  return { ok: true };
}
