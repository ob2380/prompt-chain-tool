import Link from "next/link";
import { getAdminContext } from "@/lib/auth";
import Header from "@/components/Header";
import AccessDenied from "@/components/AccessDenied";
import { CreateChainForm, DeleteChainButton } from "@/components/ChainForms";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { supabase, user, isSuperadmin } = await getAdminContext();
  if (!user || !isSuperadmin) return <AccessDenied email={user?.email} />;

  const q = String((await searchParams).q ?? "").trim();
  const safe = q.replace(/[%,()]/g, "");
  let query = supabase.from("prompt_chains").select("id, slug, description, is_pinned").order("is_pinned", { ascending: false }).order("id", { ascending: false });
  if (safe) query = query.or(`slug.ilike.%${safe}%,description.ilike.%${safe}%`);
  const [{ data: chains, error }, { data: stepRows }, { data: runRows }] = await Promise.all([
    query,
    supabase.from("prompt_chain_steps").select("prompt_chain_id").limit(5000),
    supabase.from("generation_requests").select("prompt_chain_id").limit(5000),
  ]);
  const count = (rows: { prompt_chain_id: number | null }[] | null) => {
    const m = new Map<number, number>();
    (rows ?? []).forEach((r) => r.prompt_chain_id != null && m.set(r.prompt_chain_id, (m.get(r.prompt_chain_id) ?? 0) + 1));
    return m;
  };
  const steps = count(stepRows);
  const runs = count(runRows);

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Prompt chains</h1>
          <p className="text-sm text-muted">Each chain is an ordered list of LLM steps. Open one to edit steps, reorder them, run it on an image, and see what it produced.</p>
        </div>
        <CreateChainForm />
        <form className="flex gap-2" role="search">
          <input name="q" defaultValue={q} className="input max-w-sm" placeholder="Search chains…" aria-label="Search chains" />
          <button className="btn">Search</button>
          {q && <Link className="btn" href="/">Clear</Link>}
        </form>
        {error && <p role="alert" className="text-sm text-red-600">{error.message}</p>}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(chains ?? []).map((c) => (
            <li key={c.id} className="card flex flex-col justify-between gap-3">
              <Link href={`/chains/${c.id}`} className="block">
                <p className="font-medium hover:underline">{c.is_pinned && "📌 "}{c.slug}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{c.description || "No description"}</p>
              </Link>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{steps.get(c.id) ?? 0} step{steps.get(c.id) === 1 ? "" : "s"} · {runs.get(c.id) ?? 0} run{runs.get(c.id) === 1 ? "" : "s"}</span>
                <DeleteChainButton id={c.id} slug={c.slug} />
              </div>
            </li>
          ))}
        </ul>
        {(chains ?? []).length === 0 && <p className="card text-sm text-muted">{q ? "No chains match that search." : "No chains yet — create one above."}</p>}
      </main>
    </>
  );
}
