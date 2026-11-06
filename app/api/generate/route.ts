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
  const flavorId = Number(body.flavorId);
  if (!flavorId) return NextResponse.json({ error: "flavorId is required" }, { status: 400 });

  // 1. image
  let imageId: string | null = body.imageId ?? null;
  let imageUrl: string | null = null;
  if (!imageId && typeof body.imageUrl === "string" && /^https?:\/\//.test(body.imageUrl)) {
    const { data, error } = await supabase.from("images").insert({ url: body.imageUrl, is_common_use: false, is_public: false }).select("id, url").single();
    if (error) return NextResponse.json({ error: `Could not save image: ${error.message}` }, { status: 400 });
    imageId = data.id; imageUrl = data.url;
  } else if (imageId) {
    const { data } = await supabase.from("images").select("id, url").eq("id", imageId).maybeSingle();
    imageUrl = data?.url ?? null;
  }
  if (!imageId || !imageUrl) return NextResponse.json({ error: "Pick a test image or paste an image URL." }, { status: 400 });

  // 2. steps + models
  const { data: steps, error: stepErr } = await supabase
    .from("humor_flavor_steps").select("*").eq("humor_flavor_id", flavorId).order("order_by").order("id");
  if (stepErr) return NextResponse.json({ error: stepErr.message }, { status: 400 });
  const active = (steps ?? []).filter((s) => !s.is_hidden);
  if (!active.length) return NextResponse.json({ error: "This chain has no steps yet." }, { status: 400 });
  const { data: models } = await supabase.from("llm_models").select("id, name, provider_model_id, is_temperature_supported").in("id", active.map((s) => s.llm_model_id));
  const modelById = new Map((models ?? []).map((m) => [m.id, m as Model]));

  // 3. records for traceability
  const { data: req, error: reqErr } = await supabase.from("caption_requests").insert({ image_id: imageId, profile_id: user.id }).select("id").single();
  if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 400 });
  const { data: chain, error: chainErr } = await supabase.from("llm_prompt_chains").insert({ caption_request_id: req.id }).select("id").single();
  if (chainErr) return NextResponse.json({ error: chainErr.message }, { status: 400 });

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
      if (s.llm_input_type_id === 1 && !image) image = await fetchImage(imageUrl);
      const user_prompt = buildUserPrompt(s.llm_user_prompt, outputs);
      const out = await callModel(model, {
        system: s.llm_system_prompt,
        user: user_prompt,
        temperature: s.llm_temperature == null ? null : Number(s.llm_temperature),
        image: s.llm_input_type_id === 1 ? image : null,
      });
      item.seconds = Math.round((Date.now() - started) / 1000);
      item.output = out;
      outputs.push(out);
      await supabase.from("llm_model_responses").insert({
        llm_model_response: out,
        processing_time_seconds: Math.min(item.seconds, 32000),
        llm_model_id: s.llm_model_id,
        profile_id: user.id,
        caption_request_id: req.id,
        llm_system_prompt: s.llm_system_prompt ?? "",
        llm_user_prompt: user_prompt,
        llm_temperature: s.llm_temperature,
        humor_flavor_id: flavorId,
        llm_prompt_chain_id: chain.id,
        humor_flavor_step_id: s.id,
      });
    } catch (e) {
      item.seconds = Math.round((Date.now() - started) / 1000);
      item.error = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `Step ${i + 1} failed: ${item.error}`, trace, imageUrl }, { status: 502 });
    }
  }

  // 5. final output -> captions
  const captions = parseCaptions(outputs[outputs.length - 1]).slice(0, 20);
  if (!captions.length) return NextResponse.json({ error: "The last step produced no captions.", trace, imageUrl }, { status: 502 });
  const { error: capErr } = await supabase.from("captions").insert(
    captions.map((content) => ({
      content, is_public: false, profile_id: user.id, image_id: imageId,
      humor_flavor_id: flavorId, caption_request_id: req.id, llm_prompt_chain_id: chain.id,
    })),
  );
  if (capErr) return NextResponse.json({ error: `Captions generated but not saved: ${capErr.message}`, captions, trace, imageUrl }, { status: 500 });

  return NextResponse.json({ captions, trace, imageUrl, promptChainId: chain.id });
}
