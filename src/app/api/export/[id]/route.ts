import { aggregateSubmissions } from "@/lib/aggregate";
import { requireOpsApi } from "@/lib/auth";
import {
  buildCsvHeaders,
  formatCsvRow,
  sanitizeUtf8FilenameStem,
  serializeCsvWithBom,
} from "@/lib/csv";
import { getSession, listSubmissions } from "@/lib/store";
import { getTemplate } from "@/lib/template";
import { NextResponse } from "next/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext) {
  const denied = await requireOpsApi(request);
  if (denied) return denied;

  const { id } = await context.params;
  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "找不到課程" }, { status: 404 });
  }

  const template = getTemplate();
  const submissions = listSubmissions(id);
  const stats = aggregateSubmissions(session, template, submissions);

  const rows: string[] = [
    formatCsvRow([
      "課程",
      "組別",
      "題目",
      "選項",
      "贊成(綠)",
      "反對(紅)",
      "來源",
      "信心分數",
    ]),
  ];

  for (const submission of stats.submissions) {
    for (const question of template.questions) {
      for (const option of question.options) {
        const counts = submission.votes[question.id]?.[option] ?? {
          green: 0,
          red: 0,
        };
        rows.push(
          formatCsvRow([
            session.name,
            submission.groupId,
            question.label,
            option,
            counts.green,
            counts.red,
            submission.source,
            submission.confidence !== undefined
              ? submission.confidence.toFixed(2)
              : "",
          ]),
        );
      }
    }
  }

  rows.push("");
  rows.push(
    formatCsvRow(["題目", "選項", "贊成(綠)", "反對(紅)", "總計", "贊成率"]),
  );
  for (const question of stats.questions) {
    for (const option of question.options) {
      rows.push(
        formatCsvRow([
          question.label,
          option.option,
          option.green,
          option.red,
          option.total,
          `${option.greenRate}%`,
        ]),
      );
    }
  }

  const csv = serializeCsvWithBom(rows);
  const shortId = id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 8) || "session";
  const asciiFilename = `session_${shortId}_stats.csv`;
  const utf8Stem = sanitizeUtf8FilenameStem(session.name, `session_${shortId}`);
  const utf8Filename = `${utf8Stem}_stats.csv`;

  return new NextResponse(csv, {
    headers: buildCsvHeaders(asciiFilename, utf8Filename),
  });
}
