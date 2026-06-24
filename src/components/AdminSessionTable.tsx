import type { SessionListItem } from "@/lib/history";
import { apiPath } from "@/lib/paths";
import Link from "next/link";

interface AdminSessionTableProps {
  sessions: SessionListItem[];
}

export function AdminSessionTable({ sessions }: AdminSessionTableProps) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-slate-400">尚無歷史場次資料。建立課程並輸入各組票數後，資料會自動保留。</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700/80">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-900/80 text-left text-slate-400">
          <tr>
            <th className="px-4 py-3 font-medium">課程名稱</th>
            <th className="px-4 py-3 font-medium">日期</th>
            <th className="px-4 py-3 font-medium">組數</th>
            <th className="px-4 py-3 font-medium">最多贊成選項</th>
            <th className="px-4 py-3 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((item) => (
            <tr key={item.session.id} className="border-t border-slate-800/80">
              <td className="px-4 py-3 font-medium text-slate-100">
                {item.session.name}
              </td>
              <td className="px-4 py-3 text-slate-400">
                {new Date(item.session.createdAt).toLocaleString("zh-TW")}
              </td>
              <td className="px-4 py-3">{item.submissionCount} 組</td>
              <td className="px-4 py-3 font-mono text-emerald-300">
                {Object.entries(item.topApproved)
                  .filter(([, value]) => value)
                  .map(([questionId, value]) => `${questionId}:${value}`)
                  .join(" · ") || "—"}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-3">
                  <Link
                    href={`/admin/sessions/${item.session.id}`}
                    className="cursor-pointer text-emerald-400 transition hover:text-emerald-300"
                  >
                    詳細
                  </Link>
                  <a
                    href={apiPath(`/api/export/${item.session.id}`)}
                    className="cursor-pointer text-slate-400 transition hover:text-slate-200"
                  >
                    匯出
                  </a>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}