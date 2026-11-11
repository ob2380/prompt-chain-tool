import Header from "./Header";

export default function AccessDenied({ email }: { email?: string | null }) {
  return (
    <>
      <Header email={email} />
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">Superadmins only</h1>
        <p className="mt-2 text-sm text-muted">
          {email ?? "This account"} isn&apos;t a superadmin (<code>profiles.is_superadmin</code> must be TRUE), so the prompt chain tool is locked.
        </p>
      </main>
    </>
  );
}
