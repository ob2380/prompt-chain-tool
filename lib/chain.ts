export type Model = { id: number; name: string; provider_model_id: string; is_temperature_supported: boolean; provider: string };

export type CallInput = {
  system: string | null;
  user: string;
  temperature: number | null;
  image?: { url: string; mime: string; base64: string } | null;
};

/** Image-generation models can't be used as chain steps (steps produce text). */
export const isImageModel = (m: { provider_model_id: string }) => /^(imagen|dall-e|gpt-image)/i.test(m.provider_model_id);

type Kind = "google" | "openai" | "anthropic";
function providerFor(name: string): { kind: Kind; env: string; key: string | undefined } {
  const n = name.toLowerCase();
  if (n.includes("anthropic")) return { kind: "anthropic", env: "ANTHROPIC_API_KEY", key: process.env.ANTHROPIC_API_KEY };
  if (n.includes("google") || n.includes("gemini")) return { kind: "google", env: "GEMINI_API_KEY", key: process.env.GEMINI_API_KEY };
  return { kind: "openai", env: "OPENAI_API_KEY", key: process.env.OPENAI_API_KEY };
}

export async function fetchImage(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download image (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 8 * 1024 * 1024) throw new Error("Image is larger than 8 MB");
  const mime = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0];
  return { url, mime, base64: buf.toString("base64") };
}

export async function callModel(model: Model, input: CallInput): Promise<string> {
  if (isImageModel(model)) throw new Error(`${model.name} generates images, so it can't be used as a text step.`);
  const p = providerFor(model.provider);
  if (!p.key) throw new Error(`${p.env} is not set on the server, so ${model.name} can't be called.`);
  const temperature = model.is_temperature_supported && input.temperature != null ? input.temperature : undefined;

  if (p.kind === "google") {
    const parts: unknown[] = [{ text: input.user }];
    if (input.image) parts.push({ inline_data: { mime_type: input.image.mime, data: input.image.base64 } });
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.provider_model_id}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": p.key },
      body: JSON.stringify({
        ...(input.system ? { systemInstruction: { parts: [{ text: input.system }] } } : {}),
        contents: [{ role: "user", parts }],
        generationConfig: temperature != null ? { temperature } : {},
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${json?.error?.message ?? "request failed"}`);
    const text = (json?.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? "").join("");
    if (!text) throw new Error("Gemini returned no text (it may have been blocked by a safety filter).");
    return text;
  }

  if (p.kind === "anthropic") {
    const content = [
      ...(input.image ? [{ type: "image", source: { type: "base64", media_type: input.image.mime, data: input.image.base64 } }] : []),
      { type: "text", text: input.user },
    ];
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": p.key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: model.provider_model_id,
        max_tokens: 2048,
        ...(input.system ? { system: input.system } : {}),
        ...(temperature != null ? { temperature } : {}),
        messages: [{ role: "user", content }],
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${json?.error?.message ?? "request failed"}`);
    const text = (json?.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    if (!text) throw new Error("Anthropic returned an empty response.");
    return text;
  }

  const userContent = input.image
    ? [{ type: "text", text: input.user }, { type: "image_url", image_url: { url: `data:${input.image.mime};base64,${input.image.base64}` } }]
    : input.user;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${p.key}` },
    body: JSON.stringify({
      model: model.provider_model_id,
      messages: [...(input.system ? [{ role: "system", content: input.system }] : []), { role: "user", content: userContent }],
      ...(temperature != null ? { temperature } : {}),
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${json?.error?.message ?? "request failed"}`);
  const text = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI returned an empty response.");
  return text;
}

/** Replaces {{step_1_output}}, {{step_2_output}}… (also ${step1Output}); if no placeholder is used, appends the previous output. */
export function buildUserPrompt(template: string | null, outputs: string[]) {
  let t = template ?? "";
  let used = false;
  const sub = (m: string, n: string) => {
    const v = outputs[Number(n) - 1];
    if (v === undefined) return m;
    used = true;
    return v;
  };
  t = t.replace(/\{\{\s*step_?(\d+)_?output\s*\}\}/gi, sub).replace(/\$\{step(\d+)Output\}/g, sub);
  if (!used && outputs.length) t = `${t}\n\nPrevious step output:\n${outputs[outputs.length - 1]}`.trim();
  return t;
}

/** Turns a step output into a list of strings (JSON array, or one per line). */
export function parseCaptions(raw: string): string[] {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const v = JSON.parse(cleaned);
    const arr = Array.isArray(v) ? v : Array.isArray(v?.captions) ? v.captions : null;
    if (arr) {
      return arr
        .map((x: unknown) => (typeof x === "string" ? x : (x as { caption?: string; content?: string })?.caption ?? (x as { content?: string })?.content ?? ""))
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
  } catch {}
  return cleaned
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/^["“]|["”]$/g, "").trim())
    .filter(Boolean);
}
