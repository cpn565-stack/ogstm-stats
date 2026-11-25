"use client";

import { readJsonResponse } from "@/lib/fetch-json";
import { apiPath, sanitizeNextPath } from "@/lib/paths";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface AdminLoginFormProps {
  nextPath?: string;
  mode?: "admin" | "ops";
}

export function AdminLoginForm({
  nextPath,
  mode = "admin",
}: AdminLoginFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const endpoint = apiPath(
    mode === "ops" ? "/api/ops/login" : "/api/admin/login",
  );
  const fallbackPath = mode === "ops" ? "/ops" : "/admin";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await readJsonResponse<{ ok?: boolean; error?: string }>(
        response,
      );

      if (!response.ok) {
        setError(data.error ?? "登入失敗");
        return;
      }

      router.push(sanitizeNextPath(nextPath, fallbackPath));
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "網路連線異常，請稍後再試",
      );
    } finally {
      setLoading(false);
    }
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
