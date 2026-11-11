import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/auth";
import { buildUserPrompt, callModel, fetchImage, parseCaptions, type Model } from "@/lib/chain";

export const maxDuration = 120;

type TraceItem = { step: number; description: string | null; model: string; seconds: number; output?: string; error?: string };

export async function POST(request: Request) {
  let ctx;
  try { ctx = await requireSuperadmin(); } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
  const { supabase, user } = ctx;

  const body = await request.json().catch(() => ({}));
  const chainId = Number(body.chainId);
  if (!chainId) return NextResponse.json({ error: "chainId is required" }, { status: 400 });

  // 1. image
  let imageId: number | null = body.imageId ? Number(body.imageId) : null;
  let imageUrl: string | null = null;
  if (typeof body.imageUrl === "string" && /^https?:\/\//.test(body.imageUrl.trim())) {
    const { data, error } = await supabase
      .from("images")
      .insert({ url: body.imageUrl.trim(), description: "Prompt chain test image", is_seed: false, created_by: user.id })
      .select("id, url")
      .single();
    if (error) return NextResponse.json({ error: `Could not save image: ${error.message}` }, { status: 400 });
    imageId = data.id; imageUrl = data.url;
  } else if (imageId) {
    const { data } = await supabase.from("images").select("id, url").eq("id", imageId).maybeSingle();
    imageUrl = data?.url ?? null;
  }
  if (!imageId || !imageUrl || !/^https?:\/\//.test(imageUrl)) return NextResponse.json({ error: "Pick a test image or paste a public image URL (https://…)." }, { status: 400 });

  // 2. steps + models
  const { data: steps, error: stepErr } = await supabase
    .from("prompt_chain_steps").select("*").eq("prompt_chain_id", chainId).order("step_order");
  if (stepErr) return NextResponse.json({ error: stepErr.message }, { status: 400 });
  const active = (steps ?? []).filter((s) => !s.is_hidden);
  if (!active.length) return NextResponse.json({ error: "This chain has no steps yet." }, { status: 400 });
  const { data: models } = await supabase
    .from("llm_models").select("id, name, provider_model_id, is_temperature_supported, llm_providers(name)").in("id", active.map((s) => s.llm_model_id));
  const modelById = new Map((models ?? []).map((m) => {
    const p = Array.isArray(m.llm_providers) ? m.llm_providers[0] : m.llm_providers;
    return [m.id, { id: m.id, name: m.name, provider_model_id: m.provider_model_id, is_temperature_supported: m.is_temperature_supported, provider: p?.name ?? "" } as Model];
  }));

  // 3. record the run for traceability
  const { data: req, error: reqErr } = await supabase
    .from("generation_requests")
    .insert({ profile_id: user.id, image_id: imageId, prompt_chain_id: chainId, status: "pending", created_by: user.id, modified_by: user.id })
    .select("id").single();
  if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 400 });
  const finish = (status: "completed" | "failed") =>
    supabase.from("generation_requests").update({ status, updated_at: new Date().toISOString() }).eq("id", req.id);

  // 4. run steps in order
  const outputs: string[] = [];
  const trace: TraceItem[] = [];
  let image: Awaited<ReturnType<typeof fetchImage>> | null = null;

  for (let i = 0; i < active.length; i++) {
    const s = active[i];
    const model = modelById.get(s.llm_model_id);
    const item: TraceItem = { step: i + 1, description: s.description, model: model?.name ?? `model ${s.llm_model_id}`, seconds: 0 };
    trace.push(item);
    const started = Date.now();
    try {
      if (!model) throw new Error("Model not found");
      const withImage = s.input_type === "image_and_text";
      if (withImage && !image) image = await fetchImage(imageUrl);
      const userPrompt = buildUserPrompt(s.user_prompt, outputs);
      const out = await callModel(model, {
        system: s.system_prompt,
        user: userPrompt,
        temperature: s.llm_temperature == null ? null : Number(s.llm_temperature),
        image: withImage ? image : null,
      });
      const seconds = (Date.now() - started) / 1000;
      item.seconds = Math.round(seconds);
      item.output = out;
      outputs.push(out);
      await supabase.from("llm_responses").insert({
        generation_request_id: req.id,
        prompt_chain_step_id: s.id,
        llm_model_id: s.llm_model_id,
        system_prompt: s.system_prompt,
        user_prompt: userPrompt,
        llm_temperature: s.llm_temperature,
        response: out,
        processing_time_seconds: Math.round(seconds * 100) / 100,
        is_seed: false,
        created_by: user.id,
        modified_by: user.id,
      });
    } catch (e) {
      item.seconds = Math.round((Date.now() - started) / 1000);
      item.error = e instanceof Error ? e.message : String(e);
      await finish("failed");
      return NextResponse.json({ error: `Step ${i + 1} failed: ${item.error}`, trace, imageUrl }, { status: 502 });
    }
  }

  await finish("completed");
  const captions = parseCaptions(outputs[outputs.length - 1]).slice(0, 20);
  return NextResponse.json({ captions, trace, imageUrl, generationRequestId: req.id });
}
