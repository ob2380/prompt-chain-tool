"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Trace = { step: number; description: string | null; model: string; seconds: number; output?: string; error?: string };
type Result = { captions?: string[]; trace?: Trace[]; imageUrl?: string; error?: string };

export default function GeneratePanel({ flavorId, images, stepCount }: { flavorId: number; images: { id: string; url: string }[]; stepCount: number }) {
  const router = useRouter();
  const [imageId, setImageId] = useState(images[0]?.id ?? "");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const preview = imageUrl.trim() || images.find((i) => i.id === imageId)?.url;

  async function run() {
    setBusy(true); setResult(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flavorId, ...(imageUrl.trim() ? { imageUrl: imageUrl.trim() } : { imageId }) }),
      });
      const json: Result = await res.json().catch(() => ({ error: `Unexpected response (${res.status})` }));
      setResult(json);
      if (res.ok) router.refresh();
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Request failed" });
    } finally { setBusy(false); }
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Generate media</h2>
        <p className="text-sm text-muted">Runs all {stepCount} step{stepCount === 1 ? "" : "s"} in order on a test image and saves the resulting captions to this chain.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_220px]">
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="img">Test image</label>
            <select id="img" className="input" value={imageId} onChange={(e) => { setImageId(e.target.value); setImageUrl(""); }} disabled={!images.length}>
              {images.map((i, n) => <option key={i.id} value={i.id}>Image {n + 1} — {i.url.split("/").pop()?.slice(0, 40)}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="url">…or paste an image URL</label>
            <input id="url" className="input" placeholder="https://…" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={run} disabled={busy || stepCount === 0 || (!imageUrl.trim() && !imageId)}>{busy ? "Running chain…" : "Generate captions"}</button>
        </div>
        {preview && <img src={preview} alt="Test image" className="aspect-square w-full rounded-lg border border-line object-cover" />}
      </div>

      {result?.error && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{result.error}</p>}
      {result?.captions && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Captions</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">{result.captions.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      )}
      {result?.trace && (
        <details className="text-sm" open={!!result.error}>
          <summary className="cursor-pointer text-muted">Step-by-step output</summary>
          <div className="mt-2 space-y-2">
            {result.trace.map((t) => (
              <div key={t.step} className="rounded-lg border border-line p-3">
                <p className="text-xs text-muted">Step {t.step}{t.description ? ` · ${t.description}` : ""} · {t.model} · {t.seconds}s</p>
                <pre className="mt-1 whitespace-pre-wrap font-mono text-xs">{t.error ? `Error: ${t.error}` : t.output}</pre>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
