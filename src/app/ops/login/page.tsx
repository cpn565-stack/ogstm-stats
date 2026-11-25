import { AdminLoginForm } from "@/components/AdminLoginForm";
import { getOpsSession } from "@/lib/auth";
import { sanitizeNextPath } from "@/lib/paths";
import Link from "next/link";
import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function OpsLoginPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  if (await getOpsSession()) {
    redirect(sanitizeNextPath(next, "/ops"));
  }

  return (
    <main className="mx-auto max-w-md space-y-6 py-10">
      <header className="space-y-2 text-center">
        <p className="text-sm font-medium text-emerald-400">課程營運登入</p>
        <h1 className="text-2xl font-bold text-slate-50">OGSTM Stats</h1>
        <p className="text-sm text-slate-400">
          請輸入助教營運密碼以進入課程建立與票數登錄
        </p>
      </header>
      <AdminLoginForm nextPath={next} mode="ops" />
      <p className="text-center text-xs text-slate-500">
        <Link href="/" className="hover:text-slate-300">
          ← 返回公開統計首頁
        </Link>
      </p>
    </main>
  );
}
