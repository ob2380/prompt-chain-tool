"use client";
import { useEffect, useState } from "react";

type Mode = "light" | "dark" | "system";

function apply(mode: Mode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    const saved = (localStorage.getItem("theme") as Mode | null) ?? "system";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(saved);
  }, []);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  function choose(next: Mode) {
    setMode(next);
    try { localStorage.setItem("theme", next); } catch {}
    apply(next);
  }

  return (
    <div className="inline-flex rounded-lg border border-line p-0.5 text-xs" role="group" aria-label="Theme">
      {(["light", "system", "dark"] as Mode[]).map((m) => (
        <button
          key={m}
          onClick={() => choose(m)}
          aria-pressed={mode === m}
          className={`rounded-md px-2.5 py-1 capitalize ${mode === m ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
