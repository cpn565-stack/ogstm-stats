const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;
const MAX_BYTES = 1.5 * 1024 * 1024;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("無法讀取照片，請改用手動輸入"));
    };
    image.src = url;
  });
}

function scaleDimensions(width: number, height: number) {
  const longest = Math.max(width, height);
  if (longest <= MAX_EDGE) {
    return { width, height };
  }
  const ratio = MAX_EDGE / longest;
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

async function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("照片壓縮失敗"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

/** 壓縮手機大圖，避免上傳超過伺服器限制 */
export async function compressImageForUpload(file: File): Promise<{
  blob: Blob;
  mimeType: string;
}> {
  if (file.type === "image/jpeg" && file.size <= MAX_BYTES) {
    return { blob: file, mimeType: "image/jpeg" };
  }

  const image = await loadImageFromFile(file);
  const { width, height } = scaleDimensions(image.width, image.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("瀏覽器不支援照片處理");
  }

  ctx.drawImage(image, 0, 0, width, height);

  let quality = JPEG_QUALITY;
  let blob = await canvasToJpegBlob(canvas, quality);

  while (blob.size > MAX_BYTES && quality > 0.45) {
    quality -= 0.08;
    blob = await canvasToJpegBlob(canvas, quality);
  }

  return { blob, mimeType: "image/jpeg" };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}