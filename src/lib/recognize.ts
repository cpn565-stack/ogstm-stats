import type {
  CheckboxROI,
  SubmissionVotes,
  ThinkingMapTemplate,
  VoteCounts,
} from "./types";
import { emptyVoteCounts, emptyVotes } from "./template";

interface RGB {
  r: number;
  g: number;
  b: number;
}

function rgbToHsv({ r, g, b }: RGB) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v };
}

function isGreen(rgb: RGB) {
  const { h, s, v } = rgbToHsv(rgb);
  return s > 0.2 && v > 0.2 && h >= 70 && h <= 170;
}

function isRed(rgb: RGB) {
  const { h, s, v } = rgbToHsv(rgb);
  return s > 0.2 && v > 0.2 && (h <= 20 || h >= 330);
}

function sampleRegion(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  roi: [number, number, number, number],
) {
  const [x, y, w, h] = roi;
  const sx = Math.floor(x * width);
  const sy = Math.floor(y * height);
  const sw = Math.max(1, Math.floor(w * width));
  const sh = Math.max(1, Math.floor(h * height));
  const data = ctx.getImageData(sx, sy, sw, sh).data;

  let green = 0;
  let red = 0;
  let total = 0;

  for (let i = 0; i < data.length; i += 4) {
    const rgb = { r: data[i], g: data[i + 1], b: data[i + 2] };
    if (isGreen(rgb)) green += 1;
    if (isRed(rgb)) red += 1;
    total += 1;
  }

  return {
    greenRatio: total > 0 ? green / total : 0,
    redRatio: total > 0 ? red / total : 0,
  };
}

function countMarks(ratio: number) {
  if (ratio < 0.04) return 0;
  if (ratio < 0.12) return 1;
  if (ratio < 0.22) return 2;
  return 3;
}

export async function recognizeFromImage(
  file: File,
  template: ThinkingMapTemplate,
  questionId?: string,
): Promise<{ votes: SubmissionVotes; confidence: number }> {
  const votes = emptyVotes(template);
  const rois = template.rois ?? {};

  if (Object.keys(rois).length === 0) {
    return { votes, confidence: 0 };
  }

  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { votes, confidence: 0 };
  }

  ctx.drawImage(image, 0, 0);
  let checks = 0;
  let confident = 0;

  const questions = questionId
    ? template.questions.filter((question) => question.id === questionId)
    : template.questions;

  for (const question of questions) {
    const questionRois = rois[question.id];
    if (!questionRois) continue;

    for (const option of question.options) {
      const optionRoi = questionRois[option] as CheckboxROI | undefined;
      if (!optionRoi) continue;

      const greenSample = sampleRegion(
        ctx,
        canvas.width,
        canvas.height,
        optionRoi.green,
      );
      const redSample = sampleRegion(
        ctx,
        canvas.width,
        canvas.height,
        optionRoi.red,
      );

      const green = countMarks(greenSample.greenRatio);
      const red = countMarks(redSample.redRatio);
      votes[question.id][option] = { green, red };

      checks += 1;
      const spread = Math.abs(greenSample.greenRatio - redSample.redRatio);
      if (spread > 0.05 || (green === 0 && red === 0)) confident += 1;
    }
  }

  const confidence = checks > 0 ? confident / checks : 0;
  return { votes, confidence };
}

export async function recognizeQuestionFromImage(
  file: File,
  template: ThinkingMapTemplate,
  questionId: string,
): Promise<{ votes: VoteCounts; confidence: number }> {
  const question = template.questions.find((item) => item.id === questionId);
  if (!question) {
    return { votes: {}, confidence: 0 };
  }

  const result = await recognizeFromImage(file, template, questionId);
  return {
    votes: result.votes[questionId] ?? emptyVoteCounts(question),
    confidence: result.confidence,
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("無法載入圖片"));
    };
    image.src = url;
  });
}