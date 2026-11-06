import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminContext } from "@/lib/auth";
import Header from "@/components/Header";
import AccessDenied from "@/components/AccessDenied";
import { EditFlavorForm, DeleteFlavorButton } from "@/components/FlavorForms";
import StepList from "@/components/StepList";
import GeneratePanel from "@/components/GeneratePanel";
import type { Step } from "@/components/StepEditor";

export const dynamic = "force-dynamic";

type CaptionRow = {
  id: string; content: string | null; image_id: string; created_datetime_utc: string; like_count: number;
  images: { url: string | null } | { url: string | null }[] | null;
};

export default async function FlavorPage({ params }: PageProps<"/flavors/[id]">) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();

  const { supabase, user, isSuperadmin } = await getAdminContext();
  if (!user || !isSuperadmin) return <AccessDenied email={user?.email} />;

  const [flavorRes, stepsRes, modelsRes, inRes, outRes, typeRes, imgRes, capRes, capCount] = await Promise.all([
    supabase.from("humor_flavors").select("id, slug, description").eq("id", id).maybeSingle(),
    supabase.from("humor_flavor_steps").select("id, order_by, description, llm_system_prompt, llm_user_prompt, llm_temperature, llm_model_id, llm_input_type_id, llm_output_type_id, humor_flavor_step_type_id").eq("humor_flavor_id", id).order("order_by").order("id"),
    supabase.from("llm_models").select("id, name").order("id"),
    supabase.from("llm_input_types").select("id, slug").order("id"),
    supabase.from("llm_output_types").select("id, slug").order("id"),
    supabase.from("humor_flavor_step_types").select("id, slug").order("id"),
    supabase.from("images").select("id, url").eq("is_common_use", true).not("url", "is", null).order("created_datetime_utc", { ascending: false }).limit(30),
    supabase.from("captions").select("id, content, image_id, created_datetime_utc, like_count, images(url)").eq("humor_flavor_id", id).order("created_datetime_utc", { ascending: false }).limit(120),
    supabase.from("captions").select("id", { count: "exact", head: true }).eq("humor_flavor_id", id),
  ]);
  if (!flavorRes.data) notFound();
  const flavor = flavorRes.data;
  const steps = (stepsRes.data ?? []) as unknown as Step[];
  const lookups = {
    models: (modelsRes.data ?? []).map((m) => ({ id: m.id, label: m.name })),
    inputTypes: (inRes.data ?? []).map((m) => ({ id: m.id, label: m.slug })),
    outputTypes: (outRes.data ?? []).map((m) => ({ id: m.id, label: m.slug })),
    stepTypes: (typeRes.data ?? []).map((m) => ({ id: m.id, label: m.slug })),
  };

  // group generated captions by image
  const groups = new Map<string, { url: string | null; captions: CaptionRow[] }>();
  for (const c of (capRes.data ?? []) as unknown as CaptionRow[]) {
    const img = Array.isArray(c.images) ? c.images[0] : c.images;
    const g = groups.get(c.image_id) ?? { url: img?.url ?? null, captions: [] };
    g.captions.push(c);
    groups.set(c.image_id, g);
  }

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href="/" className="text-sm text-muted hover:underline">← All chains</Link>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{flavor.slug}</h1>
          </div>
          <DeleteFlavorButton id={flavor.id} slug={flavor.slug} redirectTo="/" />
        </div>

        <EditFlavorForm id={flavor.id} slug={flavor.slug} description={flavor.description} />
        <StepList flavorId={flavor.id} steps={steps} lookups={lookups} />
        <GeneratePanel flavorId={flavor.id} images={(imgRes.data ?? []).map((i) => ({ id: i.id, url: i.url as string }))} stepCount={steps.length} />

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Media produced by this chain <span className="text-sm font-normal text-muted">({capCount.count ?? 0} captions{(capCount.count ?? 0) > 120 ? ", showing latest 120" : ""})</span></h2>
          {groups.size === 0 && <p className="card text-sm text-muted">Nothing generated yet. Run the chain above to see captions here.</p>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...groups.entries()].map(([imageId, g]) => (
              <article key={imageId} className="card space-y-3">
                {g.url && <img src={g.url} alt="Source image" loading="lazy" className="aspect-video w-full rounded-lg border border-line object-cover" />}
                <ul className="space-y-1.5 text-sm">
                  {g.captions.map((c) => (
                    <li key={c.id} className="flex justify-between gap-2"><span>{c.content}</span><span className="shrink-0 text-xs text-muted">♥ {c.like_count}</span></li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
