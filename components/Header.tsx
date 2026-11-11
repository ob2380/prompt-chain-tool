import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

export default function Header({ email }: { email?: string | null }) {
  return (
    <header className="border-b-[3px] border-[var(--ink)] bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="font-display text-lg font-semibold">Prompt Chain Tool</Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {email && (
            <form action="/auth/signout" method="post" className="flex items-center gap-2">
              <span className="hidden text-xs text-muted sm:inline">{email}</span>
              <button className="btn" type="submit">Sign out</button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
