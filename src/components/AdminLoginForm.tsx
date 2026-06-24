"use client";

import { apiPath, appPath } from "@/lib/paths";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminLoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch(apiPath("/api/admin/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    setLoading(false);

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? "登入失敗");
      return;
    }

    router.push(appPath(nextPath?.startsWith("/") ? nextPath : "/admin"));
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-slate-700/80 bg-slate-900/50 p-6"
    >
      <label className="block space-y-2">
        <span className="text-sm text-slate-400">密碼</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none ring-emerald-500/40 focus:ring-2"
          autoComplete="current-password"
          required
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="w-full cursor-pointer rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
      >
        {loading ? "登入中…" : "登入"}
      </button>
      {error && <p className="text-sm text-rose-300">{error}</p>}
    </form>
  );
}