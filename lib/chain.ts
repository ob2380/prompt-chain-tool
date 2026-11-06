export type Model = { id: number; name: string; provider_model_id: string; is_temperature_supported: boolean };

export type CallInput = {
  system: string | null;
  user: string;
  temperature: number | null;
  image?: { url: string; mime: string; base64: string } | null;
};

type Provider = { name: string; key: string | undefined; keyEnv: string };

function providerFor(modelId: string): Provider {
  if (modelId.startsWith("gemini")) return { name: "gemini", key: process.env.GEMINI_API_KEY, keyEnv: "GEMINI_API_KEY" };
  if (modelId.startsWith("grok")) return { name: "xai", key: process.env.XAI_API_KEY, keyEnv: "XAI_API_KEY" };
  return { name: "openai", key: process.env.OPENAI_API_KEY, keyEnv: "OPENAI_API_KEY" };
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
  const p = providerFor(model.provider_model_id);
  if (!p.key) throw new Error(`${p.keyEnv} is not set on the server, so ${model.name} can't be called.`);
  const temperature = model.is_temperature_supported && input.temperature != null ? input.temperature : undefined;

  if (p.name === "gemini") {
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

  const base = p.name === "xai" ? "https://api.x.ai/v1" : "https://api.openai.com/v1";
  const userContent = input.image
    ? [{ type: "text", text: input.user }, { type: "image_url", image_url: { url: `data:${input.image.mime};base64,${input.image.base64}` } }]
    : input.user;
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${p.key}` },
    body: JSON.stringify({
      model: model.provider_model_id,
      messages: [...(input.system ? [{ role: "system", content: input.system }] : []), { role: "user", content: userContent }],
      ...(temperature != null ? { temperature } : {}),
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${p.name} ${res.status}: ${json?.error?.message ?? "request failed"}`);
  const text = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${p.name} returned an empty response.`);
  return text;
}

/** Replaces ${step1Output}, ${step2Output}… ; if a later step has no placeholder, appends the previous output. */
export function buildUserPrompt(template: string | null, outputs: string[]) {
  let t = template ?? "";
  let used = false;
  t = t.replace(/\$\{step(\d+)Output\}/g, (m, n) => {
    const v = outputs[Number(n) - 1];
    if (v === undefined) return m;
    used = true;
    return v;
  });
  if (!used && outputs.length) t = `${t}\n\nPrevious step output:\n${outputs[outputs.length - 1]}`.trim();
  return t;
}

/** Turns a final step output into a list of caption strings. */
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
