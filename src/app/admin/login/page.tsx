import { AdminLoginForm } from "@/components/AdminLoginForm";
import { getAdminSession } from "@/lib/auth";
import { sanitizeNextPath } from "@/lib/paths";
import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function AdminLoginPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  if (await getAdminSession()) {
    redirect(sanitizeNextPath(next, "/admin"));
  }

  return (
    <main className="mx-auto max-w-md space-y-6 py-10">
      <header className="space-y-2 text-center">
        <p className="text-sm font-medium text-emerald-400">後台登入</p>
        <h1 className="text-2xl font-bold text-slate-50">OGSTM Stats</h1>
        <p className="text-sm text-slate-400">僅團隊內部使用</p>
      </header>
      <AdminLoginForm nextPath={next} mode="admin" />
    </main>
  );
}
