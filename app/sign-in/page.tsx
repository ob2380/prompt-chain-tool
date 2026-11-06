"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";

const passwordLogin = process.env.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN === "1";

export default function SignIn() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function google() {
    setBusy(true);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) { setError(error.message); setBusy(false); }
  }

  async function password(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await createClient().auth.signInWithPassword({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    if (error) { setError(error.message); setBusy(false); } else { router.push("/"); router.refresh(); }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      <div className="flex justify-end"><ThemeToggle /></div>
      <div className="card space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Prompt Chain Tool</h1>
          <p className="text-sm text-muted">Superadmins only. Sign in to continue.</p>
        </div>
        <button className="btn btn-primary w-full" onClick={google} disabled={busy}>Continue with Google</button>
        {passwordLogin && (
          <form onSubmit={password} className="space-y-2 border-t border-line pt-4">
            <input className="input" name="email" type="email" placeholder="Email" required />
            <input className="input" name="password" type="password" placeholder="Password" required />
            <button className="btn w-full" disabled={busy}>Sign in with email</button>
          </form>
        )}
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </main>
  );
}
