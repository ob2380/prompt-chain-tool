import Link from "next/link";
import { getAdminContext } from "@/lib/auth";
import Header from "@/components/Header";
import AccessDenied from "@/components/AccessDenied";
import { CreateFlavorForm, DeleteFlavorButton } from "@/components/FlavorForms";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { supabase, user, isSuperadmin } = await getAdminContext();
  if (!user || !isSuperadmin) return <AccessDenied email={user?.email} />;

  const q = String((await searchParams).q ?? "").trim();
  let query = supabase.from("humor_flavors").select("id, slug, description, created_datetime_utc").order("id", { ascending: false });
  if (q) query = query.or(`slug.ilike.%${q.replace(/[%,()]/g, "")}%,description.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const [{ data: flavors, error }, { data: stepRows }] = await Promise.all([
    query,
    supabase.from("humor_flavor_steps").select("humor_flavor_id").limit(5000),
  ]);
  const counts = new Map<number, number>();
  (stepRows ?? []).forEach((r) => counts.set(r.humor_flavor_id, (counts.get(r.humor_flavor_id) ?? 0) + 1));

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Prompt chains</h1>
          <p className="text-sm text-muted">Each chain is an ordered list of LLM steps. Open one to edit steps, reorder them, run it, and see what it produced.</p>
        </div>
        <CreateFlavorForm />
        <form className="flex gap-2" role="search">
          <input name="q" defaultValue={q} className="input max-w-sm" placeholder="Search chains…" aria-label="Search chains" />
          <button className="btn">Search</button>
          {q && <Link className="btn" href="/">Clear</Link>}
        </form>
        {error && <p role="alert" className="text-sm text-red-600">{error.message}</p>}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(flavors ?? []).map((f) => (
            <li key={f.id} className="card flex flex-col justify-between gap-3">
              <Link href={`/flavors/${f.id}`} className="block">
                <p className="font-medium hover:underline">{f.slug}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{f.description || "No description"}</p>
              </Link>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{counts.get(f.id) ?? 0} step{counts.get(f.id) === 1 ? "" : "s"}</span>
                <DeleteFlavorButton id={f.id} slug={f.slug} />
              </div>
            </li>
          ))}
        </ul>
        {(flavors ?? []).length === 0 && <p className="card text-sm text-muted">{q ? "No chains match that search." : "No chains yet — create one above."}</p>}
      </main>
    </>
  );
}
