import {
  buildHistoryOverview,
  flattenSubmissionRows,
  getSessionStats,
} from "@/lib/history";
import { NextResponse } from "next/server";

export async function GET() {
  const overview = buildHistoryOverview();
  const lines = [
    "課程,日期,組別,題目,選項,贊成(綠),反對(紅),來源,建立時間",
  ];

  for (const item of overview.sessions) {
    const stats = getSessionStats(item.session.id);
    if (!stats) continue;
    const rows = flattenSubmissionRows(stats.submissions, stats);
    for (const row of rows) {
      for (const question of row.votesByQuestion) {
        for (const option of question.options) {
          lines.push(
            [
              item.session.name,
              new Date(item.session.createdAt).toLocaleDateString("zh-TW"),
              row.submission.groupId,
              question.label,
              option.option,
              option.counts.green,
              option.counts.red,
              row.submission.source,
              row.submission.createdAt,
            ].join(","),
          );
        }
      }
    }
  }

  lines.push("");
  lines.push("題目,選項,歷史贊成(綠),歷史反對(紅),歷史總計,贊成率,出現場次數");
  for (const row of overview.historicalOptions) {
    lines.push(
      [
        row.questionLabel,
        row.option,
        row.totalGreen,
        row.totalRed,
        row.totalVotes,
        `${row.greenRate}%`,
        row.sessionCount,
      ].join(","),
    );
  }

  const csv = `\uFEFF${lines.join("\n")}`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ogstm_history_all.csv"',
    },
  });
}