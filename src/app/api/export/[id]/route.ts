import { aggregateSubmissions } from "@/lib/aggregate";
import { getSession, listSubmissions } from "@/lib/store";
import { getTemplate } from "@/lib/template";
import { NextResponse } from "next/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "找不到課程" }, { status: 404 });
  }

  const template = getTemplate();
  const submissions = listSubmissions(id);
  const stats = aggregateSubmissions(session, template, submissions);

  const lines = ["課程,組別,題目,選項,贊成(綠),反對(紅),來源,信心分數"];

  for (const submission of stats.submissions) {
    for (const question of template.questions) {
      for (const option of question.options) {
        const counts = submission.votes[question.id]?.[option] ?? {
          green: 0,
          red: 0,
        };
        lines.push(
          [
            session.name,
            submission.groupId,
            question.label,
            option,
            counts.green,
            counts.red,
            submission.source,
            submission.confidence?.toFixed(2) ?? "",
          ].join(","),
        );
      }
    }
  }

  lines.push("");
  lines.push("題目,選項,贊成(綠),反對(紅),總計,贊成率");
  for (const question of stats.questions) {
    for (const option of question.options) {
      lines.push(
        [
          question.label,
          option.option,
          option.green,
          option.red,
          option.total,
          `${option.greenRate}%`,
        ].join(","),
      );
    }
  }

  const csv = `\uFEFF${lines.join("\n")}`;
  const filename = `${session.name.replace(/[^\w\u4e00-\u9fff-]+/g, "_")}_stats.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}