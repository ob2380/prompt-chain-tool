import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminContext } from "@/lib/auth";
import Header from "@/components/Header";
import AccessDenied from "@/components/AccessDenied";
import { EditChainForm, DeleteChainButton } from "@/components/ChainForms";
import StepList from "@/components/StepList";
import GeneratePanel from "@/components/GeneratePanel";
import type { Step } from "@/components/StepEditor";
import { isImageModel, parseCaptions } from "@/lib/chain";

export const dynamic = "force-dynamic";

type Resp = { id: string; prompt_chain_step_id: number | null; response: string | null; processing_time_seconds: number | null; created_at: string };
type Run = {
  id: number; status: string; created_at: string;
  images: { url: string | null } | { url: string | null }[] | null;
  llm_responses: Resp[];
};

export default async function ChainPage({ params }: PageProps<"/chains/[id]">) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();

  const { supabase, user, isSuperadmin } = await getAdminContext();
  if (!user || !isSuperadmin) return <AccessDenied email={user?.email} />;

  const [chainRes, stepsRes, modelsRes, imgRes, runsRes, runCount] = await Promise.all([
    supabase.from("prompt_chains").select("id, slug, description, is_pinned").eq("id", id).maybeSingle(),
    supabase.from("prompt_chain_steps").select("id, step_order, description, system_prompt, user_prompt, llm_temperature, llm_model_id, input_type, output_type, step_type, is_hidden").eq("prompt_chain_id", id).order("step_order"),
    supabase.from("llm_models").select("id, name, provider_model_id").order("id"),
    supabase.from("images").select("id, url").ilike("url", "http%").order("id", { ascending: false }).limit(30),
    supabase.from("generation_requests").select("id, status, created_at, images(url), llm_responses(id, prompt_chain_step_id, response, processing_time_seconds, created_at)").eq("prompt_chain_id", id).order("created_at", { ascending: false }).limit(25),
    supabase.from("generation_requests").select("id", { count: "exact", head: true }).eq("prompt_chain_id", id),
  ]);
  if (!chainRes.data) notFound();
  const chain = chainRes.data;
  const steps = (stepsRes.data ?? []) as unknown as Step[];
  const lookups = { models: (modelsRes.data ?? []).filter((m) => !isImageModel(m)).map((m) => ({ value: String(m.id), label: m.name })) };
  const orderOf = new Map(steps.map((s) => [s.id, s.step_order]));
  const runs = (runsRes.data ?? []) as unknown as Run[];

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href="/" className="text-sm text-muted hover:underline">← All chains</Link>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{chain.slug}</h1>
          </div>
          <DeleteChainButton id={chain.id} slug={chain.slug} redirectTo="/" />
        </div>

        <EditChainForm id={chain.id} slug={chain.slug} description={chain.description} isPinned={chain.is_pinned} />
        <StepList chainId={chain.id} steps={steps} lookups={lookups} />
        <GeneratePanel chainId={chain.id} images={(imgRes.data ?? []).map((i) => ({ id: i.id, url: i.url as string }))} stepCount={steps.filter((s) => !s.is_hidden).length} />

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Media produced by this chain <span className="text-sm font-normal text-muted">({runCount.count ?? 0} run{runCount.count === 1 ? "" : "s"}{(runCount.count ?? 0) > 25 ? ", showing latest 25" : ""})</span></h2>
          {runs.length === 0 && <p className="card text-sm text-muted">Nothing generated yet. Run the chain above to see results here.</p>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {runs.map((r) => {
              const img = Array.isArray(r.images) ? r.images[0] : r.images;
              const url = img?.url && /^https?:\/\//.test(img.url) ? img.url : null;
              const resp = [...(r.llm_responses ?? [])].sort((a, b) => (orderOf.get(a.prompt_chain_step_id ?? -1) ?? 0) - (orderOf.get(b.prompt_chain_step_id ?? -1) ?? 0) || a.created_at.localeCompare(b.created_at));
              const final = resp[resp.length - 1]?.response;
              const lines = final ? parseCaptions(final) : [];
              return (
                <article key={r.id} className="card space-y-3">
                  {url ? <img src={url} alt="Source image" loading="lazy" className="aspect-video w-full rounded-lg border border-line object-cover" /> : <div className="grid aspect-video place-items-center rounded-lg border border-line text-xs text-muted">Image not available</div>}
                  <p className="text-xs text-muted">Run #{r.id} · {r.status} · {new Date(r.created_at).toLocaleString()}</p>
                  {lines.length > 0 ? <ul className="space-y-1.5 text-sm">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul> : <p className="text-sm text-muted">No output recorded.</p>}
                  {resp.length > 1 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-muted">Step-by-step output</summary>
                      <div className="mt-2 space-y-2">
                        {resp.map((x, i) => (
                          <div key={x.id} className="rounded-lg border border-line p-2">
                            <p className="text-xs text-muted">Step {orderOf.get(x.prompt_chain_step_id ?? -1) ?? i + 1}{x.processing_time_seconds != null && ` · ${x.processing_time_seconds}s`}</p>
                            <pre className="mt-1 whitespace-pre-wrap font-mono text-xs">{x.response}</pre>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}
