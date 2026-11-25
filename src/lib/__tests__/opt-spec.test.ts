import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { aggregateSubmissions } from "@/lib/aggregate";
import { buildHistoryOverview, buildPublicSummary } from "@/lib/history";
import {
  extractJsonObject,
  normalizeVotes,
  parseUpstreamJson,
} from "@/lib/llm-recognize-shared";
import { buildQuestionPresentation } from "@/lib/presenter";
import { createSession, getStoreSnapshot, upsertSubmission } from "@/lib/store";
import { getTemplate } from "@/lib/template";
import { buildVertexResponseSchema } from "@/lib/vertex-recognize";

let tempDir = "";
let previousDataDir: string | undefined;

beforeEach(() => {
  previousDataDir = process.env.OGSTM_DATA_DIR;
  tempDir = mkdtempSync(path.join(os.tmpdir(), "ogstm-opt-test-"));
  process.env.OGSTM_DATA_DIR = tempDir;
});

afterEach(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  if (previousDataDir === undefined) {
    delete process.env.OGSTM_DATA_DIR;
  } else {
    process.env.OGSTM_DATA_DIR = previousDataDir;
  }
});

describe("OPT-04 & OPT-08: Template G/T semantic labels and single-snapshot history aggregation", () => {
  it("aligns vote_1 redLabel to 最易忽略 and vote_2 redLabel to 最不易執行 across stats and public summary", () => {
    const template = getTemplate();
    const q1 = template.questions.find((q) => q.id === "vote_1");
    const q2 = template.questions.find((q) => q.id === "vote_2");

    assert.equal(q1?.greenLabel, "最重要");
    assert.equal(q1?.redLabel, "最易忽略");
    assert.equal(q2?.greenLabel, "最重要");
    assert.equal(q2?.redLabel, "最不易執行");

    const session = createSession("策略實戰班", template.id);
    upsertSubmission({
      sessionId: session.id,
      groupId: "1",
      votes: {
        vote_1: { a: { green: 1, red: 0 }, b: { green: 0, red: 1 } },
        vote_2: { c: { green: 1, red: 0 }, d: { green: 0, red: 1 } },
      },
      source: "manual",
    });

    const snapshot = getStoreSnapshot();
    const overview = buildHistoryOverview(snapshot);
    assert.equal(overview.totalSessions, 1);
    assert.equal(overview.totalSubmissions, 1);

    const rowVote1A = overview.historicalOptions.find(
      (r) => r.questionId === "vote_1" && r.option === "a",
    );
    assert.equal(rowVote1A?.optionLabel, "充分詮釋訂定的 Objective");

    const publicSummary = buildPublicSummary(snapshot);
    const pubQ2 = publicSummary.questions.find((q) => q.questionId === "vote_2");
    assert.equal(pubQ2?.redLabel, "最不易執行");
    assert.ok(
      publicSummary.highlights.some((line) => line.includes("最不易執行")),
    );
  });
});

describe("OPT-06: LLM upstream HTML/non-JSON resilience, schema generation, and dual-check normalization", () => {
  it("converts upstream HTML 502/504/429 into clean Chinese error messages without SyntaxError leaks", () => {
    assert.throws(
      () =>
        parseUpstreamJson("<html><body>502 Bad Gateway</body></html>", 502, "OpenRouter"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("502"));
        assert.ok(!err.message.includes("Unexpected token"));
        return true;
      },
    );

    assert.throws(
      () => parseUpstreamJson("Too Many Requests", 429, "OpenRouter"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("429"));
        return true;
      },
    );
  });

  it("extracts JSON from fenced blocks, caps dual-checked confidence <= 0.55, and builds Vertex responseSchema", () => {
    const extracted = extractJsonObject(
      'Here is the result:\n```json\n{"votes":{"a":{"green":1,"red":1}},"confidence":0.95,"notes":"dual check"}\n```',
    );
    const question = getTemplate().questions[1]!;
    const normalized = normalizeVotes(question, extracted);
    assert.deepEqual(normalized.votes.a, { green: 1, red: 1 });
    assert.deepEqual(normalized.votes.b, { green: 0, red: 0 });
    assert.equal(normalized.confidence, 0.55);
    assert.equal(normalized.notes, "dual check");

    const schema = buildVertexResponseSchema(["a", "b"]);
    assert.equal(schema.type, "OBJECT");
    assert.deepEqual(schema.properties.votes.required, ["a", "b"]);
  });
});

describe("OPT-10: Presenter competition ranking with ties at 5th place", () => {
  it("assigns standard competition ranks (1, 1, 3...) and includes all options tied at the 5th cutoff", () => {
    const template = getTemplate();
    const session = createSession("排名測試", template.id);
    const stats = aggregateSubmissions(session, template, [
      {
        id: "s1",
        sessionId: session.id,
        groupId: "1",
        source: "manual",
        createdAt: "",
        updatedAt: "",
        votes: {
          vote_2: {
            a: { green: 1, red: 0 },
            b: { green: 1, red: 0 },
            c: { green: 1, red: 0 },
            d: { green: 1, red: 0 },
            e: { green: 1, red: 0 },
            f: { green: 1, red: 0 },
          },
        },
      },
      {
        id: "s2",
        sessionId: session.id,
        groupId: "2",
        source: "manual",
        createdAt: "",
        updatedAt: "",
        votes: {
          vote_2: {
            a: { green: 1, red: 0 },
            b: { green: 1, red: 0 },
          },
        },
      },
    ]);

    const presentation = buildQuestionPresentation(stats.questions[1]!);
    // a=2, b=2 (tied rank 1), c=1, d=1, e=1, f=1 (all 4 tied at rank 3 -> all 6 included!)
    assert.equal(presentation.top5Green.length, 6);
    assert.equal(presentation.top5Green[0]?.rank, 1);
    assert.equal(presentation.top5Green[0]?.tied, true);
    assert.equal(presentation.top5Green[2]?.rank, 3);
    assert.equal(presentation.top5Green[2]?.tied, true);
  });
});
