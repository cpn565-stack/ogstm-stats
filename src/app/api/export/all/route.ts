import { aggregateSubmissions } from "@/lib/aggregate";
import { requireAdminApi } from "@/lib/auth";
import {
  buildCsvHeaders,
  formatCsvRow,
  serializeCsvWithBom,
} from "@/lib/csv";
import { buildHistoryOverview, flattenSubmissionRows } from "@/lib/history";
import { getStoreSnapshot } from "@/lib/store";
import { getTemplate } from "@/lib/template";
import type { Submission } from "@/lib/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const snapshot = getStoreSnapshot();
  const template = getTemplate();
  const overview = buildHistoryOverview(snapshot);

  const submissionsBySession = new Map<string, Submission[]>();
  for (const sub of snapshot.submissions) {
    const bucket = submissionsBySession.get(sub.sessionId);
    if (bucket) {
      bucket.push(sub);
    } else {
      submissionsBySession.set(sub.sessionId, [sub]);
    }
  }

  const rows: string[] = [
    formatCsvRow([
      "課程",
      "日期",
      "組別",
      "題目",
      "選項",
      "贊成(綠)",
      "反對(紅)",
      "來源",
      "建立時間",
    ]),
  ];

  for (const item of overview.sessions) {
    const sessionSubs = (submissionsBySession.get(item.session.id) ?? []).sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    const stats = aggregateSubmissions(item.session, template, sessionSubs);
    const flatRows = flattenSubmissionRows(stats.submissions, stats);
    for (const row of flatRows) {
      for (const question of row.votesByQuestion) {
        for (const option of question.options) {
          rows.push(
            formatCsvRow([
              item.session.name,
              new Date(item.session.createdAt).toLocaleDateString("zh-TW"),
              row.submission.groupId,
              question.label,
              option.option,
              option.counts.green,
              option.counts.red,
              row.submission.source,
              row.submission.createdAt,
            ]),
          );
        }
      }
    }
  }

  rows.push("");
  rows.push(
    formatCsvRow([
      "題目",
      "選項",
      "歷史贊成(綠)",
      "歷史反對(紅)",
      "歷史總計",
      "贊成率",
      "出現場次數",
    ]),
  );
  for (const row of overview.historicalOptions) {
    rows.push(
      formatCsvRow([
        row.questionLabel,
        row.option,
        row.totalGreen,
        row.totalRed,
        row.totalVotes,
        `${row.greenRate}%`,
        row.sessionCount,
      ]),
    );
  }

  const csv = serializeCsvWithBom(rows);
  return new NextResponse(csv, {
    headers: buildCsvHeaders("ogstm_history_all.csv", "ogstm_history_all.csv"),
  });
}
